const Joi = require("joi")

const emptyObject = Joi.object({}).unknown(false)

const mongoId = Joi.string()
    .trim()
    .pattern(/^[a-f\d]{24}$/i)

const externalId = Joi.alternatives().try(
    Joi.string().trim().min(1).max(100),
    Joi.number().integer()
)

const entityReference = Joi.object({
    id: externalId.required(),
    name: Joi.string().trim().min(1).max(255).required(),
}).unknown(true)

const score = Joi.number().integer().min(0).max(24)

const seed = Joi.alternatives().try(
    Joi.string().trim().min(1).max(10),
    Joi.number().integer().min(1)
)

const group = Joi.string()
    .trim()
    .uppercase()
    .valid("A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L")

const tournamentParams = Joi.object({
    tournament: mongoId.required(),
}).unknown(false)

const matchParams = Joi.object({
    tournament: mongoId.required(),
    match: mongoId.required(),
}).unknown(false)

const tournamentBody = Joi.object({
    cloudinary_id: Joi.string().trim().max(255).allow(null, "").optional(),
    format: Joi.string()
        .valid(
            "champions_league",
            "league",
            "league_playin_playoff",
            "playoff",
            "super_cup",
            "world_cup",
            "world_cup_2026"
        )
        .required(),
    name: Joi.string().trim().min(1).max(100).required(),
    players: Joi.array().items(entityReference).min(1).required(),
    teams: Joi.array()
        .items(
            Joi.object({
                team: entityReference.required(),
                player: entityReference.required(),
                group: group.optional(),
                playoff_id: Joi.number().integer().min(1).optional(),
            }).unknown(true)
        )
        .min(1)
        .required(),
}).unknown(false)

const updateMatchBody = Joi.object({
    playerP1: entityReference.required(),
    teamP1: entityReference.required(),
    seedP1: seed.optional(),
    scoreP1: score.required(),
    penaltyScoreP1: score.optional(),
    playerP2: entityReference.required(),
    teamP2: entityReference.required(),
    seedP2: seed.optional(),
    scoreP2: score.required(),
    penaltyScoreP2: score.optional(),
    valid: Joi.boolean().optional(),
})
    .unknown(false)
    .custom((value, helpers) => {
        const hasSeedP1 = value.seedP1 !== undefined
        const hasSeedP2 = value.seedP2 !== undefined
        const hasPenaltyP1 = value.penaltyScoreP1 !== undefined
        const hasPenaltyP2 = value.penaltyScoreP2 !== undefined

        if (hasSeedP1 !== hasSeedP2 || hasPenaltyP1 !== hasPenaltyP2) {
            return helpers.error("any.invalid")
        }

        if (!hasSeedP1 && (hasPenaltyP1 || hasPenaltyP2)) {
            return helpers.error("any.invalid")
        }

        if (hasSeedP1 && value.scoreP1 === value.scoreP2) {
            if (
                !hasPenaltyP1 ||
                value.penaltyScoreP1 === value.penaltyScoreP2
            ) {
                return helpers.error("any.invalid")
            }
        }

        return value
    })

const isValidCalendarDate = (value, helpers) => {
    const [year, month, day] = value.split("-").map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))

    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return helpers.error("date.format")
    }

    return value
}

const fixturePlayerIds = Joi.array().items(externalId).min(1).max(2).unique()

const calculatorTeamIds = Joi.array().items(externalId).min(1).max(40).unique()

// Contrato actual: params repetidos (`?teams=a&teams=b`), que Express ya parsea
// como array; un solo valor llega como string y `single()` lo envuelve.
//
// Cualquier valor que empiece con "[" se interpreta como el formato deprecado:
// los bundles viejos del FE mandan el array serializado en JSON. Se sigue
// aceptando durante la transición, pero si el JSON está mal formado o viola los
// límites responde 400 en lugar de degradar a "un id raro", así que no se pierde
// validación. El costo es que un ID que empiece con "[" queda rechazado; ningún
// ID real lo hace, y la restricción desaparece cuando se retire la rama.
const looksLikeSerializedArray = (raw) =>
    typeof raw === "string" && raw.trimStart().startsWith("[")

const idListQuery = (itemsSchema, maxRawLength) =>
    Joi.any().custom((raw, helpers) => {
        let candidate = raw

        if (looksLikeSerializedArray(raw)) {
            if (raw.length > maxRawLength) return helpers.error("any.invalid")

            try {
                candidate = JSON.parse(raw)
            } catch (error) {
                return helpers.error("any.invalid")
            }
        }

        const { value, error } = itemsSchema.single().validate(candidate, {
            abortEarly: false,
            convert: true,
        })

        return error ? helpers.error("any.invalid") : value
    })

const fixturePlayersQuery = idListQuery(fixturePlayerIds, 500)

const calculatorTeamsQuery = idListQuery(calculatorTeamIds, 1000)

const calendarDate = Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .custom(isValidCalendarDate)

// El listado histórico acepta "all" y "" como "sin filtro" porque el FE
// mantiene esos valores en la URL; el DAO ya los interpreta así.
const optionalIdFilter = Joi.alternatives().try(
    mongoId,
    Joi.string().valid("all", "")
)

module.exports = {
    getMatches: {
        query: Joi.object({
            // Paginación en base 1 en toda la API, igual que /api/edits.
            page: Joi.number().integer().min(1).max(10000).default(1),
            teamName: Joi.string().trim().min(1).max(100).allow("").optional(),
            player1: optionalIdFilter.optional(),
            player2: optionalIdFilter.optional(),
            tournamentId: optionalIdFilter.optional(),
            type: Joi.string()
                .valid("all", "regular", "knockout", "playin", "playoff")
                .optional(),
            outcome: Joi.string()
                .valid("all", "win", "draw", "loss", "penalties")
                .optional(),
            goalDiffOp: Joi.string().valid("gte", "lte", "eq").default("gte"),
            goalDiffVal: Joi.number()
                .integer()
                .min(0)
                .max(99)
                .allow("")
                .optional(),
            dateFrom: calendarDate.optional(),
            dateTo: calendarDate.optional(),
            played: Joi.boolean().optional(),
        }).unknown(false),
        body: emptyObject,
    },
    getStatistics: {
        query: Joi.object({
            tournament: mongoId.optional(),
        }).unknown(false),
        body: emptyObject,
    },
    getTournamentImages: {
        params: emptyObject,
        query: emptyObject,
        body: emptyObject,
    },
    getAllTimeStatistics: {
        params: emptyObject,
        query: emptyObject,
        body: emptyObject,
    },
    getUsers: {
        params: emptyObject,
        query: emptyObject,
        body: emptyObject,
    },
    getCalculator: {
        params: tournamentParams,
        query: Joi.object({
            teams: calculatorTeamsQuery.required(),
        }).unknown(false),
        body: emptyObject,
    },
    getPlayerInfo: {
        params: tournamentParams,
        query: Joi.object({
            // Acepta "all", ObjectId y también IDs históricos no canónicos.
            player: externalId.optional(),
            matches: Joi.boolean()
                .truthy("1", "yes", "on")
                .falsy("0", "no", "off")
                .optional(),
        }).unknown(false),
        body: emptyObject,
    },
    getStandingsTable: {
        params: tournamentParams,
        query: Joi.object({
            group: group.optional(),
        }).unknown(false),
        body: emptyObject,
    },
    getEdits: {
        query: Joi.object({
            page: Joi.number().integer().min(1).max(10000).default(1),
        }).unknown(false),
    },
    deleteEdit: {
        params: Joi.object({ id: mongoId.required() }).unknown(false),
        body: emptyObject,
        query: emptyObject,
    },
    login: {
        body: Joi.object({
            email: Joi.string().trim().lowercase().email().max(255).required(),
            password: Joi.string().min(6).max(1024).required(),
        }).unknown(false),
    },
    getTournamentResource: {
        params: tournamentParams,
        query: emptyObject,
        body: emptyObject,
    },
    getTournaments: {
        query: Joi.object({
            status: Joi.string().valid("active", "finalized").optional(),
            legacy: Joi.boolean().optional(),
        }).unknown(false),
        body: emptyObject,
    },
    createTournament: {
        body: tournamentBody,
        query: emptyObject,
    },
    getFixture: {
        params: tournamentParams,
        query: Joi.object({
            page: Joi.number().integer().min(1).max(10000).default(1),
            team: Joi.string().trim().min(1).max(100).optional(),
            group: group.optional(),
            players: fixturePlayersQuery.optional(),
        }).unknown(false),
        body: emptyObject,
    },
    fixture: {
        params: tournamentParams,
        body: Joi.object({
            group: group.allow(null).required(),
        }).unknown(false),
        query: emptyObject,
    },
    getPlayin: {
        params: tournamentParams,
        query: emptyObject,
        body: emptyObject,
    },
    playin: {
        params: tournamentParams,
        body: Joi.object({
            group: Joi.string().valid("A", "B").required(),
        }).unknown(false),
        query: emptyObject,
    },
    playinUpdate: {
        params: tournamentParams,
        body: Joi.object({
            round: Joi.number().integer().valid(2).required(),
        }).unknown(false),
        query: emptyObject,
    },
    completeTournament: {
        params: tournamentParams,
        body: emptyObject,
        query: emptyObject,
    },
    getPlayoff: {
        params: tournamentParams,
        query: emptyObject,
        body: emptyObject,
    },
    createPlayoff: {
        params: tournamentParams,
        body: emptyObject,
        query: emptyObject,
    },
    updatePlayoff: {
        params: tournamentParams,
        body: Joi.object({
            round: Joi.number().integer().min(2).max(5).optional(),
        }).unknown(false),
        query: emptyObject,
    },
    updateMatch: {
        params: matchParams,
        body: updateMatchBody,
        query: emptyObject,
    },
    removeMatch: {
        params: matchParams,
        body: emptyObject,
        query: emptyObject,
    },
}

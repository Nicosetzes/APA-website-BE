const Joi = require("joi")
const { MATCH_RULE_MESSAGES } = require("./errorMessages")
const { PLAYOFF_ROUNDS } = require("../config/playoffFormats")
const {
    DEFAULT_PENDING_LIMIT,
    MAX_PENDING_LIMIT,
} = require("../config/tournamentRecap")
const {
    DEFAULT_HEAD_TO_HEAD_LIMIT: DEFAULT_ASSISTANT_HEAD_TO_HEAD_LIMIT,
    DEFAULT_PENDING_LIMIT: DEFAULT_ASSISTANT_PENDING_LIMIT,
    DEFAULT_RECENT_MATCHES_LIMIT: DEFAULT_ASSISTANT_RECENT_MATCHES_LIMIT,
    MAX_ASSISTANT_PLAYERS,
    PENDING_SCOPES,
    PENDING_STAGES,
} = require("../config/assistant")
const { assertDirectPlayoffGeometry } = require("../service/playoffSeries")

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

// Los ids de equipo son number. Al crear el torneo Joi los convierte (`"5"` -> 5)
// y en las consultas (`/fixture?team=`, `/calculator?teams=`) `teamId` los
// valida como enteros, así el resto del código compara con `===`.
const teamReference = Joi.object({
    id: Joi.number().integer().min(0).required(),
    name: Joi.string().trim().min(1).max(255).required(),
}).unknown(true)

const score = Joi.number().integer().min(0).max(24)
const penaltyScore = score.empty("")

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
    playoffMode: Joi.when("format", {
        is: "playoff",
        then: Joi.string().valid("single", "two_legged").default("single"),
        otherwise: Joi.forbidden(),
    }),
    name: Joi.string().trim().min(1).max(100).required(),
    players: Joi.array().items(entityReference).min(1).required(),
    teams: Joi.array()
        .items(
            Joi.object({
                team: teamReference.required(),
                player: entityReference.required(),
                group: group.optional().allow(null),
                playoff_id: Joi.number().integer().min(1).optional(),
            }).unknown(true)
        )
        .min(1)
        .required(),
})
    .unknown(false)
    .custom((value, helpers) => {
        if (value.format !== "playoff") return value
        try {
            assertDirectPlayoffGeometry(value.teams, value.players)
            return value
        } catch (error) {
            return helpers.error("tournament.invalidPlayoffGeometry", {
                message: error.message,
            })
        }
    })
    .messages({
        "tournament.invalidPlayoffGeometry": "{#message}",
    })

const updateMatchBody = Joi.object({
    playerP1: entityReference.required(),
    teamP1: entityReference.required(),
    seedP1: seed.optional(),
    scoreP1: score.required(),
    penaltyScoreP1: penaltyScore.optional(),
    playerP2: entityReference.required(),
    teamP2: entityReference.required(),
    seedP2: seed.optional(),
    scoreP2: score.required(),
    penaltyScoreP2: penaltyScore.optional(),
    expectedSeriesRevision: Joi.number()
        .integer()
        .min(0)
        .max(Number.MAX_SAFE_INTEGER)
        .optional(),
    valid: Joi.boolean().optional(),
})
    .unknown(false)
    .messages(MATCH_RULE_MESSAGES)
    .custom((value, helpers) => {
        const hasSeedP1 = value.seedP1 !== undefined
        const hasSeedP2 = value.seedP2 !== undefined
        const hasPenaltyP1 = value.penaltyScoreP1 !== undefined
        const hasPenaltyP2 = value.penaltyScoreP2 !== undefined

        if (hasSeedP1 !== hasSeedP2) {
            return helpers.error("match.seedsIncomplete")
        }

        if (hasPenaltyP1 !== hasPenaltyP2) {
            return helpers.error("match.penaltiesIncomplete")
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

// Id de equipo en query: llega como texto y sale como entero (ver teamReference).
const teamId = Joi.number().integer().min(0)

const calculatorTeamIds = Joi.array().items(teamId).min(1).max(40).unique()

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

const assistantPlayerId = Joi.string().trim().min(1).max(100)

// Ids de jugador repetibles en query (`?players=a&players=b`); un solo valor
// llega como texto y `single()` lo envuelve.
const assistantPlayerIds = Joi.array()
    .items(Joi.string().trim().min(1).max(100))
    .single()
    .max(MAX_ASSISTANT_PLAYERS)
    .unique()

const stageCount = Joi.number().integer().min(0).max(10000)

const calendarDate = Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .custom(isValidCalendarDate)

// El listado histórico acepta "all" y "" como "sin filtro" porque el FE
// mantiene esos valores en la URL; el DAO ya los interpreta así.
const optionalIdFilter = Joi.alternatives().try(
    mongoId,
    Joi.string().valid("all", "")
)

// Criterio de comparación numérica compartido por los filtros de goles.
const comparisonOp = Joi.string().valid("gte", "lte", "eq").default("gte")

// Goles de un jugador en un partido: mismo rango que `score`, y "" como "sin
// filtro" porque el FE mantiene el campo vacío en la URL.
const goalsFilterValue = score.allow("").optional()

// Suma de los goles de ambos lados.
const totalGoalsFilterValue = Joi.number()
    .integer()
    .min(0)
    .max(48)
    .allow("")
    .optional()

const teamNameFilter = Joi.string().trim().min(1).max(100).allow("").optional()

// Campos de `generation` (modelo, versiones y hash del contexto).
const generationField = Joi.string().trim().min(1).max(100)

module.exports = {
    getMatches: {
        query: Joi.object({
            // Paginación en base 1 en toda la API, igual que /api/edits.
            page: Joi.number().integer().min(1).max(10000).default(1),
            teamName: teamNameFilter,
            player1: optionalIdFilter.optional(),
            player2: optionalIdFilter.optional(),
            tournamentId: optionalIdFilter.optional(),
            type: Joi.string()
                .valid("all", "regular", "knockout", "playin", "playoff")
                .optional(),
            // Sólo tiene efecto con type=playoff (lo resuelve el DAO).
            playoffRound: Joi.string()
                .valid("all", "", ...PLAYOFF_ROUNDS)
                .optional(),
            outcome: Joi.string()
                .valid(
                    "all",
                    "win",
                    "winIncludingPenalties",
                    "draw",
                    "loss",
                    "penalties"
                )
                .optional(),
            goalDiffOp: comparisonOp,
            goalDiffVal: Joi.number()
                .integer()
                .min(0)
                .max(99)
                .allow("")
                .optional(),
            totalGoalsOp: comparisonOp,
            totalGoalsVal: totalGoalsFilterValue,
            player1GoalsOp: comparisonOp,
            player1GoalsVal: goalsFilterValue,
            player1ConcededOp: comparisonOp,
            player1ConcededVal: goalsFilterValue,
            player1Team: teamNameFilter,
            opponentTeam: teamNameFilter,
            dateFrom: calendarDate.optional(),
            dateTo: calendarDate.optional(),
            played: Joi.boolean().optional(),
        }).unknown(false),
        body: emptyObject,
    },
    getMatchTeams: {
        params: emptyObject,
        query: emptyObject,
        body: emptyObject,
    },
    getRatings: {
        params: emptyObject,
        query: emptyObject,
        body: emptyObject,
    },
    getRatingsPeriod: {
        params: emptyObject,
        query: Joi.object({
            dateFrom: calendarDate.required(),
            dateTo: calendarDate.required(),
        })
            .unknown(false)
            .custom((value, helpers) =>
                value.dateFrom <= value.dateTo
                    ? value
                    : helpers.error("date.range")
            )
            .messages({
                "date.range": "La fecha hasta es anterior a la desde",
            }),
        body: emptyObject,
    },
    getAssistantHeadToHead: {
        params: emptyObject,
        query: Joi.object({
            playerA: assistantPlayerId.required(),
            // Dos jugadores distintos: contra uno mismo no hay cara a cara.
            playerB: assistantPlayerId.invalid(Joi.ref("playerA")).required(),
            // Acota el cruce a una etapa ("en playoffs") o a un torneo.
            stage: Joi.string()
                .valid(...PENDING_STAGES)
                .optional(),
            tournamentId: mongoId.optional(),
            // Un límite mayor al máximo no es error: el servicio lo ajusta.
            limit: Joi.number()
                .integer()
                .min(1)
                .default(DEFAULT_ASSISTANT_HEAD_TO_HEAD_LIMIT),
        }).unknown(false),
        body: emptyObject,
    },
    getAssistantRecentMatches: {
        params: emptyObject,
        query: Joi.object({
            player: assistantPlayerId.required(),
            // Acota la lista a una etapa ("en playoffs") o a un torneo.
            stage: Joi.string()
                .valid(...PENDING_STAGES)
                .optional(),
            tournamentId: mongoId.optional(),
            // Un límite mayor al máximo no es error: el servicio lo ajusta.
            limit: Joi.number()
                .integer()
                .min(1)
                .default(DEFAULT_ASSISTANT_RECENT_MATCHES_LIMIT),
        }).unknown(false),
        body: emptyObject,
    },
    getAssistantChampions: {
        params: emptyObject,
        query: emptyObject,
        body: emptyObject,
    },
    getAssistantStandings: {
        params: emptyObject,
        query: Joi.object({
            tournamentId: mongoId.required(),
            group: group.optional(),
            // Solo las filas de ese jugador, con su posición real en el grupo.
            playerId: assistantPlayerId.optional(),
        }).unknown(false),
        body: emptyObject,
    },
    getAssistantPendingMatches: {
        params: emptyObject,
        query: Joi.object({
            // `among` sin jugadores no tiene sentido: hay que decir entre quiénes.
            players: Joi.when("scope", {
                is: "among",
                then: assistantPlayerIds.min(1).required(),
                otherwise: assistantPlayerIds.optional(),
            }),
            scope: Joi.string()
                .valid(...PENDING_SCOPES)
                .default("involving"),
            tournamentId: mongoId.optional(),
            stage: Joi.string()
                .valid(...PENDING_STAGES)
                .optional(),
            // Un límite mayor al máximo no es error: el servicio lo ajusta.
            limit: Joi.number()
                .integer()
                .min(1)
                .default(DEFAULT_ASSISTANT_PENDING_LIMIT),
        }).unknown(false),
        body: emptyObject,
    },
    getRecapContext: {
        params: emptyObject,
        query: Joi.object({ date: calendarDate.required() }).unknown(false),
        body: emptyObject,
    },
    getRecapDates: {
        params: emptyObject,
        query: emptyObject,
        body: emptyObject,
    },
    getLatestRecap: {
        params: emptyObject,
        query: emptyObject,
        body: emptyObject,
    },
    getRecapByDate: {
        params: Joi.object({ date: calendarDate.required() }).unknown(false),
        query: emptyObject,
        body: emptyObject,
    },
    postRecap: {
        params: emptyObject,
        query: emptyObject,
        body: Joi.object({
            date: calendarDate.required(),
            matchCount: Joi.number().integer().min(0).max(10000).required(),
            recap: Joi.string().trim().min(1).max(50000).required(),
            tournaments: Joi.array()
                .items(
                    Joi.object({
                        tournamentId: Joi.string()
                            .trim()
                            .min(1)
                            .max(100)
                            .required(),
                        tournament: Joi.string()
                            .trim()
                            .min(1)
                            .max(255)
                            .required(),
                        matchCount: Joi.number()
                            .integer()
                            .min(0)
                            .max(10000)
                            .required(),
                        matchesByStage: Joi.object({
                            playoff: stageCount.required(),
                            playin: stageCount.required(),
                            regular: stageCount.required(),
                        })
                            .unknown(false)
                            .required(),
                    }).unknown(false)
                )
                .max(100)
                .required(),
            createdAt: Joi.date().iso().required(),
        }).unknown(false),
    },
    getTournamentRecapsPending: {
        params: emptyObject,
        query: Joi.object({
            closedAfter: calendarDate.optional(),
            limit: Joi.number()
                .integer()
                .min(1)
                .max(MAX_PENDING_LIMIT)
                .default(DEFAULT_PENDING_LIMIT),
        }).unknown(false),
        body: emptyObject,
    },
    getTournamentRecapContext: {
        params: emptyObject,
        query: Joi.object({
            tournamentId: mongoId.required(),
            detail: Joi.string().valid("compact", "full").default("compact"),
        }).unknown(false),
        body: emptyObject,
    },
    postTournamentRecap: {
        params: emptyObject,
        query: emptyObject,
        body: Joi.object({
            tournamentId: mongoId.required(),
            headline: Joi.string().trim().min(1).max(140).required(),
            summary: Joi.string().trim().min(1).max(500).required(),
            recap: Joi.string().trim().min(1).max(50000).required(),
            language: Joi.string()
                .trim()
                .pattern(/^[a-z]{2}(-[A-Z]{2})?$/)
                .default("es-AR"),
            generation: Joi.object({
                model: generationField.required(),
                promptVersion: generationField.required(),
                contextVersion: generationField.required(),
                ratingVersion: generationField.required(),
                drawModelVersion: generationField.required(),
                contextHash: generationField.required(),
            })
                .unknown(false)
                .required(),
            createdAt: Joi.date().iso().required(),
        }).unknown(false),
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
            team: teamId.optional(),
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
    updateMatch: {
        params: matchParams,
        body: updateMatchBody,
        query: emptyObject,
    },
    removeMatch: {
        params: matchParams,
        body: Joi.object({
            expectedSeriesRevision: Joi.number()
                .integer()
                .min(0)
                .max(Number.MAX_SAFE_INTEGER)
                .optional(),
        }).unknown(false),
        query: emptyObject,
    },
}

const Joi = require("@hapi/joi")

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

const matchType = Joi.string().valid("regular", "playin", "playoff")

const tournamentParams = Joi.object({
    tournament: mongoId.required(),
}).unknown(false)

const matchParams = Joi.object({
    tournament: mongoId.required(),
    match: mongoId.required(),
}).unknown(false)

const postMatchBody = Joi.object({
    playerP1: entityReference.required(),
    teamP1: entityReference.required(),
    scoreP1: score.required(),
    playerP2: entityReference.required(),
    teamP2: entityReference.required(),
    scoreP2: score.required(),
    penaltyScoreP1: score.optional(),
    penaltyScoreP2: score.optional(),
    type: matchType.required(),
    group: group.allow(null).optional(),
    tournament: Joi.alternatives()
        .try(
            mongoId,
            Joi.object({
                id: mongoId.required(),
                name: Joi.string().trim().min(1).max(255).optional(),
            }).unknown(true)
        )
        .required(),
    valid: Joi.boolean().optional(),
}).unknown(true)

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

const createMatchBody = Joi.object({
    playerP1: entityReference.required(),
    teamP1: entityReference.required(),
    scoreP1: score.optional(),
    seedP1: seed.optional(),
    playerP2: entityReference.required(),
    teamP2: entityReference.required(),
    scoreP2: score.optional(),
    seedP2: seed.optional(),
    penaltyScoreP1: score.optional(),
    penaltyScoreP2: score.optional(),
    type: matchType.required(),
    played: Joi.boolean().required(),
    playoff_id: Joi.number().integer().min(1).optional(),
}).unknown(true)

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
    isThisTheFinal: Joi.boolean().optional(),
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

module.exports = {
    postMatch: {
        body: postMatchBody,
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
    logout: {
        body: emptyObject,
        query: emptyObject,
    },
    createTournament: {
        body: tournamentBody,
        query: emptyObject,
    },
    fixture: {
        params: tournamentParams,
        body: Joi.object({
            group: group.allow(null).required(),
        }).unknown(false),
        query: emptyObject,
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
    updateSquad: {
        params: Joi.object({
            tournament: mongoId.required(),
            team: externalId.required(),
        }).unknown(false),
        body: Joi.object({
            squad: Joi.array()
                .items(
                    Joi.alternatives().try(
                        Joi.object().unknown(true),
                        Joi.string(),
                        Joi.number()
                    )
                )
                .required(),
        }).unknown(false),
        query: emptyObject,
    },
    createMatch: {
        params: tournamentParams,
        body: createMatchBody,
        query: emptyObject,
    },
    updateMatch: {
        params: matchParams,
        body: updateMatchBody,
        query: emptyObject,
    },
    dailyRecap: {
        params: tournamentParams,
        body: Joi.object({
            date: Joi.string()
                .pattern(/^\d{4}-\d{2}-\d{2}$/)
                .custom(isValidCalendarDate)
                .required(),
            content: Joi.alternatives()
                .try(
                    Joi.string().min(1),
                    Joi.object().unknown(true),
                    Joi.array().items(Joi.any()).min(1)
                )
                .required(),
        }).unknown(true),
        query: emptyObject,
    },
    removeMatch: {
        params: matchParams,
        body: emptyObject,
        query: emptyObject,
    },
}

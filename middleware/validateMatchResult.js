const { HttpError } = require("./httpErrors")
const { MATCH_RULE_MESSAGES } = require("../validation/errorMessages")
const { isKnockoutMatch } = require("../utils/matchPhase")
const matchesModel = require("../dao/models/matches")
const {
    classifySeriesMatch,
    validateSeriesResultRequest,
} = require("../service/playoffSeries")

const invalidResult = (message) =>
    new HttpError(400, "INVALID_MATCH_RESULT", message)

const validateLegacyResult = (req, next) => {
    const persistedMatch = req.match
    const body = req.body
    const hasPersistedSeeds =
        persistedMatch.seedP1 !== undefined &&
        persistedMatch.seedP2 !== undefined
    const isKnockout = isKnockoutMatch(persistedMatch)
    const bodyHasSeeds = body.seedP1 !== undefined || body.seedP2 !== undefined
    const bodyHasPenalties =
        body.penaltyScoreP1 !== undefined || body.penaltyScoreP2 !== undefined

    if (!isKnockout) {
        if (bodyHasSeeds || bodyHasPenalties) {
            return next(
                invalidResult(
                    "Un partido regular no puede incluir seeds ni penales"
                )
            )
        }
        return next()
    }

    if (!hasPersistedSeeds) {
        return next(
            new HttpError(
                409,
                "MATCH_CONFIGURATION_ERROR",
                "El partido eliminatorio no tiene seeds configurados"
            )
        )
    }

    if (
        (body.seedP1 !== undefined &&
            String(body.seedP1) !== String(persistedMatch.seedP1)) ||
        (body.seedP2 !== undefined &&
            String(body.seedP2) !== String(persistedMatch.seedP2))
    ) {
        return next(
            invalidResult("Los seeds no coinciden con el partido almacenado")
        )
    }

    body.seedP1 = persistedMatch.seedP1
    body.seedP2 = persistedMatch.seedP2

    if (body.scoreP1 === body.scoreP2) {
        const hasPenaltyP1 = body.penaltyScoreP1 !== undefined
        const hasPenaltyP2 = body.penaltyScoreP2 !== undefined
        if (!hasPenaltyP1 && !hasPenaltyP2)
            return next(
                invalidResult(MATCH_RULE_MESSAGES["match.drawNeedsPenalties"])
            )
        if (hasPenaltyP1 !== hasPenaltyP2)
            return next(
                invalidResult(MATCH_RULE_MESSAGES["match.penaltiesIncomplete"])
            )
        if (body.penaltyScoreP1 === body.penaltyScoreP2)
            return next(
                invalidResult(MATCH_RULE_MESSAGES["match.penaltiesTied"])
            )
    }

    return next()
}

const validateMatchResult = async (req, res, next) => {
    const classification = classifySeriesMatch({
        tournament: req.tournament,
        match: req.match,
    })
    if (classification === "legacy") return validateLegacyResult(req, next)
    if (classification === "invalid") {
        return next(
            new HttpError(
                409,
                "PLAYOFF_CONFIGURATION_ERROR",
                "La configuración de la serie de playoff es inválida"
            )
        )
    }

    let tieMatches
    try {
        tieMatches = await matchesModel
            .find({
                "tournament.id": String(req.tournament._id),
                type: "playoff",
                playoff_id: req.match.playoff_id,
                leg: { $in: [1, 2, 3] },
            })
            .sort({ leg: 1 })
            .lean()
    } catch (error) {
        return next(error)
    }

    try {
        validateSeriesResultRequest({
            tournament: req.tournament,
            match: req.match,
            tieMatches,
            body: req.body,
        })
        return next()
    } catch (error) {
        return next(
            error instanceof HttpError
                ? error
                : new Error("Series validation failed", { cause: error })
        )
    }
}

module.exports = validateMatchResult
module.exports.validateLegacyResult = validateLegacyResult

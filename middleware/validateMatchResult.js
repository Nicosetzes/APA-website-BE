const { HttpError } = require("./httpErrors")

const invalidResult = (message) =>
    new HttpError(400, "INVALID_MATCH_RESULT", message)

const validateMatchResult = (req, res, next) => {
    const persistedMatch = req.match
    const body = req.body
    const hasPersistedSeeds =
        persistedMatch.seedP1 !== undefined &&
        persistedMatch.seedP2 !== undefined
    const isKnockout =
        persistedMatch.type === "playoff" ||
        persistedMatch.type === "playin" ||
        hasPersistedSeeds
    const bodyHasSeeds =
        body.seedP1 !== undefined || body.seedP2 !== undefined
    const bodyHasPenalties =
        body.penaltyScoreP1 !== undefined ||
        body.penaltyScoreP2 !== undefined

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
        const hasBothPenaltyScores =
            body.penaltyScoreP1 !== undefined &&
            body.penaltyScoreP2 !== undefined

        if (
            !hasBothPenaltyScores ||
            body.penaltyScoreP1 === body.penaltyScoreP2
        ) {
            return next(
                invalidResult(
                    "Un empate eliminatorio requiere un ganador por penales"
                )
            )
        }
    }

    return next()
}

module.exports = validateMatchResult

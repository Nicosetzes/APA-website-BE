const { HttpError } = require("./httpErrors")
const { classifySeriesMatch } = require("../service/playoffSeries")

const validateSeriesMutationRequest = (req, res, next) => {
    const classification = classifySeriesMatch({
        tournament: req.tournament,
        match: req.match,
    })
    if (classification === "legacy") return next()
    if (classification === "invalid")
        return next(
            new HttpError(
                409,
                "PLAYOFF_CONFIGURATION_ERROR",
                "La configuración de la serie es inválida"
            )
        )
    if (req.body.expectedSeriesRevision === undefined)
        return next(
            new HttpError(
                400,
                "EXPECTED_SERIES_REVISION_REQUIRED",
                "La limpieza requiere la revisión vigente de la serie"
            )
        )
    return next()
}

module.exports = validateSeriesMutationRequest

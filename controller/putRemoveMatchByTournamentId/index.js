const {
    modifyMatchResultToRemoveIt,
    removePlayoffSeriesResult,
} = require("./../../service")
const { classifySeriesMatch } = require("../../service/playoffSeries")
const { HttpError } = require("../../middleware/httpErrors")

const createPutRemoveMatchByTournamentId = (dependencies = {}) => {
    const removeLegacyResult =
        dependencies.modifyMatchResultToRemoveIt || modifyMatchResultToRemoveIt
    const removeSeriesResult =
        dependencies.removePlayoffSeriesResult || removePlayoffSeriesResult

    return async (req, res) => {
        const { tournament, match } = req.params
        const classification = classifySeriesMatch({
            tournament: req.tournament || {},
            match: req.match || {},
        })
        if (classification === "invalid") {
            throw new HttpError(
                409,
                "PLAYOFF_CONFIGURATION_ERROR",
                "La configuración de la serie de playoff es inválida"
            )
        }
        const matchWithoutResult =
            classification === "legacy"
                ? await removeLegacyResult(match)
                : await removeSeriesResult({
                      tournamentId: tournament,
                      matchId: match,
                      expectedSeriesRevision: req.body.expectedSeriesRevision,
                      requestId: req.requestId || null,
                  })

        if (!matchWithoutResult) {
            throw new HttpError(
                404,
                "MATCH_NOT_FOUND",
                "No se encontró el partido a modificar"
            )
        }

        return res.status(200).json(matchWithoutResult)
    }
}

const putRemoveMatchByTournamentId = createPutRemoveMatchByTournamentId()

module.exports = putRemoveMatchByTournamentId
module.exports.createPutRemoveMatchByTournamentId =
    createPutRemoveMatchByTournamentId

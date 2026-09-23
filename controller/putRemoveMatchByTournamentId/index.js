const { modifyMatchResultToRemoveIt } = require("./../../service")
const { HttpError } = require("../../middleware/httpErrors")

const createPutRemoveMatchByTournamentId = (dependencies = {}) => {
    const removeMatchResult =
        dependencies.modifyMatchResultToRemoveIt || modifyMatchResultToRemoveIt

    return async (req, res) => {
        const { match } = req.params

        // `requireMatchInTournament` ya verificó pertenencia y existencia; este
        // 404 cubre la carrera en la que el partido desaparece en el medio.
        const matchWithoutResult = await removeMatchResult(match)

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

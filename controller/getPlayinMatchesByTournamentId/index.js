const {
    retrievePlayinMatchesByTournamentId,
    retrieveTournamentById,
} = require("./../../service")
const { HttpError } = require("../../middleware/httpErrors")

const createGetPlayinMatchesByTournamentId = (dependencies = {}) => {
    const retrieveTournament =
        dependencies.retrieveTournamentById || retrieveTournamentById
    const retrieveMatches =
        dependencies.retrievePlayinMatchesByTournamentId ||
        retrievePlayinMatchesByTournamentId

    return async (req, res) => {
        const { tournament } = req.params
        const tournamentData = await retrieveTournament(tournament)

        if (!tournamentData) {
            throw new HttpError(
                404,
                "TOURNAMENT_NOT_FOUND",
                "No se encontró el torneo"
            )
        }

        const matches = await retrieveMatches(tournament)
        return res.status(200).json({ matches })
    }
}

const getPlayinMatchesByTournamentId = createGetPlayinMatchesByTournamentId()

module.exports = getPlayinMatchesByTournamentId
module.exports.createGetPlayinMatchesByTournamentId =
    createGetPlayinMatchesByTournamentId

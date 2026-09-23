const {
    retrievePlayoffMatchesByTournamentId,
    retrieveTournamentById,
} = require("./../../service")
const { HttpError } = require("../../middleware/httpErrors")

const createGetPlayoffMatchesByTournamentId = (dependencies = {}) => {
    const retrieveTournament =
        dependencies.retrieveTournamentById || retrieveTournamentById
    const retrieveMatches =
        dependencies.retrievePlayoffMatchesByTournamentId ||
        retrievePlayoffMatchesByTournamentId

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

const getPlayoffMatchesByTournamentId = createGetPlayoffMatchesByTournamentId()

module.exports = getPlayoffMatchesByTournamentId
module.exports.createGetPlayoffMatchesByTournamentId =
    createGetPlayoffMatchesByTournamentId

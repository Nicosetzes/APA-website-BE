const {
    decorateMatchesWithPrediction,
} = require("../../service/playerRatings/prediction")
const defaultLogger = require("../../utils/logger")
const {
    retrieveAllMatches,
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
    const retrieveEveryMatch =
        dependencies.retrieveAllMatches || retrieveAllMatches
    const logger = dependencies.logger || defaultLogger

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
        // Agrega la "Prob. de éxito" (APA Rating 2.0) a cada partido
        const decorated = await decorateMatchesWithPrediction({
            matches,
            tournament: tournamentData,
            retrieveAllMatches: retrieveEveryMatch,
            logger,
            options: dependencies.predictionOptions,
        })
        return res.status(200).json({ matches: decorated })
    }
}

const getPlayoffMatchesByTournamentId = createGetPlayoffMatchesByTournamentId()

module.exports = getPlayoffMatchesByTournamentId
module.exports.createGetPlayoffMatchesByTournamentId =
    createGetPlayoffMatchesByTournamentId

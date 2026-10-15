const defaultLogger = require("../../utils/logger")
const {
    decorateMatchesWithPrediction,
} = require("../../service/playerRatings/prediction")
const {
    retrieveRatingMatches,
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
    const retrieveEveryMatch =
        dependencies.retrieveAllMatches || retrieveRatingMatches
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

const getPlayinMatchesByTournamentId = createGetPlayinMatchesByTournamentId()

module.exports = getPlayinMatchesByTournamentId
module.exports.createGetPlayinMatchesByTournamentId =
    createGetPlayinMatchesByTournamentId

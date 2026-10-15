const {
    decorateMatchesWithRatingChange,
} = require("../../service/ratingsReadModel/decorateMatchesWithRatingChange")
const defaultLogger = require("../../utils/logger")
const { retrieveMatches, retrieveRatingChanges } = require("./../../service")

const createGetMatches = (dependencies = {}) => {
    const retrieve = dependencies.retrieveMatches || retrieveMatches
    const logger = dependencies.logger || defaultLogger
    const retrieveChanges =
        dependencies.retrieveRatingChanges ??
        (dependencies.retrieveMatches ? undefined : retrieveRatingChanges)

    return async (req, res) => {
        const {
            page,
            teamName,
            player1,
            player2,
            tournamentId,
            type,
            playoffRound,
            outcome,
            goalDiffOp,
            goalDiffVal,
            totalGoalsOp,
            totalGoalsVal,
            player1GoalsOp,
            player1GoalsVal,
            player1ConcededOp,
            player1ConcededVal,
            player1Team,
            opponentTeam,
            dateFrom,
            dateTo,
            played,
        } = req.query

        const matchesData = await retrieve({
            page,
            teamName,
            player1,
            player2,
            tournamentId,
            type,
            playoffRound,
            outcome,
            goalDiffOp,
            goalDiffVal,
            totalGoalsOp,
            totalGoalsVal,
            player1GoalsOp,
            player1GoalsVal,
            player1ConcededOp,
            player1ConcededVal,
            player1Team,
            opponentTeam,
            dateFrom,
            dateTo,
            played,
        })

        const payload = retrieveChanges
            ? await decorateMatchesWithRatingChange({
                  payload: matchesData,
                  retrieveRatingChanges: retrieveChanges,
                  readModelEnabled: dependencies.readModelEnabled,
                  logger,
              })
            : matchesData

        return res.status(200).json(payload)
    }
}

const getMatches = createGetMatches()

module.exports = getMatches
module.exports.createGetMatches = createGetMatches

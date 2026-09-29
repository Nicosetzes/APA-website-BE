const { retrieveMatches } = require("./../../service")

const createGetMatches = (dependencies = {}) => {
    const retrieve = dependencies.retrieveMatches || retrieveMatches

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

        return res.status(200).json(matchesData)
    }
}

const getMatches = createGetMatches()

module.exports = getMatches
module.exports.createGetMatches = createGetMatches

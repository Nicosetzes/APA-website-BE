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
            outcome,
            goalDiffOp,
            goalDiffVal,
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
            outcome,
            goalDiffOp,
            goalDiffVal,
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

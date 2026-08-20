const { retrieveMatches } = require("./../../service")

const getMatches = async (req, res) => {
    try {
        const {
            page = 0,
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

        const matchesData = await retrieveMatches({
            page: Number(page),
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

        res.json(matchesData)
    } catch (err) {
        console.error("Error fetching matches:", err)
        return res.status(500).send("Something went wrong! " + err.message)
    }
}

module.exports = getMatches

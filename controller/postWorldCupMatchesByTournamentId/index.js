const { originateManyMatches } = require("../../service")

const postWorldCupMatchesByTournamentId = async (req, res) => {
    try {
        const matches = req.body
        const newMatches = await originateManyMatches(matches)
        res.status(200).send(newMatches)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = postWorldCupMatchesByTournamentId

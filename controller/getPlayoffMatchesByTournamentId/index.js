const { retrievePlayoffMatchesByTournamentId } = require("./../../service")

const getPlayoffMatchesByTournamentId = async (req, res) => {
    try {
        const { tournament } = req.params

        const matches = await retrievePlayoffMatchesByTournamentId(tournament)

        res.status(200).json({ matches })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getPlayoffMatchesByTournamentId

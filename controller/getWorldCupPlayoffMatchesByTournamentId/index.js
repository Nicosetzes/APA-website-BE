const { orderPlayoffMatchesFromTournamentById } = require("../../service")

const getWorldCupPlayoffMatchesByTournamentId = async (req, res) => {
    const { tournament } = req.params
    try {
        // const tournamentFromDB = await retrieveTournamentById(tournament)
        const matches = await orderPlayoffMatchesFromTournamentById(tournament)
        res.status(200).send(matches)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getWorldCupPlayoffMatchesByTournamentId

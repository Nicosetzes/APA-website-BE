const { retrieveTournamentPlayersByTournamentId } = require("./../../service")

const getPlayersByTournamentId = async (req, res) => {
    const tournamentId = req.params.tournament
    try {
        const players = await retrieveTournamentPlayersByTournamentId(
            tournamentId
        )
        res.status(200).json(players)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getPlayersByTournamentId

const { retrieveTournamentById } = require("./../../service")

const getTournamentById = async (req, res) => {
    const tournamentId = req.params.tournament
    try {
        const tournament = await retrieveTournamentById(tournamentId)
        res.status(200).json(tournament)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getTournamentById

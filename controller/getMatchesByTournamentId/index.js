const { retrieveMatchesByTournamentIds } = require("./../../service")

const getMatchesByTournamentId = async (req, res) => {
    try {
        // AHORA DEBO TRAER LOS PARTIDOS DE UN TORNEO
        const { tournament } = req.params
        const { page = 0, team } = req.query
        let players
        if (req.query.players) players = JSON.parse(req.query.players)

        const matches = await retrieveMatchesByTournamentIds(
            [tournament],
            Number(page),
            players,
            team
        )
        res.status(200).json(matches)
        // Agregar excepción en caso de error
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getMatchesByTournamentId

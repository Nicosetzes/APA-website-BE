const {
    retrieveTournamentById,
    retrieveFixtureByTournamentIds,
} = require("./../../service")

const getFixtureByTournamentId = async (req, res) => {
    try {
        // AHORA DEBO TRAER LOS PARTIDOS DE UN TORNEO
        const { tournament } = req.params
        const { page = 0, team } = req.query
        let players
        if (req.query.players) players = JSON.parse(req.query.players)

        const tournamentFromDB = await retrieveTournamentById(tournament)

        const matches = await retrieveFixtureByTournamentIds(
            [tournament],
            Number(page),
            players,
            team
        )
        res.status(200).json({ matches, tournament: tournamentFromDB })
        // Agregar excepción en caso de error
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getFixtureByTournamentId

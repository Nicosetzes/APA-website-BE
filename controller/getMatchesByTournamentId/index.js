const { retrieveMatchesByTournamentIds } = require("./../../service")

const getMatchesByTournamentId = async (req, res) => {
    try {
        // AHORA DEBO TRAER LOS PARTIDOS DE UN TORNEO
        const { tournament } = req.params
        const { page = 0, player, team } = req.query

        console.log(req.query)
        console.log(JSON.parse(req.query.algo))

        const matches = await retrieveMatchesByTournamentIds(
            [tournament],
            page,
            player,
            team
        )
        res.status(200).json(matches)
        // Agregar excepción en caso de error
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getMatchesByTournamentId

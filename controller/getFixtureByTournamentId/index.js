const {
    retrieveFixtureByTournamentId,
    retrieveTournamentById,
} = require("./../../service")

const getFixtureByTournamentId = async (req, res) => {
    try {
        // AHORA DEBO TRAER LOS PARTIDOS DE UN TORNEO
        const { tournament } = req.params
        const { page = 0, team, group } = req.query
        let players
        if (req.query.players) players = JSON.parse(req.query.players)

        let matches

        if (!group) {
            // Si no se especificó grupo, averiguo si el torneo tiene grupos //
            const { groups } = await retrieveTournamentById(tournament)
            // Si el torneo es sin grupos, no mando group a DAO //
            // Si el torneo es con grupos, le mando el primer grupo por defecto //
            matches = !groups.length
                ? await retrieveFixtureByTournamentId(
                      tournament,
                      Number(page),
                      players,
                      team
                  )
                : await retrieveFixtureByTournamentId(
                      tournament,
                      Number(page),
                      players,
                      team,
                      groups[0]
                  )
        } else {
            matches = await retrieveFixtureByTournamentId(
                tournament,
                Number(page),
                players,
                team,
                group
            )
        }

        res.status(200).json({ matches })
        // Agregar excepción en caso de error
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getFixtureByTournamentId

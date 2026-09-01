const { retrieveFixtureByTournamentId } = require("./../../service")

const getFixtureByTournamentId = async (req, res) => {
    try {
        const { tournament } = req.params
        const { page = 0, team, group } = req.query
        let players
        if (req.query.players) players = JSON.parse(req.query.players)

        const matches = await retrieveFixtureByTournamentId(
            tournament,
            Number(page),
            players,
            team,
            group
        )

        res.status(200).send(matches)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getFixtureByTournamentId

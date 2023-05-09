const {
    originateFixtureByTournamentId,
    retrieveTournamentById,
} = require("./../../service")

const postFixtureByTournamentId = async (req, res) => {
    const { group } = req.body
    const { tournament } = req.params

    try {
        const { id, name, players, teams } = await retrieveTournamentById(
            tournament
        )

        const tournamentForFixtureGeneration = { id, name }

        const teamsFromGroup = teams.filter((team) => team.group == group)

        const fixture = await originateFixtureByTournamentId(
            tournamentForFixtureGeneration,
            players,
            teamsFromGroup
        )
        res.status(200).json(fixture)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = postFixtureByTournamentId

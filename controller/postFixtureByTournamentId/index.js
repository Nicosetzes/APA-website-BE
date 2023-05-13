const {
    originateFixtureByTournamentId,
    retrieveTournamentById,
} = require("./../../service")

const postFixtureByTournamentId = async (req, res) => {
    const { group } = req.body
    const { tournament } = req.params

    try {
        const { id, name, players, teams, groups } =
            await retrieveTournamentById(tournament)

        const playerIDs = players.map(({ id }) => id)

        const tournamentForFixtureGeneration = { id, name }

        let teamsForFixtureGeneration
        let playersForFixtureGeneration
        let doesTournamentHaveGroups

        if (groups.length) {
            // El torneo tiene grupos //
            teamsForFixtureGeneration = group
                ? teams.filter((team) => team.group == group)
                : teams.filter((team) => team.group == "A")

            const playerIDsFromGroup = teamsForFixtureGeneration.map(
                ({ player }) => player.id
            )

            const uniquePlayerIDsFromGroup = Array.from(
                new Set(playerIDsFromGroup)
            )

            playersForFixtureGeneration = uniquePlayerIDsFromGroup.map((id) => {
                return {
                    id,
                    name: players.filter((player) => player.id == id).at(0)
                        .name,
                }
            })

            doesTournamentHaveGroups = true
        } else {
            // El torneo no tiene grupos //
            playersForFixtureGeneration = players
            teamsForFixtureGeneration = teams
            doesTournamentHaveGroups = false
        }

        const fixture = await originateFixtureByTournamentId(
            tournamentForFixtureGeneration,
            playersForFixtureGeneration,
            teamsForFixtureGeneration,
            doesTournamentHaveGroups
        )
        res.status(200).json(fixture)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = postFixtureByTournamentId

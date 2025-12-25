const {
    originateFixtureByTournamentId,
    retrieveTournamentById,
} = require("./../../service")

const postFixtureByTournamentId = async (req, res) => {
    const { group } = req.body
    const { tournament } = req.params

    try {
        const { id, name, players, teams, groups, format } =
            await retrieveTournamentById(tournament)

        const playerIDs = players.map(({ id }) => id)

        const tournamentForFixtureGeneration = { id, name }

        const formatForFixtureGeneration = format

        let teamsForFixtureGeneration
        let playersForFixtureGeneration

        if (groups?.length) {
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
        } else {
            // El torneo no tiene grupos //
            playersForFixtureGeneration = players
            teamsForFixtureGeneration = teams
        }

        const fixture = await originateFixtureByTournamentId(
            formatForFixtureGeneration,
            tournamentForFixtureGeneration,
            playersForFixtureGeneration,
            teamsForFixtureGeneration
        )
        res.status(200).json(fixture)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = postFixtureByTournamentId

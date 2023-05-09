const {
    orderMatchesFromTournamentById,
    originatePlayinByTournamentId,
    retrieveTournamentById,
} = require("./../../service")

const postPlayinByTournamentId = async (req, res) => {
    const { group } = req.body
    const { tournament } = req.params

    try {
        const standings = []

        const { id, name, teams } = await retrieveTournamentById(tournament)

        const tournamentForFixtureGeneration = { id, name }

        const teamsFromGroup = teams.filter((team) => team.group == group)

        const matches = await orderMatchesFromTournamentById(tournament, group)

        teamsFromGroup.forEach(async ({ team, player }) => {
            let wins = matches.filter(
                ({ outcome }) => outcome?.teamThatWon?.id == team.id
            ).length
            let draws = matches.filter(
                ({ teamP1, teamP2, outcome }) =>
                    (teamP1.id == team.id || teamP2.id == team.id) &&
                    outcome?.draw
            ).length
            let goalsFor =
                matches
                    .filter(({ teamP1 }) => teamP1.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0) +
                matches
                    .filter(({ teamP2 }) => teamP2.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0)
            let goalsAgainst =
                matches
                    .filter(({ teamP1 }) => teamP1.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0) +
                matches
                    .filter(({ teamP2 }) => teamP2.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0)
            let scoringDifference = goalsFor - goalsAgainst
            let points = wins * 3 + draws

            standings.push({
                team,
                player,
                goalsFor,
                goalsAgainst,
                scoringDifference,
                points,
            })
        })

        const sortedStandings = standings.sort((a, b) => {
            if (a.points > b.points) return -1
            if (a.points < b.points) return 1

            if (a.scoringDifference > b.scoringDifference) return -1
            if (a.scoringDifference < b.scoringDifference) return 1

            if (a.goalsFor > b.goalsFor) return -1
            if (a.goalsFor < b.goalsFor) return 1

            if (a.goalsAgainst > b.goalsAgainst) return 1
            if (a.goalsAgainst < b.goalsAgainst) return -1
        })

        const playinMatches = [
            {
                playerP1: {
                    id: sortedStandings.at(6).player.id,
                    name: sortedStandings.at(6).player.name,
                },
                teamP1: {
                    id: sortedStandings.at(6).team.id,
                    name: sortedStandings.at(6).team.name,
                },
                seedP1: "7",
                playerP2: {
                    id: sortedStandings.at(7).player.id,
                    name: sortedStandings.at(7).player.name,
                },
                teamP2: {
                    id: sortedStandings.at(7).team.id,
                    name: sortedStandings.at(7).team.name,
                },
                seedP2: "8",
                type: "playin",
                tournament: tournamentForFixtureGeneration,
                played: false,
                playoff_id: group == "A" ? 1 : 3,
                group,
            },
            {
                playerP1: {
                    id: sortedStandings.at(8).player.id,
                    name: sortedStandings.at(8).player.name,
                },
                teamP1: {
                    id: sortedStandings.at(8).team.id,
                    name: sortedStandings.at(8).team.name,
                },
                seedP1: "9",
                playerP2: {
                    id: sortedStandings.at(9).player.id,
                    name: sortedStandings.at(9).player.name,
                },
                teamP2: {
                    id: sortedStandings.at(9).team.id,
                    name: sortedStandings.at(9).team.name,
                },
                seedP2: "10",
                type: "playin",
                tournament: tournamentForFixtureGeneration,
                played: false,
                playoff_id: group == "A" ? 2 : 4,
                group,
            },
        ]

        const playin = await originatePlayinByTournamentId(playinMatches)

        res.status(200).json(playin)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = postPlayinByTournamentId

const {
    orderMatchesFromTournamentById,
    originatePlayoffByTournamentId,
    retrieveTournamentById,
    retrievePlayinMatchesByTournamentId,
} = require("./../../service")

const postPlayoffByTournamentId = async (req, res) => {
    // const { group } = req.body
    const { tournament } = req.params

    try {
        const playinMatches = await retrievePlayinMatchesByTournamentId(
            tournament
        )

        const haveAllPlayinMatchesBeenPlayed =
            playinMatches.filter(({ outcome }) => outcome).length == 6
                ? true
                : false

        if (!haveAllPlayinMatchesBeenPlayed)
            return res
                .status(500)
                .json({ message: "Aún restan partidos de Playin" })

        const { id, name, teams } = await retrieveTournamentById(tournament)

        const standingsFromGroupA = []

        const standingsFromGroupB = []

        const teamsFromGroupA = teams.filter((team) => team.group == "A")

        const teamsFromGroupB = teams.filter((team) => team.group == "B")

        const regularMatches = await orderMatchesFromTournamentById(tournament)

        teamsFromGroupA.forEach(async ({ team, player }) => {
            let wins = regularMatches.filter(
                ({ outcome }) => outcome?.teamThatWon?.id == team.id
            ).length
            let draws = regularMatches.filter(
                ({ teamP1, teamP2, outcome }) =>
                    (teamP1.id == team.id || teamP2.id == team.id) &&
                    outcome?.draw
            ).length
            let goalsFor =
                regularMatches
                    .filter(({ teamP1 }) => teamP1.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0) +
                regularMatches
                    .filter(({ teamP2 }) => teamP2.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0)
            let goalsAgainst =
                regularMatches
                    .filter(({ teamP1 }) => teamP1.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0) +
                regularMatches
                    .filter(({ teamP2 }) => teamP2.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0)
            let scoringDifference = goalsFor - goalsAgainst
            let points = wins * 3 + draws

            standingsFromGroupA.push({
                team,
                player,
                goalsFor,
                goalsAgainst,
                scoringDifference,
                points,
            })
        })

        teamsFromGroupB.forEach(async ({ team, player }) => {
            let wins = regularMatches.filter(
                ({ outcome }) => outcome?.teamThatWon?.id == team.id
            ).length
            let draws = regularMatches.filter(
                ({ teamP1, teamP2, outcome }) =>
                    (teamP1.id == team.id || teamP2.id == team.id) &&
                    outcome?.draw
            ).length
            let goalsFor =
                regularMatches
                    .filter(({ teamP1 }) => teamP1.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0) +
                regularMatches
                    .filter(({ teamP2 }) => teamP2.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0)
            let goalsAgainst =
                regularMatches
                    .filter(({ teamP1 }) => teamP1.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0) +
                regularMatches
                    .filter(({ teamP2 }) => teamP2.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0)
            let scoringDifference = goalsFor - goalsAgainst
            let points = wins * 3 + draws

            standingsFromGroupB.push({
                team,
                player,
                goalsFor,
                goalsAgainst,
                scoringDifference,
                points,
            })
        })

        const sortedStandingsFromGroupA = standingsFromGroupA.sort((a, b) => {
            if (a.points > b.points) return -1
            if (a.points < b.points) return 1

            if (a.scoringDifference > b.scoringDifference) return -1
            if (a.scoringDifference < b.scoringDifference) return 1

            if (a.goalsFor > b.goalsFor) return -1
            if (a.goalsFor < b.goalsFor) return 1

            if (a.goalsAgainst > b.goalsAgainst) return 1
            if (a.goalsAgainst < b.goalsAgainst) return -1
        })

        const sortedStandingsFromGroupB = standingsFromGroupB.sort((a, b) => {
            if (a.points > b.points) return -1
            if (a.points < b.points) return 1

            if (a.scoringDifference > b.scoringDifference) return -1
            if (a.scoringDifference < b.scoringDifference) return 1

            if (a.goalsFor > b.goalsFor) return -1
            if (a.goalsFor < b.goalsFor) return 1

            if (a.goalsAgainst > b.goalsAgainst) return 1
            if (a.goalsAgainst < b.goalsAgainst) return -1
        })

        const allPlayoffTeams = [
            sortedStandingsFromGroupA.at(0),
            sortedStandingsFromGroupA.at(1),
            sortedStandingsFromGroupA.at(2),
            sortedStandingsFromGroupA.at(3),
            sortedStandingsFromGroupA.at(4),
            sortedStandingsFromGroupA.at(5),
            sortedStandingsFromGroupA
                .filter(
                    ({ team }) =>
                        team.id == playinMatches.at(0).outcome.teamThatWon.id
                )
                .at(0),
            sortedStandingsFromGroupA
                .filter(
                    ({ team }) =>
                        team.id == playinMatches.at(4).outcome.teamThatWon.id
                )
                .at(0),
            sortedStandingsFromGroupB.at(0),
            sortedStandingsFromGroupB.at(1),
            sortedStandingsFromGroupB.at(2),
            sortedStandingsFromGroupB.at(3),
            sortedStandingsFromGroupB.at(4),
            sortedStandingsFromGroupB.at(5),
            sortedStandingsFromGroupB
                .filter(
                    ({ team }) =>
                        team.id == playinMatches.at(2).outcome.teamThatWon.id
                )
                .at(0),
            sortedStandingsFromGroupB
                .filter(
                    ({ team }) =>
                        team.id == playinMatches.at(5).outcome.teamThatWon.id
                )
                .at(0),
        ]

        const allPlayoffTeamsSorted = allPlayoffTeams
            .sort((a, b) => {
                if (a.points > b.points) return -1
                if (a.points < b.points) return 1

                if (a.scoringDifference > b.scoringDifference) return -1
                if (a.scoringDifference < b.scoringDifference) return 1

                if (a.goalsFor > b.goalsFor) return -1
                if (a.goalsFor < b.goalsFor) return 1

                if (a.goalsAgainst > b.goalsAgainst) return 1
                if (a.goalsAgainst < b.goalsAgainst) return -1
            })
            .map(({ team, player }) => {
                return { team, player }
            })

        const playoffMatches = [
            {
                playerP1: {
                    id: allPlayoffTeamsSorted.at(0).player.id,
                    name: allPlayoffTeamsSorted.at(0).player.name,
                },
                teamP1: {
                    id: allPlayoffTeamsSorted.at(0).team.id,
                    name: allPlayoffTeamsSorted.at(0).team.name,
                },
                seedP1: "1",
                playerP2: {
                    id: allPlayoffTeamsSorted.at(15).player.id,
                    name: allPlayoffTeamsSorted.at(15).player.name,
                },
                teamP2: {
                    id: allPlayoffTeamsSorted.at(15).team.id,
                    name: allPlayoffTeamsSorted.at(15).team.name,
                },
                seedP2: "16",
                type: "playoff",
                tournament: { id, name },
                played: false,
                playoff_id: 1,
            },
            {
                playerP1: {
                    id: allPlayoffTeamsSorted.at(7).player.id,
                    name: allPlayoffTeamsSorted.at(7).player.name,
                },
                teamP1: {
                    id: allPlayoffTeamsSorted.at(7).team.id,
                    name: allPlayoffTeamsSorted.at(7).team.name,
                },
                seedP1: "8",
                playerP2: {
                    id: allPlayoffTeamsSorted.at(8).player.id,
                    name: allPlayoffTeamsSorted.at(8).player.name,
                },
                teamP2: {
                    id: allPlayoffTeamsSorted.at(8).team.id,
                    name: allPlayoffTeamsSorted.at(8).team.name,
                },
                seedP2: "9",
                type: "playoff",
                tournament: { id, name },
                played: false,
                playoff_id: 2,
            },
            {
                playerP1: {
                    id: allPlayoffTeamsSorted.at(4).player.id,
                    name: allPlayoffTeamsSorted.at(4).player.name,
                },
                teamP1: {
                    id: allPlayoffTeamsSorted.at(4).team.id,
                    name: allPlayoffTeamsSorted.at(4).team.name,
                },
                seedP1: "5",
                playerP2: {
                    id: allPlayoffTeamsSorted.at(11).player.id,
                    name: allPlayoffTeamsSorted.at(11).player.name,
                },
                teamP2: {
                    id: allPlayoffTeamsSorted.at(11).team.id,
                    name: allPlayoffTeamsSorted.at(11).team.name,
                },
                seedP2: "12",
                type: "playoff",
                tournament: { id, name },
                played: false,
                playoff_id: 3,
            },
            {
                playerP1: {
                    id: allPlayoffTeamsSorted.at(3).player.id,
                    name: allPlayoffTeamsSorted.at(3).player.name,
                },
                teamP1: {
                    id: allPlayoffTeamsSorted.at(3).team.id,
                    name: allPlayoffTeamsSorted.at(3).team.name,
                },
                seedP1: "4",
                playerP2: {
                    id: allPlayoffTeamsSorted.at(12).player.id,
                    name: allPlayoffTeamsSorted.at(12).player.name,
                },
                teamP2: {
                    id: allPlayoffTeamsSorted.at(12).team.id,
                    name: allPlayoffTeamsSorted.at(12).team.name,
                },
                seedP2: "13",
                type: "playoff",
                tournament: { id, name },
                played: false,
                playoff_id: 4,
            },
            {
                playerP1: {
                    id: allPlayoffTeamsSorted.at(5).player.id,
                    name: allPlayoffTeamsSorted.at(5).player.name,
                },
                teamP1: {
                    id: allPlayoffTeamsSorted.at(5).team.id,
                    name: allPlayoffTeamsSorted.at(5).team.name,
                },
                seedP1: "6",
                playerP2: {
                    id: allPlayoffTeamsSorted.at(10).player.id,
                    name: allPlayoffTeamsSorted.at(10).player.name,
                },
                teamP2: {
                    id: allPlayoffTeamsSorted.at(10).team.id,
                    name: allPlayoffTeamsSorted.at(10).team.name,
                },
                seedP2: "11",
                type: "playoff",
                tournament: { id, name },
                played: false,
                playoff_id: 5,
            },
            {
                playerP1: {
                    id: allPlayoffTeamsSorted.at(2).player.id,
                    name: allPlayoffTeamsSorted.at(2).player.name,
                },
                teamP1: {
                    id: allPlayoffTeamsSorted.at(2).team.id,
                    name: allPlayoffTeamsSorted.at(2).team.name,
                },
                seedP1: "3",
                playerP2: {
                    id: allPlayoffTeamsSorted.at(13).player.id,
                    name: allPlayoffTeamsSorted.at(13).player.name,
                },
                teamP2: {
                    id: allPlayoffTeamsSorted.at(13).team.id,
                    name: allPlayoffTeamsSorted.at(13).team.name,
                },
                seedP2: "14",
                type: "playoff",
                tournament: { id, name },
                played: false,
                playoff_id: 6,
            },
            {
                playerP1: {
                    id: allPlayoffTeamsSorted.at(6).player.id,
                    name: allPlayoffTeamsSorted.at(6).player.name,
                },
                teamP1: {
                    id: allPlayoffTeamsSorted.at(6).team.id,
                    name: allPlayoffTeamsSorted.at(6).team.name,
                },
                seedP1: "7",
                playerP2: {
                    id: allPlayoffTeamsSorted.at(9).player.id,
                    name: allPlayoffTeamsSorted.at(9).player.name,
                },
                teamP2: {
                    id: allPlayoffTeamsSorted.at(9).team.id,
                    name: allPlayoffTeamsSorted.at(9).team.name,
                },
                seedP2: "10",
                type: "playoff",
                tournament: { id, name },
                played: false,
                playoff_id: 7,
            },
            {
                playerP1: {
                    id: allPlayoffTeamsSorted.at(1).player.id,
                    name: allPlayoffTeamsSorted.at(1).player.name,
                },
                teamP1: {
                    id: allPlayoffTeamsSorted.at(1).team.id,
                    name: allPlayoffTeamsSorted.at(1).team.name,
                },
                seedP1: "2",
                playerP2: {
                    id: allPlayoffTeamsSorted.at(14).player.id,
                    name: allPlayoffTeamsSorted.at(14).player.name,
                },
                teamP2: {
                    id: allPlayoffTeamsSorted.at(14).team.id,
                    name: allPlayoffTeamsSorted.at(14).team.name,
                },
                seedP2: "15",
                type: "playoff",
                tournament: { id, name },
                played: false,
                playoff_id: 8,
            },
        ]

        const playoff = await originatePlayoffByTournamentId(playoffMatches)

        res.status(200).json({ playoff })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = postPlayoffByTournamentId

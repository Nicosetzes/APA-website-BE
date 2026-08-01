const { createPlayoffByTournamentId } = require("./../../dao")

const originateWorldCupPlayoffByTournamentId = async (
    tournament,
    teams,
    regularMatches
) => {
    const standingsByGroup = {}
    const teamsIndex = {}

    Object.entries(teams).forEach(([groupName, teams]) => {
        standingsByGroup[groupName] = []

        teams.forEach(({ team, player }) => {
            const entry = {
                team,
                player,
                group: groupName,

                points: 0,
                wins: 0,
                draws: 0,
                losses: 0,

                goalsFor: 0,
                goalsAgainst: 0,
                scoringDifference: 0,
            }

            standingsByGroup[groupName].push(entry)

            teamsIndex[team.id] = entry
        })
    })

    regularMatches.forEach((match) => {
        const { teamP1, teamP2, scoreP1, scoreP2, outcome } = match

        const team1 = teamsIndex[teamP1.id]
        const team2 = teamsIndex[teamP2.id]

        if (!team1 || !team2) return

        team1.goalsFor += scoreP1
        team1.goalsAgainst += scoreP2

        team2.goalsFor += scoreP2
        team2.goalsAgainst += scoreP1

        if (outcome?.draw) {
            team1.draws++
            team2.draws++

            team1.points++
            team2.points++
        } else {
            const winnerId = outcome?.teamThatWon?.id

            if (winnerId === teamP1.id) {
                team1.wins++
                team2.losses++

                team1.points += 3
            } else {
                team2.wins++
                team1.losses++

                team2.points += 3
            }
        }
    })

    Object.values(standingsByGroup).forEach((group) => {
        group.forEach((team) => {
            team.scoringDifference = team.goalsFor - team.goalsAgainst
        })

        group.sort(
            (a, b) =>
                b.points - a.points ||
                b.scoringDifference - a.scoringDifference ||
                b.goalsFor - a.goalsFor ||
                a.goalsAgainst - b.goalsAgainst
        )
    })

    const playoffConfig = [
        ["A", "B"],
        ["C", "D"],
        ["E", "F"],
        ["G", "H"],
    ]

    const playoffMatches = []

    playoffConfig.forEach(([group1, group2], index) => {
        playoffMatches.push({
            playerP1: standingsByGroup[group1][0].player,
            teamP1: standingsByGroup[group1][0].team,
            seedP1: `1${group1}`,

            playerP2: standingsByGroup[group2][1].player,
            teamP2: standingsByGroup[group2][1].team,
            seedP2: `2${group2}`,

            type: "playoff",
            tournament,
            played: false,
            playoff_id: index + 1,
        })
    })

    playoffConfig.forEach(([group1, group2], index) => {
        playoffMatches.push({
            playerP1: standingsByGroup[group2][0].player,
            teamP1: standingsByGroup[group2][0].team,
            seedP1: `1${group2}`,

            playerP2: standingsByGroup[group1][1].player,
            teamP2: standingsByGroup[group1][1].team,
            seedP2: `2${group1}`,

            type: "playoff",
            tournament,
            played: false,
            playoff_id: playoffConfig.length + index + 1,
        })
    })

    return await createPlayoffByTournamentId(playoffMatches)
}

module.exports = originateWorldCupPlayoffByTournamentId

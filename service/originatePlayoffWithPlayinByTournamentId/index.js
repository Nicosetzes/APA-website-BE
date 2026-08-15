const { createPlayoffByTournamentId } = require("./../../dao")

const sortByPerformance = (a, b) =>
    b.points - a.points ||
    b.scoringDifference - a.scoringDifference ||
    b.goalsFor - a.goalsFor ||
    a.goalsAgainst - b.goalsAgainst

const originatePlayoffWithPlayinByTournamentId = async (
    tournament,
    teams,
    regularMatches,
    playinMatches
) => {
    const standingsByGroup = {}
    const teamsIndex = {}

    Object.entries(teams).forEach(([groupName, teamsList]) => {
        standingsByGroup[groupName] = []
        teamsList.forEach(({ team, player }) => {
            const entry = {
                team,
                player,
                wins: 0,
                draws: 0,
                losses: 0,
                goalsFor: 0,
                goalsAgainst: 0,
                scoringDifference: 0,
                points: 0,
            }
            standingsByGroup[groupName].push(entry)
            teamsIndex[team.id] = entry
        })
    })

    regularMatches.forEach(({ teamP1, teamP2, scoreP1, scoreP2, outcome }) => {
        const team1 = teamsIndex[teamP1?.id]
        const team2 = teamsIndex[teamP2?.id]

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
            if (outcome?.teamThatWon?.id === teamP1.id) {
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
        group.sort(sortByPerformance)
    })

    const sortedStandingsFromGroupA = standingsByGroup["A"]
    const sortedStandingsFromGroupB = standingsByGroup["B"]

    const allPlayoffTeamsSorted = [
        ...sortedStandingsFromGroupA.slice(0, 6),
        ...sortedStandingsFromGroupB.slice(0, 6),
    ].sort(sortByPerformance)

    const higherPlayinTeams = []
    const lowerPlayinTeams = []

    // playoff_id 1 & 3 are round-1 winners (seeded above round-2 winners 5 & 6)
    playinMatches.forEach(
        ({ outcome: { seedFromTeamThatWon: winnerSeed }, playoff_id }) => {
            if (playoff_id == "1")
                higherPlayinTeams.push(
                    sortedStandingsFromGroupA.at(Number(winnerSeed) - 1)
                )
            if (playoff_id == "3")
                higherPlayinTeams.push(
                    sortedStandingsFromGroupB.at(Number(winnerSeed) - 1)
                )
            if (playoff_id == "5")
                lowerPlayinTeams.push(
                    sortedStandingsFromGroupA.at(Number(winnerSeed) - 1)
                )
            if (playoff_id == "6")
                lowerPlayinTeams.push(
                    sortedStandingsFromGroupB.at(Number(winnerSeed) - 1)
                )
        }
    )

    allPlayoffTeamsSorted.push(
        ...higherPlayinTeams.sort(sortByPerformance),
        ...lowerPlayinTeams.sort(sortByPerformance)
    )

    const playoffMatches = [
        {
            playerP1: allPlayoffTeamsSorted.at(0).player,
            teamP1: allPlayoffTeamsSorted.at(0).team,
            seedP1: "1",
            playerP2: allPlayoffTeamsSorted.at(15).player,
            teamP2: allPlayoffTeamsSorted.at(15).team,
            seedP2: "16",
            type: "playoff",
            tournament,
            played: false,
            playoff_id: 1,
        },
        {
            playerP1: allPlayoffTeamsSorted.at(7).player,
            teamP1: allPlayoffTeamsSorted.at(7).team,
            seedP1: "8",
            playerP2: allPlayoffTeamsSorted.at(8).player,
            teamP2: allPlayoffTeamsSorted.at(8).team,
            seedP2: "9",
            type: "playoff",
            tournament,
            played: false,
            playoff_id: 2,
        },
        {
            playerP1: allPlayoffTeamsSorted.at(4).player,
            teamP1: allPlayoffTeamsSorted.at(4).team,
            seedP1: "5",
            playerP2: allPlayoffTeamsSorted.at(11).player,
            teamP2: allPlayoffTeamsSorted.at(11).team,
            seedP2: "12",
            type: "playoff",
            tournament,
            played: false,
            playoff_id: 3,
        },
        {
            playerP1: allPlayoffTeamsSorted.at(3).player,
            teamP1: allPlayoffTeamsSorted.at(3).team,
            seedP1: "4",
            playerP2: allPlayoffTeamsSorted.at(12).player,
            teamP2: allPlayoffTeamsSorted.at(12).team,
            seedP2: "13",
            type: "playoff",
            tournament,
            played: false,
            playoff_id: 4,
        },
        {
            playerP1: allPlayoffTeamsSorted.at(5).player,
            teamP1: allPlayoffTeamsSorted.at(5).team,
            seedP1: "6",
            playerP2: allPlayoffTeamsSorted.at(10).player,
            teamP2: allPlayoffTeamsSorted.at(10).team,
            seedP2: "11",
            type: "playoff",
            tournament,
            played: false,
            playoff_id: 5,
        },
        {
            playerP1: allPlayoffTeamsSorted.at(2).player,
            teamP1: allPlayoffTeamsSorted.at(2).team,
            seedP1: "3",
            playerP2: allPlayoffTeamsSorted.at(13).player,
            teamP2: allPlayoffTeamsSorted.at(13).team,
            seedP2: "14",
            type: "playoff",
            tournament,
            played: false,
            playoff_id: 6,
        },
        {
            playerP1: allPlayoffTeamsSorted.at(6).player,
            teamP1: allPlayoffTeamsSorted.at(6).team,
            seedP1: "7",
            playerP2: allPlayoffTeamsSorted.at(9).player,
            teamP2: allPlayoffTeamsSorted.at(9).team,
            seedP2: "10",
            type: "playoff",
            tournament,
            played: false,
            playoff_id: 7,
        },
        {
            playerP1: allPlayoffTeamsSorted.at(1).player,
            teamP1: allPlayoffTeamsSorted.at(1).team,
            seedP1: "2",
            playerP2: allPlayoffTeamsSorted.at(14).player,
            teamP2: allPlayoffTeamsSorted.at(14).team,
            seedP2: "15",
            type: "playoff",
            tournament,
            played: false,
            playoff_id: 8,
        },
    ]

    return await createPlayoffByTournamentId(playoffMatches)
}

module.exports = originatePlayoffWithPlayinByTournamentId

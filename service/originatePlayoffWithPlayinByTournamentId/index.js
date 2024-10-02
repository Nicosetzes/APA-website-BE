const { createPlayoffByTournamentId } = require("./../../dao")

const originatePlayoffWithPlayinByTournamentId = async (
    tournament,
    teams,
    regularMatches,
    playinMatches
) => {
    const { teamsFromGroupA, teamsFromGroupB } = teams

    const standingsFromGroupA = []

    const standingsFromGroupB = []

    teamsFromGroupA.forEach(async ({ team, player }) => {
        let wins = regularMatches.filter(
            ({ outcome }) => outcome?.teamThatWon?.id == team.id
        ).length
        let draws = regularMatches.filter(
            ({ teamP1, teamP2, outcome }) =>
                (teamP1.id == team.id || teamP2.id == team.id) && outcome?.draw
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
                (teamP1.id == team.id || teamP2.id == team.id) && outcome?.draw
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

    // const allPlayoffTeams = [
    //     sortedStandingsFromGroupA.at(0),
    //     sortedStandingsFromGroupA.at(1),
    //     sortedStandingsFromGroupA.at(2),
    //     sortedStandingsFromGroupA.at(3),
    //     sortedStandingsFromGroupA.at(4),
    //     sortedStandingsFromGroupA.at(5),
    //     sortedStandingsFromGroupA
    //         .filter(
    //             ({ team }) =>
    //                 team.id == playinMatches.at(0).outcome.teamThatWon.id
    //         )
    //         .at(0),
    //     sortedStandingsFromGroupA
    //         .filter(
    //             ({ team }) =>
    //                 team.id == playinMatches.at(4).outcome.teamThatWon.id
    //         )
    //         .at(0),
    //     sortedStandingsFromGroupB.at(0),
    //     sortedStandingsFromGroupB.at(1),
    //     sortedStandingsFromGroupB.at(2),
    //     sortedStandingsFromGroupB.at(3),
    //     sortedStandingsFromGroupB.at(4),
    //     sortedStandingsFromGroupB.at(5),
    //     sortedStandingsFromGroupB
    //         .filter(
    //             ({ team }) =>
    //                 team.id == playinMatches.at(2).outcome.teamThatWon.id
    //         )
    //         .at(0),
    //     sortedStandingsFromGroupB
    //         .filter(
    //             ({ team }) =>
    //                 team.id == playinMatches.at(5).outcome.teamThatWon.id
    //         )
    //         .at(0),
    // ]

    // const allPlayoffTeamsSorted = allPlayoffTeams
    //     .sort((a, b) => {
    //         if (a.points > b.points) return -1
    //         if (a.points < b.points) return 1

    //         if (a.scoringDifference > b.scoringDifference) return -1
    //         if (a.scoringDifference < b.scoringDifference) return 1

    //         if (a.goalsFor > b.goalsFor) return -1
    //         if (a.goalsFor < b.goalsFor) return 1

    //         if (a.goalsAgainst > b.goalsAgainst) return 1
    //         if (a.goalsAgainst < b.goalsAgainst) return -1
    //     })
    //     .map(({ team, player }) => {
    //         return { team, player }
    //     })

    /* Equipos que clasificaron directo (12) */

    const allPlayoffTeams = [
        sortedStandingsFromGroupA.at(0),
        sortedStandingsFromGroupA.at(1),
        sortedStandingsFromGroupA.at(2),
        sortedStandingsFromGroupA.at(3),
        sortedStandingsFromGroupA.at(4),
        sortedStandingsFromGroupA.at(5),
        sortedStandingsFromGroupB.at(0),
        sortedStandingsFromGroupB.at(1),
        sortedStandingsFromGroupB.at(2),
        sortedStandingsFromGroupB.at(3),
        sortedStandingsFromGroupB.at(4),
        sortedStandingsFromGroupB.at(5),
    ]

    const allPlayoffTeamsSorted = allPlayoffTeams.sort((a, b) => {
        if (a.points > b.points) return -1
        if (a.points < b.points) return 1

        if (a.scoringDifference > b.scoringDifference) return -1
        if (a.scoringDifference < b.scoringDifference) return 1

        if (a.goalsFor > b.goalsFor) return -1
        if (a.goalsFor < b.goalsFor) return 1

        if (a.goalsAgainst > b.goalsAgainst) return 1
        if (a.goalsAgainst < b.goalsAgainst) return -1
    })

    const higherPlayinTeams = []

    const lowerPlayinTeams = []

    // Recorro los partidos jugados de playin y analizo cada caso.
    // Agrego los 2 ganadores de los duelos 7 vs 8 a higherPlayinTeams
    // Agrego los 2 ganadores de la 2da ronda de playin a lowerPlayinTeams

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

    // Ordeno los equipos de cada mini-grupo

    const sortedHigherPlayinTeams = higherPlayinTeams.sort((a, b) => {
        if (a.points > b.points) return -1
        if (a.points < b.points) return 1

        if (a.scoringDifference > b.scoringDifference) return -1
        if (a.scoringDifference < b.scoringDifference) return 1

        if (a.goalsFor > b.goalsFor) return -1
        if (a.goalsFor < b.goalsFor) return 1

        if (a.goalsAgainst > b.goalsAgainst) return 1
        if (a.goalsAgainst < b.goalsAgainst) return -1
    })

    const sortedLowerPlayinTeams = lowerPlayinTeams.sort((a, b) => {
        if (a.points > b.points) return -1
        if (a.points < b.points) return 1

        if (a.scoringDifference > b.scoringDifference) return -1
        if (a.scoringDifference < b.scoringDifference) return 1

        if (a.goalsFor > b.goalsFor) return -1
        if (a.goalsFor < b.goalsFor) return 1

        if (a.goalsAgainst > b.goalsAgainst) return 1
        if (a.goalsAgainst < b.goalsAgainst) return -1
    })

    // Sumo los clasificados del playin a la tabla general.
    // Hacerlo de esta forma me permite priorizar los que clasificaron en la 1ra ronda del playin por sobre los que lo hicieron en la 2da.
    // Utilizo .push para mutar el array original (por scope), con spread operator puedo concatenar y mutar al mismo tiempo

    allPlayoffTeamsSorted.push(
        ...sortedHigherPlayinTeams,
        ...sortedLowerPlayinTeams
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

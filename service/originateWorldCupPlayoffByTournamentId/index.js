const { createPlayoffByTournamentId } = require("./../../dao")

const originateWorldCupPlayoffByTournamentId = async (
    tournament,
    teams,
    regularMatches
) => {
    const {
        teamsFromGroupA,
        teamsFromGroupB,
        teamsFromGroupC,
        teamsFromGroupD,
        teamsFromGroupE,
        teamsFromGroupF,
        teamsFromGroupG,
        teamsFromGroupH,
    } = teams

    const standingsFromGroupA = []
    const standingsFromGroupB = []
    const standingsFromGroupC = []
    const standingsFromGroupD = []
    const standingsFromGroupE = []
    const standingsFromGroupF = []
    const standingsFromGroupG = []
    const standingsFromGroupH = []

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

    teamsFromGroupC.forEach(async ({ team, player }) => {
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

        standingsFromGroupC.push({
            team,
            player,
            goalsFor,
            goalsAgainst,
            scoringDifference,
            points,
        })
    })

    teamsFromGroupD.forEach(async ({ team, player }) => {
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

        standingsFromGroupD.push({
            team,
            player,
            goalsFor,
            goalsAgainst,
            scoringDifference,
            points,
        })
    })

    teamsFromGroupE.forEach(async ({ team, player }) => {
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

        standingsFromGroupE.push({
            team,
            player,
            goalsFor,
            goalsAgainst,
            scoringDifference,
            points,
        })
    })

    teamsFromGroupF.forEach(async ({ team, player }) => {
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

        standingsFromGroupF.push({
            team,
            player,
            goalsFor,
            goalsAgainst,
            scoringDifference,
            points,
        })
    })

    teamsFromGroupG.forEach(async ({ team, player }) => {
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

        standingsFromGroupG.push({
            team,
            player,
            goalsFor,
            goalsAgainst,
            scoringDifference,
            points,
        })
    })

    teamsFromGroupH.forEach(async ({ team, player }) => {
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

        standingsFromGroupH.push({
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

    const sortedStandingsFromGroupC = standingsFromGroupC.sort((a, b) => {
        if (a.points > b.points) return -1
        if (a.points < b.points) return 1

        if (a.scoringDifference > b.scoringDifference) return -1
        if (a.scoringDifference < b.scoringDifference) return 1

        if (a.goalsFor > b.goalsFor) return -1
        if (a.goalsFor < b.goalsFor) return 1

        if (a.goalsAgainst > b.goalsAgainst) return 1
        if (a.goalsAgainst < b.goalsAgainst) return -1
    })

    const sortedStandingsFromGroupD = standingsFromGroupD.sort((a, b) => {
        if (a.points > b.points) return -1
        if (a.points < b.points) return 1

        if (a.scoringDifference > b.scoringDifference) return -1
        if (a.scoringDifference < b.scoringDifference) return 1

        if (a.goalsFor > b.goalsFor) return -1
        if (a.goalsFor < b.goalsFor) return 1

        if (a.goalsAgainst > b.goalsAgainst) return 1
        if (a.goalsAgainst < b.goalsAgainst) return -1
    })

    const sortedStandingsFromGroupE = standingsFromGroupE.sort((a, b) => {
        if (a.points > b.points) return -1
        if (a.points < b.points) return 1

        if (a.scoringDifference > b.scoringDifference) return -1
        if (a.scoringDifference < b.scoringDifference) return 1

        if (a.goalsFor > b.goalsFor) return -1
        if (a.goalsFor < b.goalsFor) return 1

        if (a.goalsAgainst > b.goalsAgainst) return 1
        if (a.goalsAgainst < b.goalsAgainst) return -1
    })

    const sortedStandingsFromGroupF = standingsFromGroupF.sort((a, b) => {
        if (a.points > b.points) return -1
        if (a.points < b.points) return 1

        if (a.scoringDifference > b.scoringDifference) return -1
        if (a.scoringDifference < b.scoringDifference) return 1

        if (a.goalsFor > b.goalsFor) return -1
        if (a.goalsFor < b.goalsFor) return 1

        if (a.goalsAgainst > b.goalsAgainst) return 1
        if (a.goalsAgainst < b.goalsAgainst) return -1
    })

    const sortedStandingsFromGroupG = standingsFromGroupG.sort((a, b) => {
        if (a.points > b.points) return -1
        if (a.points < b.points) return 1

        if (a.scoringDifference > b.scoringDifference) return -1
        if (a.scoringDifference < b.scoringDifference) return 1

        if (a.goalsFor > b.goalsFor) return -1
        if (a.goalsFor < b.goalsFor) return 1

        if (a.goalsAgainst > b.goalsAgainst) return 1
        if (a.goalsAgainst < b.goalsAgainst) return -1
    })

    const sortedStandingsFromGroupH = standingsFromGroupH.sort((a, b) => {
        if (a.points > b.points) return -1
        if (a.points < b.points) return 1

        if (a.scoringDifference > b.scoringDifference) return -1
        if (a.scoringDifference < b.scoringDifference) return 1

        if (a.goalsFor > b.goalsFor) return -1
        if (a.goalsFor < b.goalsFor) return 1

        if (a.goalsAgainst > b.goalsAgainst) return 1
        if (a.goalsAgainst < b.goalsAgainst) return -1
    })

    const playoffMatches = [
        {
            playerP1: {
                id: sortedStandingsFromGroupA.at(0).player.id,
                name: sortedStandingsFromGroupA.at(0).player.name,
            },
            teamP1: {
                id: sortedStandingsFromGroupA.at(0).team.id,
                name: sortedStandingsFromGroupA.at(0).team.name,
            },
            seedP1: "1A",
            playerP2: {
                id: sortedStandingsFromGroupB.at(1).player.id,
                name: sortedStandingsFromGroupB.at(1).player.name,
            },
            teamP2: {
                id: sortedStandingsFromGroupB.at(1).team.id,
                name: sortedStandingsFromGroupB.at(1).team.name,
            },
            seedP2: "2B",
            type: "playoff",
            tournament,
            played: false,
            playoff_id: 1,
        },
        {
            playerP1: {
                id: sortedStandingsFromGroupC.at(0).player.id,
                name: sortedStandingsFromGroupC.at(0).player.name,
            },
            teamP1: {
                id: sortedStandingsFromGroupC.at(0).team.id,
                name: sortedStandingsFromGroupC.at(0).team.name,
            },
            seedP1: "1C",
            playerP2: {
                id: sortedStandingsFromGroupD.at(1).player.id,
                name: sortedStandingsFromGroupD.at(1).player.name,
            },
            teamP2: {
                id: sortedStandingsFromGroupD.at(1).team.id,
                name: sortedStandingsFromGroupD.at(1).team.name,
            },
            seedP2: "2D",
            type: "playoff",
            tournament,
            played: false,
            playoff_id: 2,
        },
        {
            playerP1: {
                id: sortedStandingsFromGroupE.at(0).player.id,
                name: sortedStandingsFromGroupE.at(0).player.name,
            },
            teamP1: {
                id: sortedStandingsFromGroupE.at(0).team.id,
                name: sortedStandingsFromGroupE.at(0).team.name,
            },
            seedP1: "1E",
            playerP2: {
                id: sortedStandingsFromGroupF.at(1).player.id,
                name: sortedStandingsFromGroupF.at(1).player.name,
            },
            teamP2: {
                id: sortedStandingsFromGroupF.at(1).team.id,
                name: sortedStandingsFromGroupF.at(1).team.name,
            },
            seedP2: "2F",
            type: "playoff",
            tournament,
            played: false,
            playoff_id: 3,
        },
        {
            playerP1: {
                id: sortedStandingsFromGroupG.at(0).player.id,
                name: sortedStandingsFromGroupG.at(0).player.name,
            },
            teamP1: {
                id: sortedStandingsFromGroupG.at(0).team.id,
                name: sortedStandingsFromGroupG.at(0).team.name,
            },
            seedP1: "1G",
            playerP2: {
                id: sortedStandingsFromGroupH.at(1).player.id,
                name: sortedStandingsFromGroupH.at(1).player.name,
            },
            teamP2: {
                id: sortedStandingsFromGroupH.at(1).team.id,
                name: sortedStandingsFromGroupH.at(1).team.name,
            },
            seedP2: "2H",
            type: "playoff",
            tournament,
            played: false,
            playoff_id: 4,
        },
        {
            playerP1: {
                id: sortedStandingsFromGroupB.at(0).player.id,
                name: sortedStandingsFromGroupB.at(0).player.name,
            },
            teamP1: {
                id: sortedStandingsFromGroupB.at(0).team.id,
                name: sortedStandingsFromGroupB.at(0).team.name,
            },
            seedP1: "1B",
            playerP2: {
                id: sortedStandingsFromGroupA.at(1).player.id,
                name: sortedStandingsFromGroupA.at(1).player.name,
            },
            teamP2: {
                id: sortedStandingsFromGroupA.at(1).team.id,
                name: sortedStandingsFromGroupA.at(1).team.name,
            },
            seedP2: "2A",
            type: "playoff",
            tournament,
            played: false,
            playoff_id: 5,
        },
        {
            playerP1: {
                id: sortedStandingsFromGroupD.at(0).player.id,
                name: sortedStandingsFromGroupD.at(0).player.name,
            },
            teamP1: {
                id: sortedStandingsFromGroupD.at(0).team.id,
                name: sortedStandingsFromGroupD.at(0).team.name,
            },
            seedP1: "1D",
            playerP2: {
                id: sortedStandingsFromGroupC.at(1).player.id,
                name: sortedStandingsFromGroupC.at(1).player.name,
            },
            teamP2: {
                id: sortedStandingsFromGroupC.at(1).team.id,
                name: sortedStandingsFromGroupC.at(1).team.name,
            },
            seedP2: "2C",
            type: "playoff",
            tournament,
            played: false,
            playoff_id: 6,
        },
        {
            playerP1: {
                id: sortedStandingsFromGroupF.at(0).player.id,
                name: sortedStandingsFromGroupF.at(0).player.name,
            },
            teamP1: {
                id: sortedStandingsFromGroupF.at(0).team.id,
                name: sortedStandingsFromGroupF.at(0).team.name,
            },
            seedP1: "1F",
            playerP2: {
                id: sortedStandingsFromGroupE.at(1).player.id,
                name: sortedStandingsFromGroupE.at(1).player.name,
            },
            teamP2: {
                id: sortedStandingsFromGroupE.at(1).team.id,
                name: sortedStandingsFromGroupE.at(1).team.name,
            },
            seedP2: "2E",
            type: "playoff",
            tournament,
            played: false,
            playoff_id: 7,
        },
        {
            playerP1: {
                id: sortedStandingsFromGroupH.at(0).player.id,
                name: sortedStandingsFromGroupH.at(0).player.name,
            },
            teamP1: {
                id: sortedStandingsFromGroupH.at(0).team.id,
                name: sortedStandingsFromGroupH.at(0).team.name,
            },
            seedP1: "1H",
            playerP2: {
                id: sortedStandingsFromGroupG.at(1).player.id,
                name: sortedStandingsFromGroupG.at(1).player.name,
            },
            teamP2: {
                id: sortedStandingsFromGroupG.at(1).team.id,
                name: sortedStandingsFromGroupG.at(1).team.name,
            },
            seedP2: "2G",
            type: "playoff",
            tournament,
            played: false,
            playoff_id: 8,
        },
    ]
    return await createPlayoffByTournamentId(playoffMatches)
}

module.exports = originateWorldCupPlayoffByTournamentId

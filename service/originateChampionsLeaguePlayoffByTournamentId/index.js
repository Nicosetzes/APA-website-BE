const { createPlayoffByTournamentId } = require("./../../dao")

const originateChampionsLeaguePlayoffByTournamentId = async (
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

    const groupWinners = [
        {
            player: sortedStandingsFromGroupA.at(0).player,
            team: sortedStandingsFromGroupA.at(0).team,
            seed: "1A",
        },
        {
            player: sortedStandingsFromGroupB.at(0).player,
            team: sortedStandingsFromGroupB.at(0).team,
            seed: "1B",
        },
        {
            player: sortedStandingsFromGroupC.at(0).player,
            team: sortedStandingsFromGroupC.at(0).team,
            seed: "1C",
        },
        {
            player: sortedStandingsFromGroupD.at(0).player,
            team: sortedStandingsFromGroupD.at(0).team,
            seed: "1D",
        },
        {
            player: sortedStandingsFromGroupE.at(0).player,
            team: sortedStandingsFromGroupE.at(0).team,
            seed: "1E",
        },
        {
            player: sortedStandingsFromGroupF.at(0).player,
            team: sortedStandingsFromGroupF.at(0).team,
            seed: "1F",
        },
        {
            player: sortedStandingsFromGroupG.at(0).player,
            team: sortedStandingsFromGroupG.at(0).team,
            seed: "1G",
        },
        {
            player: sortedStandingsFromGroupH.at(0).player,
            team: sortedStandingsFromGroupH.at(0).team,
            seed: "1H",
        },
    ]

    const groupFinalists = [
        {
            player: sortedStandingsFromGroupA.at(1).player,
            team: sortedStandingsFromGroupA.at(1).team,
            seed: "2A",
        },
        {
            player: sortedStandingsFromGroupB.at(1).player,
            team: sortedStandingsFromGroupB.at(1).team,
            seed: "2B",
        },
        {
            player: sortedStandingsFromGroupC.at(1).player,
            team: sortedStandingsFromGroupC.at(1).team,
            seed: "2C",
        },
        {
            player: sortedStandingsFromGroupD.at(1).player,
            team: sortedStandingsFromGroupD.at(1).team,
            seed: "2D",
        },
        {
            player: sortedStandingsFromGroupE.at(1).player,
            team: sortedStandingsFromGroupE.at(1).team,
            seed: "2E",
        },
        {
            player: sortedStandingsFromGroupF.at(1).player,
            team: sortedStandingsFromGroupF.at(1).team,
            seed: "2F",
        },
        {
            player: sortedStandingsFromGroupG.at(1).player,
            team: sortedStandingsFromGroupG.at(1).team,
            seed: "2G",
        },
        {
            player: sortedStandingsFromGroupH.at(1).player,
            team: sortedStandingsFromGroupH.at(1).team,
            seed: "2H",
        },
    ]

    // const shuffledGroupWinners = groupWinners
    //     .map((team) => ({
    //         team,
    //         sort: Math.random(),
    //     }))
    //     .sort((a, b) => a.sort - b.sort)
    //     .map(({ team }) => team)

    // const shuffledGroupFinalists = groupFinalists
    //     .map((team) => ({
    //         team,
    //         sort: Math.random(),
    //     }))
    //     .sort((a, b) => a.sort - b.sort)
    //     .map(({ team }) => team)

    const generateChampionsLeaguePlayoffMatches = (
        groupWinners,
        groupFinalists
    ) => {
        const winners = [...groupWinners]
        const finalists = [...groupFinalists]
        const matches = []
        while (winners.length || finalists.length) {
            let randomWinner =
                winners[Math.floor(Math.random() * winners.length)]
            let randomFinalist =
                finalists[Math.floor(Math.random() * finalists.length)]

            if (randomWinner.seed[1] == randomFinalist.seed[1]) continue // Mismo grupo //

            // Creo los partidos de ida y vuelta //

            matches.push({
                playerP1: {
                    id: randomWinner.player.id,
                    name: randomWinner.player.name,
                },
                teamP1: {
                    id: randomWinner.team.id,
                    name: randomWinner.team.name,
                },
                seedP1: randomWinner.seed,
                playerP2: {
                    id: randomFinalist.player.id,
                    name: randomFinalist.player.name,
                },
                teamP2: {
                    id: randomFinalist.team.id,
                    name: randomFinalist.team.name,
                },
                seedP2: randomFinalist.seed,
            })

            matches.push({
                playerP1: {
                    id: randomFinalist.player.id,
                    name: randomFinalist.player.name,
                },
                teamP1: {
                    id: randomFinalist.team.id,
                    name: randomFinalist.team.name,
                },
                seedP1: randomFinalist.seed,
                playerP2: {
                    id: randomWinner.player.id,
                    name: randomWinner.player.name,
                },
                teamP2: {
                    id: randomWinner.team.id,
                    name: randomWinner.team.name,
                },
                seedP2: randomWinner.seed,
            })
            // Averiguo el índice de los equipos elegidos aleatoriamente //

            let randomWinnerIndex = winners.findIndex(
                ({ seed }) => seed == randomWinner.seed
            )
            let randomFinalistIndex = finalists.findIndex(
                ({ seed }) => seed == randomFinalist.seed
            )

            // Elimino los equipos del array, para que no vuelvan a ser seleccionados //

            winners.splice(randomWinnerIndex, 1)
            finalists.splice(randomFinalistIndex, 1)
        }

        const definitiveMatches = matches.map(
            ({ playerP1, teamP1, seedP1, playerP2, teamP2, seedP2 }, index) => {
                if (playerP1.id != playerP2.id) {
                    // Los equipos no son del mismo jugador, por lo tanto son válidos //
                    return {
                        playerP1,
                        teamP1,
                        seedP1,
                        playerP2,
                        teamP2,
                        seedP2,
                        type: "playoff",
                        tournament,
                        played: false,
                        playoff_id: index + 1,
                    }
                } else {
                    // Los equipos son del mismo jugador, agrego valid = false //
                    return {
                        playerP1,
                        teamP1,
                        seedP1,
                        playerP2,
                        teamP2,
                        seedP2,
                        type: "playoff",
                        tournament,
                        played: false,
                        valid: false,
                        playoff_id: index + 1,
                    }
                }
            }
        )

        return definitiveMatches
    }

    const playoffMatches = generateChampionsLeaguePlayoffMatches(
        groupWinners,
        groupFinalists
    )

    return await createPlayoffByTournamentId(playoffMatches)
}

module.exports = originateChampionsLeaguePlayoffByTournamentId

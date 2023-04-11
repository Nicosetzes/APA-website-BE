const {
    orderMatchesFromTournamentById,
    orderPlayoffMatchesFromTournamentById,
    retrieveTournamentById,
} = require("./../../service")

const getWorldCupPlayoffTeamsByTournamentId = async (req, res) => {
    const { tournament } = req.params
    try {
        const tournamentFromDB = await retrieveTournamentById(tournament)
        const regularMatches = await orderMatchesFromTournamentById(tournament)
        const playoffMatches = await orderPlayoffMatchesFromTournamentById(
            tournament
        )
        const teamsFromTournament = tournamentFromDB.teams
        const standings = []

        teamsFromTournament.forEach(async ({ team, player }) => {
            let winsInGroups = regularMatches.filter((match) => {
                let { outcome } = match
                return outcome?.teamThatWon?.id == team.id
            }).length

            let winsInPlayoffs = 0

            if (playoffMatches.length) {
                winsInPlayoffs = playoffMatches.filter((match) => {
                    let { outcome } = match
                    // console.log(type)
                    return outcome?.teamThatWon?.id == team.id
                }).length
            }

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

            let points = winsInGroups * 3 + draws

            let streak = regularMatches
                .filter(
                    ({ teamP1, teamP2 }) =>
                        teamP1.id === team.id || teamP2.id === team.id
                )
                .splice(0, 5) // REVISAR //
                .map(
                    ({
                        outcome,
                        id,
                        playerP1,
                        teamP1,
                        scoreP1,
                        playerP2,
                        teamP2,
                        scoreP2,
                        updatedAt,
                    }) => {
                        const {
                            playerThatWon,
                            teamThatWon,
                            scoreFromTeamThatWon,
                            playerThatLost,
                            teamThatLost,
                            scoreFromTeamThatLost,
                        } = outcome
                        if (teamThatWon && teamThatWon.id === team.id)
                            return {
                                outcome: "w",
                                playerP1: playerThatWon,
                                teamP1: teamThatWon,
                                scoreP1: scoreFromTeamThatWon,
                                playerP2: playerThatLost,
                                teamP2: teamThatLost,
                                scoreP2: scoreFromTeamThatLost,
                                date: updatedAt
                                    ? new Date(updatedAt).toLocaleString()
                                    : new Date(
                                          parseInt(id.substring(0, 8), 16) *
                                              1000
                                      ).toLocaleDateString(),
                            }
                        if (teamThatLost && teamThatLost.id === team.id)
                            return {
                                outcome: "l",
                                playerP1: playerThatLost,
                                teamP1: teamThatLost,
                                scoreP1: scoreFromTeamThatLost,
                                playerP2: playerThatWon,
                                teamP2: teamThatWon,
                                scoreP2: scoreFromTeamThatWon,
                                date: updatedAt
                                    ? new Date(updatedAt).toLocaleString()
                                    : new Date(
                                          parseInt(id.substring(0, 8), 16) *
                                              1000
                                      ).toLocaleDateString(),
                            }
                        if (outcome.draw)
                            return {
                                outcome: "d",
                                playerP1,
                                teamP1,
                                scoreP1,
                                playerP2,
                                teamP2,
                                scoreP2,
                                date: updatedAt
                                    ? new Date(updatedAt).toLocaleString()
                                    : new Date(
                                          parseInt(id.substring(0, 8), 16) *
                                              1000
                                      ).toLocaleDateString(),
                            }
                    }
                )
                .reverse()

            standings.push({
                team,
                player,
                goalsFor,
                goalsAgainst,
                scoringDifference,
                points,
                winsInPlayoffs,
                streak,
                tournament: {
                    name: tournamentFromDB.name,
                    id: tournamentFromDB.id,
                },
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

        const playoffSortedStandingsByGroup = [
            sortedStandings
                .filter(({ team }) => team.group == "A")
                .map(
                    (
                        { player, team, winsInPlayoffs, streak, tournament },
                        index
                    ) => {
                        return {
                            index,
                            player,
                            team,
                            winsInPlayoffs,
                            streak,
                            tournament,
                        }
                    }
                ),
            sortedStandings
                .filter(({ team }) => team.group == "B")
                .map(
                    (
                        { player, team, winsInPlayoffs, streak, tournament },
                        index
                    ) => {
                        return {
                            index,
                            player,
                            team,
                            winsInPlayoffs,
                            streak,
                            tournament,
                        }
                    }
                ),
            sortedStandings
                .filter(({ team }) => team.group == "C")
                .map(
                    (
                        { player, team, winsInPlayoffs, streak, tournament },
                        index
                    ) => {
                        return {
                            index,
                            player,
                            team,
                            winsInPlayoffs,
                            streak,
                            tournament,
                        }
                    }
                ),
            sortedStandings
                .filter(({ team }) => team.group == "D")
                .map(
                    (
                        { player, team, winsInPlayoffs, streak, tournament },
                        index
                    ) => {
                        return {
                            index,
                            player,
                            team,
                            winsInPlayoffs,
                            streak,
                            tournament,
                        }
                    }
                ),
            sortedStandings
                .filter(({ team }) => team.group == "E")
                .map(
                    (
                        { player, team, winsInPlayoffs, streak, tournament },
                        index
                    ) => {
                        return {
                            index,
                            player,
                            team,
                            winsInPlayoffs,
                            streak,
                            tournament,
                        }
                    }
                ),
            sortedStandings
                .filter(({ team }) => team.group == "F")
                .map(
                    (
                        { player, team, winsInPlayoffs, streak, tournament },
                        index
                    ) => {
                        return {
                            index,
                            player,
                            team,
                            winsInPlayoffs,
                            streak,
                            tournament,
                        }
                    }
                ),
            sortedStandings
                .filter(({ team }) => team.group == "G")
                .map(
                    (
                        { player, team, winsInPlayoffs, streak, tournament },
                        index
                    ) => {
                        return {
                            index,
                            player,
                            team,
                            winsInPlayoffs,
                            streak,
                            tournament,
                        }
                    }
                ),
            sortedStandings
                .filter(({ team }) => team.group == "H")
                .map(
                    (
                        { player, team, winsInPlayoffs, streak, tournament },
                        index
                    ) => {
                        return {
                            index,
                            player,
                            team,
                            winsInPlayoffs,
                            streak,
                            tournament,
                        }
                    }
                ),
        ]

        const firstQuadrant = [
            playoffSortedStandingsByGroup[0].at(0),
            playoffSortedStandingsByGroup[1].at(1),
            playoffSortedStandingsByGroup[2].at(0),
            playoffSortedStandingsByGroup[3].at(1),
        ]

        const secondQuadrant = [
            playoffSortedStandingsByGroup[4].at(0),
            playoffSortedStandingsByGroup[5].at(1),
            playoffSortedStandingsByGroup[6].at(0),
            playoffSortedStandingsByGroup[7].at(1),
        ]

        const thirdQuadrant = [
            playoffSortedStandingsByGroup[1].at(0),
            playoffSortedStandingsByGroup[0].at(1),
            playoffSortedStandingsByGroup[3].at(0),
            playoffSortedStandingsByGroup[2].at(1),
        ]

        const fourthQuadrant = [
            playoffSortedStandingsByGroup[5].at(0),
            playoffSortedStandingsByGroup[4].at(1),
            playoffSortedStandingsByGroup[7].at(0),
            playoffSortedStandingsByGroup[6].at(1),
        ]

        res.status(200).send({
            firstQuadrant,
            secondQuadrant,
            thirdQuadrant,
            fourthQuadrant,
        })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getWorldCupPlayoffTeamsByTournamentId

const {
    retrieveTournamentById,
    orderMatchesFromTournamentById,
    retrieveAllNotPlayedMatchesByTournamentId,
} = require("./../../service")

const getStandingsTableByTournamentId = async (req, res) => {
    const { tournament } = req.params
    const { group } = req.query

    try {
        const standings = []

        let teamsFromTournament

        const { id, name, format, players, teams, groups } =
            await retrieveTournamentById(tournament)

        // Revisar el siguiente bloque, podría crear una llamada que traiga especificamente los equipos que necesito //

        if (!groups.length) {
            // El torneo no tiene grupos //
            teamsFromTournament = teams
        } else if (groups.length && !group) {
            // El torneo tiene grupos, pero no hay selección //
            teamsFromTournament = teams.filter((team) => team.group == "A")
        } else {
            // El torneo tiene grupos, y hay selección //
            teamsFromTournament = teams.filter((team) => team.group == group)
        }

        const matches = await orderMatchesFromTournamentById(tournament, group)

        teamsFromTournament.forEach(async ({ team, player }) => {
            let played = matches.filter(
                ({ teamP1, teamP2 }) =>
                    teamP1.id == team.id || teamP2.id == team.id
            ).length
            let wins = matches.filter(
                ({ outcome }) => outcome?.teamThatWon?.id == team.id
            ).length
            let draws = matches.filter(
                ({ teamP1, teamP2, outcome }) =>
                    (teamP1.id == team.id || teamP2.id == team.id) &&
                    outcome?.draw
            ).length
            let losses = matches.filter(
                ({ outcome }) => outcome?.teamThatLost?.id == team.id
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
            let streak = matches
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
                played,
                wins,
                draws,
                losses,
                goalsFor,
                goalsAgainst,
                scoringDifference,
                points,
                streak,
            })
        })

        let sortedStandings = standings.sort(function (a, b) {
            if (a.points > b.points) return -1
            if (a.points < b.points) return 1

            if (a.scoringDifference > b.scoringDifference) return -1
            if (a.scoringDifference < b.scoringDifference) return 1

            if (a.goalsFor > b.goalsFor) return -1
            if (a.goalsFor < b.goalsFor) return 1

            if (a.goalsAgainst > b.goalsAgainst) return 1
            if (a.goalsAgainst < b.goalsAgainst) return -1
        })

        // Averiguo los equipos que ya no tienen chances de campeonar/clasificar a playoff si el formato es league o league_playin_playoff //

        /* RECORDATORIO: el cálculo es en función de los puntos, NO de la diferencia de gol */

        // Primero, me traigo todos los partidos NO jugados

        const notPlayedMatches =
            await retrieveAllNotPlayedMatchesByTournamentId(tournament)

        // console.log(notPlayedMatches)

        if (format == "league") {
            // Reescribo sortedStandings para agregar la info en formato = league

            sortedStandings = sortedStandings.map((team) => {
                // Calculo la cantidad de partidos que le falta a cada equipo

                let amountOfRemainingMatchesForEachTeam =
                    notPlayedMatches.filter(({ teamP1, teamP2 }) => {
                        if (
                            teamP1.id == team.team.id ||
                            teamP2.id == team.team.id
                        ) {
                            return true
                        }
                    }).length

                // Calculo la cantidad de puntos que cada equipo podría llegar a tener

                let pointsThatTeamCouldHaveAtTheEnd =
                    amountOfRemainingMatchesForEachTeam * 3 + team.points

                // Evalúo si cada equipo puede alcanzar la 1ra posición

                return pointsThatTeamCouldHaveAtTheEnd <
                    sortedStandings.at(0).points
                    ? { ...team, eliminated: true }
                    : { ...team }
            })
        }

        if (format == "league_playin_playoff") {
            // Calculo la cantidad de puntos que podría sumar el 7mo clasificado

            let amountOfPotentialPointsFor7thTeam =
                notPlayedMatches.filter(({ teamP1, teamP2 }) => {
                    if (
                        teamP1.id == sortedStandings.at(6).team.id ||
                        teamP2.id == sortedStandings.at(6).team.id
                    ) {
                        return true
                    }
                }).length *
                    3 +
                sortedStandings.at(6).points

            // Calculo la cantidad de puntos que podría sumar el 10mo clasificado

            let amountOfPotentialPointsFor11thTeam =
                notPlayedMatches.filter(({ teamP1, teamP2 }) => {
                    if (
                        teamP1.id == sortedStandings.at(10).team.id ||
                        teamP2.id == sortedStandings.at(10).team.id
                    ) {
                        return true
                    }
                }).length *
                    3 +
                sortedStandings.at(10).points

            // Reescribo sortedStandings para agregar la info en formato league_playin_playoff

            sortedStandings = sortedStandings.map((team) => {
                // Calculo la cantidad de puntos que cada equipo podría sumar

                let amountOfPotentialPointsForTeam =
                    notPlayedMatches.filter(({ teamP1, teamP2 }) => {
                        if (
                            teamP1.id == team.team.id ||
                            teamP2.id == team.team.id
                        ) {
                            return true
                        }
                    }).length *
                        3 +
                    team.points

                /* Calcularé 3 cosas: 
                    1) si cada equipo ya está clasificado de manera directa
                    2) si cada equipo ya está clasificado como mínimo al playin
                    2) si cada equipo ya quedó fuera del playin
                */

                return {
                    ...team,
                    directlyQualified:
                        team.points > amountOfPotentialPointsFor7thTeam,
                    playinQualified:
                        team.points > amountOfPotentialPointsFor11thTeam,
                    eliminated:
                        amountOfPotentialPointsForTeam <
                        sortedStandings.at(9).points,
                }
            })
        }

        res.status(200).send({
            id,
            name,
            activeGroup: group,
            standings: sortedStandings,
        })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getStandingsTableByTournamentId

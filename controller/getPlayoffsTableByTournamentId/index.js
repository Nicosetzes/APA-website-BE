const {
    orderMatchesFromTournamentById,
    retrieveTournamentById,
    retrievePlayinMatchesByTournamentId,
} = require("./../../service")

const getPlayoffsTableByTournamentId = async (req, res) => {
    const { tournament } = req.params

    try {
        const { teams, format } = await retrieveTournamentById(tournament)

        const matches = await orderMatchesFromTournamentById(tournament)

        if (format == "league_playin_playoff") {
            const playinMatches = await retrievePlayinMatchesByTournamentId(
                tournament
            )

            const teamsFromGroupA = teams.filter(({ group }) => group == "A")

            const teamsFromGroupB = teams.filter(({ group }) => group == "B")

            const standingsFromGroupA = []

            const standingsFromGroupB = []

            teamsFromGroupA.forEach(async ({ team, player }) => {
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
                let losses = played - wins - draws
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

                standingsFromGroupA.push({
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
                })
            })

            teamsFromGroupB.forEach(async ({ team, player }) => {
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
                let losses = played - wins - draws
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

                standingsFromGroupB.push({
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
                })
            })

            const sortedStandingsFromGroupA = standingsFromGroupA.sort(
                (a, b) => {
                    if (a.points > b.points) return -1
                    if (a.points < b.points) return 1

                    if (a.scoringDifference > b.scoringDifference) return -1
                    if (a.scoringDifference < b.scoringDifference) return 1

                    if (a.goalsFor > b.goalsFor) return -1
                    if (a.goalsFor < b.goalsFor) return 1

                    if (a.goalsAgainst > b.goalsAgainst) return 1
                    if (a.goalsAgainst < b.goalsAgainst) return -1
                }
            )

            const sortedStandingsFromGroupB = standingsFromGroupB.sort(
                (a, b) => {
                    if (a.points > b.points) return -1
                    if (a.points < b.points) return 1

                    if (a.scoringDifference > b.scoringDifference) return -1
                    if (a.scoringDifference < b.scoringDifference) return 1

                    if (a.goalsFor > b.goalsFor) return -1
                    if (a.goalsFor < b.goalsFor) return 1

                    if (a.goalsAgainst > b.goalsAgainst) return 1
                    if (a.goalsAgainst < b.goalsAgainst) return -1
                }
            )

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

            const areThereAnyWinnersFromPlayinMatches = playinMatches.filter(
                ({ played }) => played
            )

            if (areThereAnyWinnersFromPlayinMatches.length) {
                const higherPlayinTeams = []

                const lowerPlayinTeams = []

                // Recorro los partidos jugados de playin y analizo cada caso.
                // Agrego los 2 ganadores de los duelos 7 vs 8 a higherPlayinTeams
                // Agrego los 2 ganadores de la 2da ronda de playin a lowerPlayinTeams

                areThereAnyWinnersFromPlayinMatches.forEach(
                    ({
                        outcome: { seedFromTeamThatWon: winnerSeed },
                        playoff_id,
                    }) => {
                        if (playoff_id == "1")
                            higherPlayinTeams.push(
                                sortedStandingsFromGroupA.at(
                                    Number(winnerSeed) - 1
                                )
                            )
                        if (playoff_id == "3")
                            higherPlayinTeams.push(
                                sortedStandingsFromGroupB.at(
                                    Number(winnerSeed) - 1
                                )
                            )
                        if (playoff_id == "5")
                            lowerPlayinTeams.push(
                                sortedStandingsFromGroupA.at(
                                    Number(winnerSeed) - 1
                                )
                            )

                        if (playoff_id == "6")
                            lowerPlayinTeams.push(
                                sortedStandingsFromGroupB.at(
                                    Number(winnerSeed) - 1
                                )
                            )
                    }
                )

                // Ordeno los equipos de cada mini-grupo

                const sortedHigherPlayinTeams = higherPlayinTeams.sort(
                    (a, b) => {
                        if (a.points > b.points) return -1
                        if (a.points < b.points) return 1

                        if (a.scoringDifference > b.scoringDifference) return -1
                        if (a.scoringDifference < b.scoringDifference) return 1

                        if (a.goalsFor > b.goalsFor) return -1
                        if (a.goalsFor < b.goalsFor) return 1

                        if (a.goalsAgainst > b.goalsAgainst) return 1
                        if (a.goalsAgainst < b.goalsAgainst) return -1
                    }
                )

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
            }

            return res.status(200).json({ standings: allPlayoffTeamsSorted })
        } else {
            /* No se devuelve */
            return res.status(200).json({ standings: [] })
        }
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getPlayoffsTableByTournamentId

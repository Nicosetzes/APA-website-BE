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

            // Build a quick lookup for team IDs per group
            const groupAIds = new Set(
                teamsFromGroupA.map(({ team }) => team.id)
            )
            const groupBIds = new Set(
                teamsFromGroupB.map(({ team }) => team.id)
            )

            // Single-pass aggregation across all matches
            const statsMap = new Map()
            const ensure = (teamObj, playerObj) => {
                const key = teamObj.id
                if (!statsMap.has(key)) {
                    statsMap.set(key, {
                        team: teamObj,
                        player: playerObj,
                        played: 0,
                        wins: 0,
                        draws: 0,
                        losses: 0,
                        goalsFor: 0,
                        goalsAgainst: 0,
                        scoringDifference: 0,
                        points: 0,
                    })
                }
                return statsMap.get(key)
            }

            for (const m of matches) {
                const {
                    playerP1,
                    teamP1,
                    scoreP1,
                    playerP2,
                    teamP2,
                    scoreP2,
                    outcome,
                } = m

                // Update only if the team belongs to either group A or B
                const includeT1 =
                    groupAIds.has(teamP1.id) || groupBIds.has(teamP1.id)
                const includeT2 =
                    groupAIds.has(teamP2.id) || groupBIds.has(teamP2.id)

                const t1 = includeT1 ? ensure(teamP1, playerP1) : null
                const t2 = includeT2 ? ensure(teamP2, playerP2) : null

                if (t1) {
                    t1.played += 1
                    t1.goalsFor += scoreP1 || 0
                    t1.goalsAgainst += scoreP2 || 0
                }
                if (t2) {
                    t2.played += 1
                    t2.goalsFor += scoreP2 || 0
                    t2.goalsAgainst += scoreP1 || 0
                }

                if (outcome?.draw) {
                    if (t1) {
                        t1.draws += 1
                        t1.points += 1
                    }
                    if (t2) {
                        t2.draws += 1
                        t2.points += 1
                    }
                } else if (outcome?.teamThatWon?.id === teamP1.id) {
                    if (t1) {
                        t1.wins += 1
                        t1.points += 3
                    }
                    if (t2) t2.losses += 1
                } else if (outcome?.teamThatWon?.id === teamP2.id) {
                    if (t2) {
                        t2.wins += 1
                        t2.points += 3
                    }
                    if (t1) t1.losses += 1
                } else if (outcome?.teamThatLost?.id === teamP1.id) {
                    if (t1) t1.losses += 1
                    if (t2) {
                        t2.wins += 1
                        t2.points += 3
                    }
                } else if (outcome?.teamThatLost?.id === teamP2.id) {
                    if (t2) t2.losses += 1
                    if (t1) {
                        t1.wins += 1
                        t1.points += 3
                    }
                }
            }

            // Build standings arrays from statsMap for each group, finalize derived fields
            const standingsFromGroupA = teamsFromGroupA.map(
                ({ team, player }) => {
                    const s = statsMap.get(team.id) || {
                        team,
                        player,
                        played: 0,
                        wins: 0,
                        draws: 0,
                        losses: 0,
                        goalsFor: 0,
                        goalsAgainst: 0,
                        points: 0,
                    }
                    s.scoringDifference =
                        (s.goalsFor || 0) - (s.goalsAgainst || 0)
                    return s
                }
            )

            const standingsFromGroupB = teamsFromGroupB.map(
                ({ team, player }) => {
                    const s = statsMap.get(team.id) || {
                        team,
                        player,
                        played: 0,
                        wins: 0,
                        draws: 0,
                        losses: 0,
                        goalsFor: 0,
                        goalsAgainst: 0,
                        points: 0,
                    }
                    s.scoringDifference =
                        (s.goalsFor || 0) - (s.goalsAgainst || 0)
                    return s
                }
            )

            const cmp = (a, b) =>
                b.points - a.points ||
                b.scoringDifference - a.scoringDifference ||
                b.goalsFor - a.goalsFor ||
                a.goalsAgainst - b.goalsAgainst

            const sortedStandingsFromGroupA = standingsFromGroupA.sort(cmp)
            const sortedStandingsFromGroupB = standingsFromGroupB.sort(cmp)

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

            const allPlayoffTeamsSorted = allPlayoffTeams.sort(cmp)

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

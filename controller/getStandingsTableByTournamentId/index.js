const {
    retrieveTournamentById,
    orderMatchesFromTournamentById,
    retrieveAllNotPlayedMatchesByTournamentId,
} = require("./../../service")

const getStandingsTableByTournamentId = async (req, res) => {
    const { tournament } = req.params
    const { group } = req.query

    try {
        let teamsFromTournament

        const { id, name, format, teams, groups } =
            await retrieveTournamentById(tournament)

        if (!groups?.length) {
            teamsFromTournament = teams
        } else if (groups?.length && !group) {
            teamsFromTournament = teams.filter((team) => team.group == "A")
        } else {
            teamsFromTournament = teams.filter((team) => team.group == group)
        }

        const matches = await orderMatchesFromTournamentById(tournament, group)

        // Build standings in a single pass over matches
        const statsMap = new Map()

        const ensureTeam = (teamObj, playerObj) => {
            if (!statsMap.has(teamObj.id)) {
                statsMap.set(teamObj.id, {
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
                    streak: [], // we'll fill most-recent first, reverse later
                })
            }
            return statsMap.get(teamObj.id)
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
                id,
                updatedAt,
            } = m

            const t1 = ensureTeam(teamP1, playerP1)
            const t2 = ensureTeam(teamP2, playerP2)

            // Update played
            t1.played += 1
            t2.played += 1

            // Goals for/against
            t1.goalsFor += scoreP1 || 0
            t1.goalsAgainst += scoreP2 || 0
            t2.goalsFor += scoreP2 || 0
            t2.goalsAgainst += scoreP1 || 0

            // Results and points
            if (outcome?.draw) {
                t1.draws += 1
                t2.draws += 1
                t1.points += 1
                t2.points += 1
            } else if (outcome?.teamThatWon?.id === teamP1.id) {
                t1.wins += 1
                t2.losses += 1
                t1.points += 3
            } else if (outcome?.teamThatWon?.id === teamP2.id) {
                t2.wins += 1
                t1.losses += 1
                t2.points += 3
            } else if (outcome?.teamThatLost?.id === teamP1.id) {
                // Fallback if only teamThatLost is set
                t1.losses += 1
                t2.wins += 1
                t2.points += 3
            } else if (outcome?.teamThatLost?.id === teamP2.id) {
                t2.losses += 1
                t1.wins += 1
                t1.points += 3
            }

            // Streak entries: use match order (already desc by updatedAt)
            const dateStr = updatedAt
                ? new Date(updatedAt).toLocaleString()
                : new Date(
                      parseInt(String(id).substring(0, 8), 16) * 1000
                  ).toLocaleDateString()

            if (t1.streak.length < 5) {
                if (outcome?.draw) {
                    t1.streak.push({
                        outcome: "d",
                        playerP1,
                        teamP1,
                        scoreP1,
                        playerP2,
                        teamP2,
                        scoreP2,
                        date: dateStr,
                    })
                } else if (outcome?.teamThatWon?.id === teamP1.id) {
                    t1.streak.push({
                        outcome: "w",
                        playerP1: outcome.playerThatWon || playerP1,
                        teamP1: outcome.teamThatWon || teamP1,
                        scoreP1: outcome.scoreFromTeamThatWon ?? scoreP1,
                        playerP2: outcome.playerThatLost || playerP2,
                        teamP2: outcome.teamThatLost || teamP2,
                        scoreP2: outcome.scoreFromTeamThatLost ?? scoreP2,
                        date: dateStr,
                    })
                } else if (outcome?.teamThatLost?.id === teamP1.id) {
                    t1.streak.push({
                        outcome: "l",
                        playerP1: outcome.playerThatLost || playerP1,
                        teamP1: outcome.teamThatLost || teamP1,
                        scoreP1: outcome.scoreFromTeamThatLost ?? scoreP1,
                        playerP2: outcome.playerThatWon || playerP2,
                        teamP2: outcome.teamThatWon || teamP2,
                        scoreP2: outcome.scoreFromTeamThatWon ?? scoreP2,
                        date: dateStr,
                    })
                }
            }

            if (t2.streak.length < 5) {
                if (outcome?.draw) {
                    t2.streak.push({
                        outcome: "d",
                        playerP1,
                        teamP1,
                        scoreP1,
                        playerP2,
                        teamP2,
                        scoreP2,
                        date: dateStr,
                    })
                } else if (outcome?.teamThatWon?.id === teamP2.id) {
                    t2.streak.push({
                        outcome: "w",
                        playerP1: outcome.playerThatWon || playerP2,
                        teamP1: outcome.teamThatWon || teamP2,
                        scoreP1: outcome.scoreFromTeamThatWon ?? scoreP2,
                        playerP2: outcome.playerThatLost || playerP1,
                        teamP2: outcome.teamThatLost || teamP1,
                        scoreP2: outcome.scoreFromTeamThatLost ?? scoreP1,
                        date: dateStr,
                    })
                } else if (outcome?.teamThatLost?.id === teamP2.id) {
                    t2.streak.push({
                        outcome: "l",
                        playerP1: outcome.playerThatLost || playerP2,
                        teamP1: outcome.teamThatLost || teamP2,
                        scoreP1: outcome.scoreFromTeamThatLost ?? scoreP2,
                        playerP2: outcome.playerThatWon || playerP1,
                        teamP2: outcome.teamThatWon || teamP1,
                        scoreP2: outcome.scoreFromTeamThatWon ?? scoreP1,
                        date: dateStr,
                    })
                }
            }
        }

        // Finalize derived stats and keep only teams from tournament/groups
        const standings = []
        for (const { team, player } of teamsFromTournament) {
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
                streak: [],
            }
            s.scoringDifference = (s.goalsFor || 0) - (s.goalsAgainst || 0)
            // Reverse streak to oldest->newest as prior behavior required
            s.streak = [...s.streak].reverse()
            standings.push(s)
        }

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

        const notPlayedMatches =
            await retrieveAllNotPlayedMatchesByTournamentId(tournament, group)

        if (format == "league") {
            // Precompute remaining matches by team with a single pass
            const remainingByTeam = new Map()
            for (const { teamP1, teamP2 } of notPlayedMatches) {
                remainingByTeam.set(
                    teamP1.id,
                    (remainingByTeam.get(teamP1.id) || 0) + 1
                )
                remainingByTeam.set(
                    teamP2.id,
                    (remainingByTeam.get(teamP2.id) || 0) + 1
                )
            }

            sortedStandings = sortedStandings.map((team) => {
                let amountOfRemainingMatchesForEachTeam =
                    remainingByTeam.get(team.team.id) || 0

                let pointsThatTeamCouldHaveAtTheEnd =
                    amountOfRemainingMatchesForEachTeam * 3 + team.points

                return pointsThatTeamCouldHaveAtTheEnd <
                    sortedStandings.at(0).points
                    ? { ...team, eliminated: true }
                    : { ...team }
            })
        }

        if (format == "league_playin_playoff") {
            // Precompute remaining matches per team once (reuse if league already computed above)
            const remainingByTeam = new Map()
            for (const { teamP1, teamP2 } of notPlayedMatches) {
                remainingByTeam.set(
                    teamP1.id,
                    (remainingByTeam.get(teamP1.id) || 0) + 1
                )
                remainingByTeam.set(
                    teamP2.id,
                    (remainingByTeam.get(teamP2.id) || 0) + 1
                )
            }

            // If the group/tournament is finished (no matches left), derive flags from final positions
            if ((notPlayedMatches?.length || 0) === 0) {
                sortedStandings = sortedStandings.map((team, idx) => ({
                    ...team,
                    directlyQualified: idx <= 5, // 1-6
                    playinQualified: idx <= 9, // 1-10
                    eliminated: idx > 9, // 11+
                }))
            } else {
                const calcMaxPotential = (row) =>
                    (remainingByTeam.get(row.team.id) || 0) * 3 + row.points

                // Compute safe worst-case thresholds using ALL contenders below cut lines
                const maxPotentialBelow6 = (() => {
                    const contenders = sortedStandings.slice(6)
                    return contenders.length
                        ? Math.max(...contenders.map(calcMaxPotential))
                        : -Infinity
                })()

                const maxPotentialBelow10 = (() => {
                    const contenders = sortedStandings.slice(10)
                    return contenders.length
                        ? Math.max(...contenders.map(calcMaxPotential))
                        : -Infinity
                })()

                const tenthCurrentPoints =
                    sortedStandings.at(9)?.points ?? -Infinity

                sortedStandings = sortedStandings.map((team) => {
                    const teamMaxPotential = calcMaxPotential(team)
                    return {
                        ...team,
                        // Clinched top-6 if even in worst case no contender (>=7th) can reach your current points
                        directlyQualified: team.points > maxPotentialBelow6,
                        // Clinched at least play-in (top-10) under same logic vs contenders (>=11th)
                        playinQualified: team.points > maxPotentialBelow10,
                        // Eliminated from top-10 if even winning out can't reach current 10th's points
                        eliminated: teamMaxPotential < tenthCurrentPoints,
                    }
                })
            }
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

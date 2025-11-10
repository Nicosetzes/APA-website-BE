const {
    retrieveAllUsers,
    retrieveAllMatches,
    retrieveTournamentById,
    orderMatchesFromTournamentById,
} = require("./../../service")

// Combined summary stats and streaks endpoint
// GET /api/statistics[?tournament=<id>]
// - Global: aggregates across all tournaments for all users
// - Tournament-scoped: aggregates only matches from that tournament and only players registered in it
const getStatistics = async (req, res) => {
    try {
        const tournamentId = String(req.query?.tournament || "").trim()

        let players = []
        let matches = []
        let scope = { tournament: null }

        if (tournamentId) {
            const tDoc = await retrieveTournamentById(tournamentId)
            if (!tDoc) return res.status(404).send("Tournament not found")
            scope.tournament = tournamentId

            // Only players from this tournament
            players = (tDoc.players || []).map((p) => ({
                id: String(p.id),
                name: p.nickname || p.name || String(p.id),
            }))
            // All played valid matches across groups, newest first
            matches =
                (await orderMatchesFromTournamentById(
                    tournamentId,
                    undefined,
                    true
                )) || []
        } else {
            // Global: all users and all matches
            const allUsers = await retrieveAllUsers()
            players = (allUsers || []).map((p) => ({
                id: String(p.id),
                name: p.nickname || p.name || String(p.id),
            }))
            matches = (await retrieveAllMatches()) || []
        }

        // Index players for fast lookup and include zeros for missing
        const playerIndex = new Map(players.map((p) => [p.id, p.name]))
        const playerIdsSet = new Set(players.map((p) => p.id))

        // Per-player aggregates and streak trackers
        const agg = new Map()
        const ensure = (id) => {
            const key = String(id)
            if (!agg.has(key)) {
                agg.set(key, {
                    id: key,
                    name: playerIndex.get(key) || key,
                    played: 0,
                    wins: 0,
                    draws: 0,
                    losses: 0,
                    goalsFor: 0,
                    goalsAgainst: 0,
                    cleanSheets: 0,
                    penaltyWins: 0,
                    matchesScoring3PlusGoals: 0,
                    _uniqueTeamsWon: new Set(), // Track unique teams won with
                    // streaks
                    _curType: null,
                    _curLen: 0,
                    _curDone: false,
                    _prevType: null,
                    _prevLen: 0,
                    _prevEndDate: null, // temp: newest match in current _prev streak
                    _maxW: 0,
                    _maxWDate: null,
                    _maxD: 0,
                    _maxDDate: null,
                    _maxL: 0,
                    _maxLDate: null,
                    // consecutive run trackers (scanned newest -> oldest)
                    _runCS: 0, // clean sheets in a row
                    _maxCS: 0,
                    _maxCSDate: null,
                    _runCSEndDate: null, // temp: newest match in current run
                    _runG1: 0, // scoring >=1 goals in a row
                    _maxG1: 0,
                    _maxG1Date: null,
                    _runG1EndDate: null,
                    _runG2: 0, // scoring >=2 goals in a row
                    _maxG2: 0,
                    _maxG2Date: null,
                    _runG2EndDate: null,
                    _runG3: 0, // scoring >=3 goals in a row
                    _maxG3: 0,
                    _maxG3Date: null,
                    _runG3EndDate: null,
                    _recent: [],
                })
            }
            return agg.get(key)
        }

        // Records trackers
        let highestDiffMatch = null // { diff, match }
        let mostGoalsMatch = null // { total, match }

        // Iterate matches (assumed newest->oldest from services we used)
        for (const m of matches) {
            const p1 = String(m.playerP1?.id || "")
            const p2 = String(m.playerP2?.id || "")
            const s1 = Number(m.scoreP1) || 0
            const s2 = Number(m.scoreP2) || 0

            // record: match diffs and totals
            const diff = Math.abs(s1 - s2)
            const total = s1 + s2
            // For ties, prefer the oldest occurrence: iterate newest->oldest and update on >=
            if (!highestDiffMatch || diff >= highestDiffMatch.diff)
                highestDiffMatch = { diff, match: m }
            // Same rule for total goals ties
            if (!mostGoalsMatch || total >= mostGoalsMatch.total)
                mostGoalsMatch = { total, match: m }

            // p1
            if (p1 && (!tournamentId || playerIdsSet.has(p1))) {
                const S = ensure(p1)
                S.played += 1
                S.goalsFor += s1
                S.goalsAgainst += s2
                if (s2 === 0) S.cleanSheets += 1
                let r = "D"
                if (s1 === s2) {
                    S.draws += 1
                    r = "D"
                    // Check if player won via penalties
                    if (
                        m.outcome?.penalties &&
                        m.outcome?.playerThatWon?.id === p1
                    ) {
                        S.penaltyWins += 1
                    }
                } else if (s1 > s2) {
                    S.wins += 1
                    r = "W"
                    // Track wins with 3+ goals
                    if (s1 >= 3) S.matchesScoring3PlusGoals += 1
                    // Track unique teams won with
                    const teamId = String(m.teamP1?.id || m.teamP1?.name || "")
                    if (teamId) S._uniqueTeamsWon.add(teamId)
                } else {
                    S.losses += 1
                    r = "L"
                }
                // per-type consecutive runs
                if (s2 === 0) {
                    S._runCS += 1
                    if (!S._runCSEndDate) S._runCSEndDate = m.updatedAt || null
                } else {
                    S._runCS = 0
                    S._runCSEndDate = null
                }
                if (S._runCS > S._maxCS) {
                    S._maxCS = S._runCS
                    S._maxCSDate = S._runCSEndDate
                }
                if (s1 >= 1) {
                    S._runG1 += 1
                    if (!S._runG1EndDate) S._runG1EndDate = m.updatedAt || null
                } else {
                    S._runG1 = 0
                    S._runG1EndDate = null
                }
                if (S._runG1 > S._maxG1) {
                    S._maxG1 = S._runG1
                    S._maxG1Date = S._runG1EndDate
                }
                if (s1 >= 2) {
                    S._runG2 += 1
                    if (!S._runG2EndDate) S._runG2EndDate = m.updatedAt || null
                } else {
                    S._runG2 = 0
                    S._runG2EndDate = null
                }
                if (S._runG2 > S._maxG2) {
                    S._maxG2 = S._runG2
                    S._maxG2Date = S._runG2EndDate
                }
                if (s1 >= 3) {
                    S._runG3 += 1
                    if (!S._runG3EndDate) S._runG3EndDate = m.updatedAt || null
                } else {
                    S._runG3 = 0
                    S._runG3EndDate = null
                }
                if (S._runG3 > S._maxG3) {
                    S._maxG3 = S._runG3
                    S._maxG3Date = S._runG3EndDate
                }
                // current streak (most recent first)
                if (!S._curDone) {
                    if (S._curType === null) {
                        S._curType = r
                        S._curLen = 1
                    } else if (S._curType === r) {
                        S._curLen += 1
                    } else {
                        S._curDone = true
                    }
                }
                // longest streak trackers (scan newest->oldest)
                if (S._prevType === r) {
                    S._prevLen += 1
                } else {
                    // finalize previous streak before switching type
                    if (S._prevType === "W" && S._prevLen > S._maxW) {
                        S._maxW = S._prevLen
                        S._maxWDate = S._prevEndDate
                    }
                    if (S._prevType === "D" && S._prevLen > S._maxD) {
                        S._maxD = S._prevLen
                        S._maxDDate = S._prevEndDate
                    }
                    if (S._prevType === "L" && S._prevLen > S._maxL) {
                        S._maxL = S._prevLen
                        S._maxLDate = S._prevEndDate
                    }
                    S._prevType = r
                    S._prevLen = 1
                    S._prevEndDate = m.updatedAt || null
                }
                if (S._recent.length < 5) {
                    S._recent.push({
                        outcome: r.toLowerCase(),
                        playerP1: m.playerP1,
                        teamP1: m.teamP1,
                        scoreP1: m.scoreP1,
                        playerP2: m.playerP2,
                        teamP2: m.teamP2,
                        scoreP2: m.scoreP2,
                        date: m.updatedAt || null,
                        tournament: m.tournament?.name || null,
                    })
                }
            }

            // p2
            if (p2 && (!tournamentId || playerIdsSet.has(p2))) {
                const S = ensure(p2)
                S.played += 1
                S.goalsFor += s2
                S.goalsAgainst += s1
                if (s1 === 0) S.cleanSheets += 1
                let r = "D"
                if (s1 === s2) {
                    S.draws += 1
                    r = "D"
                    // Check if player won via penalties
                    if (
                        m.outcome?.penalties &&
                        m.outcome?.playerThatWon?.id === p2
                    ) {
                        S.penaltyWins += 1
                    }
                } else if (s2 > s1) {
                    S.wins += 1
                    r = "W"
                    // Track wins with 3+ goals
                    if (s2 >= 3) S.matchesScoring3PlusGoals += 1
                    // Track unique teams won with
                    const teamId = String(m.teamP2?.id || m.teamP2?.name || "")
                    if (teamId) S._uniqueTeamsWon.add(teamId)
                } else {
                    S.losses += 1
                    r = "L"
                }
                if (s1 === 0) {
                    S._runCS += 1
                    if (!S._runCSEndDate) S._runCSEndDate = m.updatedAt || null
                } else {
                    S._runCS = 0
                    S._runCSEndDate = null
                }
                if (S._runCS > S._maxCS) {
                    S._maxCS = S._runCS
                    S._maxCSDate = S._runCSEndDate
                }
                if (s2 >= 1) {
                    S._runG1 += 1
                    if (!S._runG1EndDate) S._runG1EndDate = m.updatedAt || null
                } else {
                    S._runG1 = 0
                    S._runG1EndDate = null
                }
                if (S._runG1 > S._maxG1) {
                    S._maxG1 = S._runG1
                    S._maxG1Date = S._runG1EndDate
                }
                if (s2 >= 2) {
                    S._runG2 += 1
                    if (!S._runG2EndDate) S._runG2EndDate = m.updatedAt || null
                } else {
                    S._runG2 = 0
                    S._runG2EndDate = null
                }
                if (S._runG2 > S._maxG2) {
                    S._maxG2 = S._runG2
                    S._maxG2Date = S._runG2EndDate
                }
                if (s2 >= 3) {
                    S._runG3 += 1
                    if (!S._runG3EndDate) S._runG3EndDate = m.updatedAt || null
                } else {
                    S._runG3 = 0
                    S._runG3EndDate = null
                }
                if (S._runG3 > S._maxG3) {
                    S._maxG3 = S._runG3
                    S._maxG3Date = S._runG3EndDate
                }
                if (!S._curDone) {
                    if (S._curType === null) {
                        S._curType = r
                        S._curLen = 1
                    } else if (S._curType === r) {
                        S._curLen += 1
                    } else {
                        S._curDone = true
                    }
                }
                if (S._prevType === r) {
                    S._prevLen += 1
                } else {
                    if (S._prevType === "W" && S._prevLen > S._maxW) {
                        S._maxW = S._prevLen
                        S._maxWDate = S._prevEndDate
                    }
                    if (S._prevType === "D" && S._prevLen > S._maxD) {
                        S._maxD = S._prevLen
                        S._maxDDate = S._prevEndDate
                    }
                    if (S._prevType === "L" && S._prevLen > S._maxL) {
                        S._maxL = S._prevLen
                        S._maxLDate = S._prevEndDate
                    }
                    S._prevType = r
                    S._prevLen = 1
                    S._prevEndDate = m.updatedAt || null
                }
                if (S._recent.length < 5) {
                    S._recent.push({
                        outcome: r.toLowerCase(),
                        playerP1: m.playerP1,
                        teamP1: m.teamP1,
                        scoreP1: m.scoreP1,
                        playerP2: m.playerP2,
                        teamP2: m.teamP2,
                        scoreP2: m.scoreP2,
                        date: m.updatedAt || null,
                        tournament: m.tournament?.name || null,
                    })
                }
            }
        }

        // finalize longest trackers for the tail streaks
        for (const S of agg.values()) {
            if (S._prevType === "W" && S._prevLen > S._maxW) {
                S._maxW = S._prevLen
                S._maxWDate = S._prevEndDate
            }
            if (S._prevType === "D" && S._prevLen > S._maxD) {
                S._maxD = S._prevLen
                S._maxDDate = S._prevEndDate
            }
            if (S._prevType === "L" && S._prevLen > S._maxL) {
                S._maxL = S._prevLen
                S._maxLDate = S._prevEndDate
            }
        }

        // Ensure all players show up (with zeros)
        for (const p of players) ensure(p.id)

        // Build players stats output
        const playersOut = Array.from(agg.values())
            .map((S) => {
                const effectiveness = S.played
                    ? Number(
                          (
                              ((S.wins * 3 + S.draws) / (S.played * 3)) *
                              100
                          ).toFixed(2)
                      )
                    : 0
                const out = {
                    player: { id: S.id, name: S.name },
                    wins: S.wins,
                    draws: S.draws,
                    losses: S.losses,
                    totalMatches: S.played,
                    goalsFor: S.goalsFor,
                    goalsAgainst: S.goalsAgainst,
                    scoringDifference:
                        (S.goalsFor || 0) - (S.goalsAgainst || 0),
                    effectiveness,
                    current_streak: { type: S._curType, length: S._curLen },
                    recent: S._recent.slice().reverse(),
                    cleanSheets: S.cleanSheets,
                }
                if (tournamentId) {
                    const bestType = [
                        { t: "W", v: S._maxW },
                        { t: "D", v: S._maxD },
                        { t: "L", v: S._maxL },
                    ].sort((a, b) => b.v - a.v)[0]
                    out.longest_streak = bestType?.v
                        ? { type: bestType.t, length: bestType.v }
                        : { type: null, length: 0 }
                }
                return out
            })
            .sort((a, b) => b.totalMatches - a.totalMatches)

        // Leaderboards
        const vals = Array.from(agg.values())

        const winsLeaderboard = [...playersOut]
            .map((p) => ({ player: p.player, wins: p.wins }))
            .sort((a, b) => b.wins - a.wins)
        const effectivenessLeaderboard = [...playersOut]
            .map((p) => ({ player: p.player, effectiveness: p.effectiveness }))
            .sort((a, b) => b.effectiveness - a.effectiveness)
        const goalsLeaderboard = [...playersOut]
            .map((p) => ({ player: p.player, goalsFor: p.goalsFor }))
            .sort((a, b) => b.goalsFor - a.goalsFor)

        // New leaderboards with per-match calculations
        const winPercentageLeaderboard = vals
            .filter((S) => S.played > 0)
            .map((S) => ({
                player: { id: S.id, name: S.name },
                winPercentage: Number(((S.wins / S.played) * 100).toFixed(2)),
            }))
            .sort((a, b) => b.winPercentage - a.winPercentage)

        const lossPercentageLeaderboard = vals
            .filter((S) => S.played > 0)
            .map((S) => ({
                player: { id: S.id, name: S.name },
                lossPercentage: Number(
                    ((S.losses / S.played) * 100).toFixed(2)
                ),
            }))
            .sort((a, b) => a.lossPercentage - b.lossPercentage)

        const goalsForPerMatchLeaderboard = vals
            .filter((S) => S.played > 0)
            .map((S) => ({
                player: { id: S.id, name: S.name },
                goalsForPerMatch: Number((S.goalsFor / S.played).toFixed(2)),
            }))
            .sort((a, b) => b.goalsForPerMatch - a.goalsForPerMatch)

        const goalsAgainstPerMatchLeaderboard = vals
            .filter((S) => S.played > 0)
            .map((S) => ({
                player: { id: S.id, name: S.name },
                goalsAgainstPerMatch: Number(
                    (S.goalsAgainst / S.played).toFixed(2)
                ),
            }))
            .sort((a, b) => a.goalsAgainstPerMatch - b.goalsAgainstPerMatch)

        const cleanSheetsPercentageLeaderboard = vals
            .filter((S) => S.played > 0)
            .map((S) => ({
                player: { id: S.id, name: S.name },
                cleanSheetsPercentage: Number(
                    ((S.cleanSheets / S.played) * 100).toFixed(2)
                ),
            }))
            .sort((a, b) => b.cleanSheetsPercentage - a.cleanSheetsPercentage)

        const winsWithUniqueTeamsLeaderboard = vals
            .map((S) => ({
                player: { id: S.id, name: S.name },
                winsWithUniqueTeams: S._uniqueTeamsWon.size,
            }))
            .sort((a, b) => b.winsWithUniqueTeams - a.winsWithUniqueTeams)

        const matchesScoring3PlusGoalsLeaderboard = vals
            .map((S) => ({
                player: { id: S.id, name: S.name },
                matchesScoring3PlusGoals: S.matchesScoring3PlusGoals,
            }))
            .sort(
                (a, b) =>
                    b.matchesScoring3PlusGoals - a.matchesScoring3PlusGoals
            )

        const penaltyWinsLeaderboard = vals
            .map((S) => ({
                player: { id: S.id, name: S.name },
                penaltyWins: S.penaltyWins,
            }))
            .sort((a, b) => b.penaltyWins - a.penaltyWins)

        // Records
        // Longest clean sheets in a row and consecutive scoring thresholds
        const maxCSRow = Math.max(...vals.map((S) => S._maxCS), 0)
        const maxG1Row = Math.max(...vals.map((S) => S._maxG1), 0)
        const maxG2Row = Math.max(...vals.map((S) => S._maxG2), 0)
        const maxG3Row = Math.max(...vals.map((S) => S._maxG3), 0)
        const maxWRow = Math.max(...vals.map((S) => S._maxW), 0)
        const maxDRow = Math.max(...vals.map((S) => S._maxD), 0)
        const maxLRow = Math.max(...vals.map((S) => S._maxL), 0)

        const records = {
            highest_scoring_difference_match: highestDiffMatch
                ? {
                      diff: highestDiffMatch.diff,
                      match: {
                          player1:
                              highestDiffMatch.match.playerP1?.name ||
                              highestDiffMatch.match.playerP1?.nickname,
                          team1: highestDiffMatch.match.teamP1?.name || null,
                          player2:
                              highestDiffMatch.match.playerP2?.name ||
                              highestDiffMatch.match.playerP2?.nickname,
                          team2: highestDiffMatch.match.teamP2?.name || null,
                          score: `${highestDiffMatch.match.scoreP1}-${highestDiffMatch.match.scoreP2}`,
                          tournament:
                              highestDiffMatch.match.tournament?.name || null,
                          date: highestDiffMatch.match.updatedAt || null,
                      },
                  }
                : null,
            highest_total_goals_match: mostGoalsMatch
                ? {
                      total: mostGoalsMatch.total,
                      match: {
                          player1:
                              mostGoalsMatch.match.playerP1?.name ||
                              mostGoalsMatch.match.playerP1?.nickname,
                          team1: mostGoalsMatch.match.teamP1?.name || null,
                          player2:
                              mostGoalsMatch.match.playerP2?.name ||
                              mostGoalsMatch.match.playerP2?.nickname,
                          team2: mostGoalsMatch.match.teamP2?.name || null,
                          score: `${mostGoalsMatch.match.scoreP1}-${mostGoalsMatch.match.scoreP2}`,
                          tournament:
                              mostGoalsMatch.match.tournament?.name || null,
                          date: mostGoalsMatch.match.updatedAt || null,
                      },
                  }
                : null,
            most_clean_sheets_in_a_row:
                maxCSRow > 0
                    ? {
                          count: maxCSRow,
                          players: vals
                              .filter((S) => S._maxCS === maxCSRow)
                              .map((S) => ({
                                  id: S.id,
                                  name: S.name,
                                  date: S._maxCSDate,
                              })),
                      }
                    : null,
            most_consecutive_matches_scoring_1_plus_goals:
                maxG1Row > 0
                    ? {
                          count: maxG1Row,
                          players: vals
                              .filter((S) => S._maxG1 === maxG1Row)
                              .map((S) => ({
                                  id: S.id,
                                  name: S.name,
                                  date: S._maxG1Date,
                              })),
                      }
                    : null,
            most_consecutive_matches_scoring_2_plus_goals:
                maxG2Row > 0
                    ? {
                          count: maxG2Row,
                          players: vals
                              .filter((S) => S._maxG2 === maxG2Row)
                              .map((S) => ({
                                  id: S.id,
                                  name: S.name,
                                  date: S._maxG2Date,
                              })),
                      }
                    : null,
            most_consecutive_matches_scoring_3_plus_goals:
                maxG3Row > 0
                    ? {
                          count: maxG3Row,
                          players: vals
                              .filter((S) => S._maxG3 === maxG3Row)
                              .map((S) => ({
                                  id: S.id,
                                  name: S.name,
                                  date: S._maxG3Date,
                              })),
                      }
                    : null,
            most_wins_in_a_row:
                maxWRow > 0
                    ? {
                          count: maxWRow,
                          players: vals
                              .filter((S) => S._maxW === maxWRow)
                              .map((S) => ({
                                  id: S.id,
                                  name: S.name,
                                  date: S._maxWDate,
                              })),
                      }
                    : null,
            most_draws_in_a_row:
                maxDRow > 0
                    ? {
                          count: maxDRow,
                          players: vals
                              .filter((S) => S._maxD === maxDRow)
                              .map((S) => ({
                                  id: S.id,
                                  name: S.name,
                                  date: S._maxDDate,
                              })),
                      }
                    : null,
            most_losses_in_a_row:
                maxLRow > 0
                    ? {
                          count: maxLRow,
                          players: vals
                              .filter((S) => S._maxL === maxLRow)
                              .map((S) => ({
                                  id: S.id,
                                  name: S.name,
                                  date: S._maxLDate,
                              })),
                      }
                    : null,
        }

        return res.status(200).json({
            scope,
            players: playersOut,
            leaderboards: {
                wins: winsLeaderboard,
                goalsFor: goalsLeaderboard,
                matchesScoring3PlusGoals: matchesScoring3PlusGoalsLeaderboard,
                cleanSheets: [...playersOut]
                    .map((p) => ({
                        player: p.player,
                        cleanSheets: p.cleanSheets,
                    }))
                    .sort((a, b) => b.cleanSheets - a.cleanSheets),
                effectiveness: effectivenessLeaderboard,
                winPercentage: winPercentageLeaderboard,
                lossPercentage: lossPercentageLeaderboard,
                goalsForPerMatch: goalsForPerMatchLeaderboard,
                goalsAgainstPerMatch: goalsAgainstPerMatchLeaderboard,
                cleanSheetsPercentage: cleanSheetsPercentageLeaderboard,
                penaltyWins: penaltyWinsLeaderboard,
                winsWithUniqueTeams: winsWithUniqueTeamsLeaderboard,
            },
            records,
        })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getStatistics

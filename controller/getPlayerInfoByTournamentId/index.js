const {
    retrievePlayerMatchesByTournamentId,
    retrieveTournamentById,
    retrieveTournamentPlayersByTournamentId,
    retrieveAllPlayedMatchesByTournamentId,
} = require("../../service")

const computeStreak = (results) => {
    if (!results.length) return null
    const type = results[results.length - 1]
    let count = 0
    for (let i = results.length - 1; i >= 0 && results[i] === type; i--) count++
    return { type, count }
}

const getPlayerInfoByTournamentId = async (req, res) => {
    const { tournament } = req.params
    const playerQuery = (req.query.player || "all").toString()
    // matches=true by default; treat 'false', '0', 'no', 'off' (case-insensitive) as false
    const { matches: matchesQuery } = req.query
    const includeMatches =
        matchesQuery === undefined
            ? true
            : !["false", "0", "no", "off"].includes(
                  String(matchesQuery).toLowerCase()
              )

    try {
        // Always grab tournament data for teams and players list
        const tournamentDoc = await retrieveTournamentById(tournament)
        if (!tournamentDoc) return res.status(404).send("Tournament not found")

        const teams = tournamentDoc.teams || []
        const playersList =
            (await retrieveTournamentPlayersByTournamentId(tournament)) || []

        // Helper to get player name from tournament players list
        const getName = (id) => {
            const p = playersList.find((x) => String(x.id) === String(id))
            return p?.nickname || p?.name || String(id)
        }

        if (playerQuery === "all") {
            // Fetch all played & valid matches once
            const allMatches =
                (await retrieveAllPlayedMatchesByTournamentId(tournament)) || []

            // Ensure all players appear even with zero matches
            const resultMap = new Map()
            for (const p of playersList) {
                resultMap.set(String(p.id), {
                    player: { id: String(p.id), name: getName(p.id) },
                    teams: teams
                        .filter((t) => String(t.player?.id) === String(p.id))
                        .map(({ team }) => team),
                    stats: {
                        played: 0,
                        wins: 0,
                        draws: 0,
                        losses: 0,
                        goalsFor: 0,
                        goalsAgainst: 0,
                        scoringDifference: 0,
                        effectiveness: 0,
                        cleanSheets: 0,
                    },
                    _results: [],
                    _teamStats: new Map(),
                    ...(includeMatches ? { matches: [] } : {}),
                })
            }

            // Single pass: update stats for P1 and P2 per match
            for (const m of allMatches) {
                const p1 = String(m.playerP1?.id)
                const p2 = String(m.playerP2?.id)
                const winnerId = String(m.outcome?.playerThatWon?.id || "")
                const loserId = String(m.outcome?.playerThatLost?.id || "")

                if (p1 && resultMap.has(p1)) {
                    const entry = resultMap.get(p1)
                    const ga1 = Number(m.scoreP2) || 0
                    const res1 =
                        p1 === winnerId ? "W" : p1 === loserId ? "L" : "D"
                    entry.stats.played += 1
                    entry.stats.goalsFor += Number(m.scoreP1) || 0
                    entry.stats.goalsAgainst += ga1
                    if (res1 === "W") entry.stats.wins += 1
                    else if (res1 === "L") entry.stats.losses += 1
                    else entry.stats.draws += 1
                    if (ga1 === 0) entry.stats.cleanSheets += 1
                    entry._results.push(res1)
                    const tk1 = String(m.teamP1?.id)
                    if (tk1) {
                        if (!entry._teamStats.has(tk1))
                            entry._teamStats.set(tk1, {
                                team: m.teamP1,
                                wins: 0,
                                draws: 0,
                                losses: 0,
                                played: 0,
                            })
                        const ts1 = entry._teamStats.get(tk1)
                        ts1.played++
                        if (res1 === "W") ts1.wins++
                        else if (res1 === "L") ts1.losses++
                        else ts1.draws++
                    }
                    if (includeMatches) entry.matches.push(m)
                }

                if (p2 && resultMap.has(p2)) {
                    const entry = resultMap.get(p2)
                    const ga2 = Number(m.scoreP1) || 0
                    const res2 =
                        p2 === winnerId ? "W" : p2 === loserId ? "L" : "D"
                    entry.stats.played += 1
                    entry.stats.goalsFor += Number(m.scoreP2) || 0
                    entry.stats.goalsAgainst += ga2
                    if (res2 === "W") entry.stats.wins += 1
                    else if (res2 === "L") entry.stats.losses += 1
                    else entry.stats.draws += 1
                    if (ga2 === 0) entry.stats.cleanSheets += 1
                    entry._results.push(res2)
                    const tk2 = String(m.teamP2?.id)
                    if (tk2) {
                        if (!entry._teamStats.has(tk2))
                            entry._teamStats.set(tk2, {
                                team: m.teamP2,
                                wins: 0,
                                draws: 0,
                                losses: 0,
                                played: 0,
                            })
                        const ts2 = entry._teamStats.get(tk2)
                        ts2.played++
                        if (res2 === "W") ts2.wins++
                        else if (res2 === "L") ts2.losses++
                        else ts2.draws++
                    }
                    if (includeMatches) entry.matches.push(m)
                }
            }

            // Finalize stats
            const playersOut = playersList.map((p) => {
                const entry = resultMap.get(String(p.id))
                const s = entry.stats
                const reversedResults = entry._results.reverse() // oldest-to-newest order

                s.scoringDifference = s.goalsFor - s.goalsAgainst
                s.effectiveness = s.played
                    ? Number(
                          (
                              ((s.wins * 3 + s.draws) / (s.played * 3)) *
                              100
                          ).toFixed(2)
                      )
                    : 0
                s.winRate = s.played
                    ? Number(((s.wins / s.played) * 100).toFixed(2))
                    : 0
                s.goalsPerMatch = s.played
                    ? Number((s.goalsFor / s.played).toFixed(2))
                    : 0
                s.goalsAgainstPerMatch = s.played
                    ? Number((s.goalsAgainst / s.played).toFixed(2))
                    : 0
                s.recentForm = reversedResults.slice(-10)
                s.currentStreak = computeStreak(reversedResults)

                const teamStatsArr = [...entry._teamStats.values()]
                const teamEff = (ts) =>
                    ts.played ? (ts.wins * 3 + ts.draws) / (ts.played * 3) : 0
                teamStatsArr.sort((a, b) => teamEff(b) - teamEff(a))
                teamStatsArr.forEach((ts) => {
                    ts.effectiveness = ts.played
                        ? Number((teamEff(ts) * 100).toFixed(2))
                        : 0
                    ts.winRate = ts.played
                        ? Number(((ts.wins / ts.played) * 100).toFixed(2))
                        : 0
                })
                entry.bestTeam = teamStatsArr[0] || null
                entry.worstTeam = teamStatsArr[teamStatsArr.length - 1] || null

                delete entry._results
                delete entry._teamStats
                return entry
            })

            return res.status(200).json({ players: playersOut })
        }

        // Single player path
        const playerId = String(playerQuery)
        const matchesFromDB = await retrievePlayerMatchesByTournamentId(
            tournament,
            playerId,
            true
        )

        const teamsFromDB = teams
            .filter((t) => String(t.player?.id) === playerId)
            .map(({ team }) => team)

        // Single pass stats computation
        let played = 0
        let wins = 0
        let losses = 0
        let draws = 0
        let goalsFor = 0
        let goalsAgainst = 0
        let cleanSheets = 0
        const results = []
        const teamStatsMap = new Map()

        for (const m of matchesFromDB || []) {
            const isP1 = String(m.playerP1?.id) === playerId
            const isP2 = String(m.playerP2?.id) === playerId
            if (!isP1 && !isP2) continue

            played += 1
            const gf = Number(isP1 ? m.scoreP1 : m.scoreP2) || 0
            const ga = Number(isP1 ? m.scoreP2 : m.scoreP1) || 0
            goalsFor += gf
            goalsAgainst += ga
            if (ga === 0) cleanSheets += 1

            const winnerId = String(m.outcome?.playerThatWon?.id || "")
            const loserId = String(m.outcome?.playerThatLost?.id || "")
            const res =
                winnerId === playerId ? "W" : loserId === playerId ? "L" : "D"
            if (res === "W") wins += 1
            else if (res === "L") losses += 1
            else draws += 1
            results.push(res)

            const team = isP1 ? m.teamP1 : m.teamP2
            const tk = String(team?.id)
            if (tk) {
                if (!teamStatsMap.has(tk))
                    teamStatsMap.set(tk, {
                        team,
                        wins: 0,
                        draws: 0,
                        losses: 0,
                        played: 0,
                    })
                const ts = teamStatsMap.get(tk)
                ts.played++
                if (res === "W") ts.wins++
                else if (res === "L") ts.losses++
                else ts.draws++
            }
        }

        const scoringDifference = goalsFor - goalsAgainst
        const reversedResults = results.reverse() // oldest-to-newest order
        const effectiveness = played
            ? Number((((wins * 3 + draws) / (played * 3)) * 100).toFixed(2))
            : 0
        const winRate = played ? Number(((wins / played) * 100).toFixed(2)) : 0
        const goalsPerMatch = played
            ? Number((goalsFor / played).toFixed(2))
            : 0
        const goalsAgainstPerMatch = played
            ? Number((goalsAgainst / played).toFixed(2))
            : 0

        const teamStatsArr = [...teamStatsMap.values()]
        const teamEff = (ts) =>
            ts.played ? (ts.wins * 3 + ts.draws) / (ts.played * 3) : 0
        teamStatsArr.sort((a, b) => teamEff(b) - teamEff(a))
        teamStatsArr.forEach((ts) => {
            ts.effectiveness = ts.played
                ? Number((teamEff(ts) * 100).toFixed(2))
                : 0
            ts.winRate = ts.played
                ? Number(((ts.wins / ts.played) * 100).toFixed(2))
                : 0
        })

        const stats = {
            played,
            wins,
            draws,
            losses,
            goalsFor,
            goalsAgainst,
            scoringDifference,
            effectiveness,
            winRate,
            goalsPerMatch,
            goalsAgainstPerMatch,
            cleanSheets,
            recentForm: reversedResults.slice(-10),
            currentStreak: computeStreak(reversedResults),
        }

        const response = {
            player: { id: playerId, name: getName(playerId) },
            teams: teamsFromDB,
            stats,
            bestTeam: teamStatsArr[0] || null,
            worstTeam: teamStatsArr[teamStatsArr.length - 1] || null,
        }
        if (includeMatches) response.matches = matchesFromDB

        return res.status(200).json(response)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getPlayerInfoByTournamentId

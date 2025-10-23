const {
    retrieveTournamentById,
    orderMatchesFromTournamentById,
} = require("../../service")

const MAX_STREAK = 5

const getPlayerStatsSummaryByTournamentId = async (req, res) => {
    try {
        const { tournament } = req.params

        const tournamentDoc = await retrieveTournamentById(tournament)
        if (!tournamentDoc) return res.status(404).send("Tournament not found")

        const players = tournamentDoc.players || []
        // Map player id -> name
        const nameById = new Map(
            players.map((p) => [
                String(p.id),
                p.nickname || p.name || String(p.id),
            ])
        )

        // Get all played & valid regular matches across all groups (sorted by updatedAt desc)
        const matches = await orderMatchesFromTournamentById(
            tournament,
            undefined,
            true
        )

        // Initialize summary map for all players in the tournament (so zero-match players are included)
        const summaryByPlayer = new Map()
        for (const p of players) {
            summaryByPlayer.set(String(p.id), {
                name: nameById.get(String(p.id)),
                played: 0,
                wins: 0,
                draws: 0,
                losses: 0,
                goalsFor: 0,
                goalsAgainst: 0,
                scoringDifference: 0,
                effectiveness: 0,
                streak: [], // most recent first, join later
                // For longest streak tracking (direction-invariant)
                _curType: null, // 'W' | 'D' | 'L'
                _curLen: 0,
                _maxW: 0,
                _maxD: 0,
                _maxL: 0,
            })
        }

        // Aggregate per player in one pass
        for (const m of matches || []) {
            const p1 = String(m.playerP1?.id || "")
            const p2 = String(m.playerP2?.id || "")
            const s1 = Number(m.scoreP1) || 0
            const s2 = Number(m.scoreP2) || 0

            if (p1 && summaryByPlayer.has(p1)) {
                const S = summaryByPlayer.get(p1)
                S.played += 1
                S.goalsFor += s1
                S.goalsAgainst += s2
                let r1
                if (s1 === s2) {
                    S.draws += 1
                    r1 = "D"
                    if (S.streak.length < MAX_STREAK) S.streak.push("D")
                } else if (s1 > s2) {
                    S.wins += 1
                    r1 = "W"
                    if (S.streak.length < MAX_STREAK) S.streak.push("W")
                } else {
                    S.losses += 1
                    r1 = "L"
                    if (S.streak.length < MAX_STREAK) S.streak.push("L")
                }
                // Update longest streak state for P1
                if (S._curType === r1) {
                    S._curLen += 1
                } else {
                    S._curType = r1
                    S._curLen = 1
                }
                if (r1 === "W") S._maxW = Math.max(S._maxW, S._curLen)
                else if (r1 === "D") S._maxD = Math.max(S._maxD, S._curLen)
                else if (r1 === "L") S._maxL = Math.max(S._maxL, S._curLen)
            }

            if (p2 && summaryByPlayer.has(p2)) {
                const S = summaryByPlayer.get(p2)
                S.played += 1
                S.goalsFor += s2
                S.goalsAgainst += s1
                let r2
                if (s1 === s2) {
                    S.draws += 1
                    r2 = "D"
                    if (S.streak.length < MAX_STREAK) S.streak.push("D")
                } else if (s2 > s1) {
                    S.wins += 1
                    r2 = "W"
                    if (S.streak.length < MAX_STREAK) S.streak.push("W")
                } else {
                    S.losses += 1
                    r2 = "L"
                    if (S.streak.length < MAX_STREAK) S.streak.push("L")
                }
                // Update longest streak state for P2
                if (S._curType === r2) {
                    S._curLen += 1
                } else {
                    S._curType = r2
                    S._curLen = 1
                }
                if (r2 === "W") S._maxW = Math.max(S._maxW, S._curLen)
                else if (r2 === "D") S._maxD = Math.max(S._maxD, S._curLen)
                else if (r2 === "L") S._maxL = Math.max(S._maxL, S._curLen)
            }
        }

        // Finalize derived fields and build output
        const playersOut = Array.from(summaryByPlayer.values()).map((S) => {
            S.scoringDifference = (S.goalsFor || 0) - (S.goalsAgainst || 0)
            S.effectiveness = S.played
                ? Number(
                      (((S.wins * 3 + S.draws) / (S.played * 3)) * 100).toFixed(
                          2
                      )
                  )
                : 0
            // Determine the longest streak among W/D/L (tie-breaker priority W > D > L)
            const longestType =
                S._maxW >= S._maxD && S._maxW >= S._maxL
                    ? "W"
                    : S._maxD >= S._maxL
                    ? "D"
                    : "L"
            const longestLen =
                longestType === "W"
                    ? S._maxW
                    : longestType === "D"
                    ? S._maxD
                    : S._maxL
            // Streak is already most recent first, join as string
            const out = {
                name: S.name,
                played: S.played,
                wins: S.wins,
                draws: S.draws,
                losses: S.losses,
                goalsFor: S.goalsFor,
                goalsAgainst: S.goalsAgainst,
                scoringDifference: S.scoringDifference,
                effectiveness: S.effectiveness,
                streak: S.streak.join("") || "",
                longestStreak:
                    longestLen > 0 ? `${longestType}${longestLen}` : "",
            }
            return out
        })

        // Order by effectiveness desc, then scoringDifference desc, wins desc, then name asc
        playersOut.sort(
            (a, b) =>
                b.effectiveness - a.effectiveness ||
                b.scoringDifference - a.scoringDifference ||
                b.wins - a.wins ||
                (a.name || "").localeCompare(b.name || "")
        )

        return res.status(200).json({ stats: playersOut })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getPlayerStatsSummaryByTournamentId

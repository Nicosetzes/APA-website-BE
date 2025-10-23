const {
    retrieveTournamentById,
    orderMatchesFromTournamentById,
} = require("../../service")

// last_matches removed by request; only current_streak is exposed now

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
                // internal trackers for current streak (most recent consecutive same results)
                _curType: null, // 'W' | 'D' | 'L' | null
                _curLen: 0,
                _curDone: false,
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
                let r = ""
                if (s1 === s2) {
                    S.draws += 1
                    r = "D"
                } else if (s1 > s2) {
                    S.wins += 1
                    r = "W"
                } else {
                    S.losses += 1
                    r = "L"
                }
                // update current streak trackers (most recent first order)
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
            }

            if (p2 && summaryByPlayer.has(p2)) {
                const S = summaryByPlayer.get(p2)
                S.played += 1
                S.goalsFor += s2
                S.goalsAgainst += s1
                let r = ""
                if (s1 === s2) {
                    S.draws += 1
                    r = "D"
                } else if (s2 > s1) {
                    S.wins += 1
                    r = "W"
                } else {
                    S.losses += 1
                    r = "L"
                }
                // update current streak trackers (most recent first order)
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
            const out = {
                name: S.name,
                played: S.played,
                wins: S.wins,
                draws: S.draws,
                losses: S.losses,
                goalsFor: S.goalsFor || 0,
                goalsAgainst: S.goalsAgainst || 0,
                scoringDifference: S.scoringDifference,
                effectiveness: S.effectiveness,
            }
            if (
                S._curLen >= 2 &&
                (S._curType === "W" || S._curType === "D" || S._curType === "L")
            ) {
                out.current_streak = { type: S._curType, length: S._curLen }
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

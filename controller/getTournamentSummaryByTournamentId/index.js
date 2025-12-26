const {
    retrieveTournamentById,
    retrieveAllPlayedMatchesByTournamentId,
} = require("./../../service")

const getTournamentSummaryByTournamentId = async (req, res) => {
    const { tournament } = req.params

    try {
        const tournamentDoc = await retrieveTournamentById(tournament)

        if (!tournamentDoc) {
            return res.status(404).send("Tournament not found")
        }

        const { id, name, players, outcome, ongoing } = tournamentDoc

        // Get all played matches (including regular, playin, playoff)
        const allPlayedMatches = await retrieveAllPlayedMatchesByTournamentId(
            tournament,
            false
        )

        allPlayedMatches.sort((a, b) => {
            const dateA = a.updatedAt ? new Date(a.updatedAt) : new Date(0)
            const dateB = b.updatedAt ? new Date(b.updatedAt) : new Date(0)
            return dateB - dateA
        })

        const recentResults = allPlayedMatches.slice(0, 6).map((m) => ({
            id: m._id,
            playerP1: m.playerP1,
            teamP1: m.teamP1,
            scoreP1: m.scoreP1,
            playerP2: m.playerP2,
            teamP2: m.teamP2,
            scoreP2: m.scoreP2,
            outcome: m.outcome,
            type: m.type,
            updatedAt: m.updatedAt,
        }))

        const playerStatsMap = new Map()

        // Initialize all players
        players.forEach((player) => {
            playerStatsMap.set(String(player.id), {
                player: {
                    id: player.id,
                    name: player.name,
                    nickname: player.nickname,
                },
                played: 0,
                wins: 0,
                draws: 0,
                losses: 0,
                goalsFor: 0,
                goalsAgainst: 0,
                scoringDifference: 0,
                effectiveness: 0,
                _curType: null, // For streak calculation
                _curLen: 0,
                _curDone: false,
            })
        })

        // Process all played matches
        for (const m of allPlayedMatches) {
            const p1Id = String(m.playerP1?.id || "")
            const p2Id = String(m.playerP2?.id || "")
            const s1 = Number(m.scoreP1) || 0
            const s2 = Number(m.scoreP2) || 0

            if (p1Id && playerStatsMap.has(p1Id)) {
                const S = playerStatsMap.get(p1Id)
                S.played += 1
                S.goalsFor += s1
                S.goalsAgainst += s2

                let result = ""
                if (s1 === s2) {
                    S.draws += 1
                    result = "D"
                } else if (s1 > s2) {
                    S.wins += 1
                    result = "W"
                } else {
                    S.losses += 1
                    result = "L"
                }

                // Update current streak
                if (!S._curDone) {
                    if (S._curType === null) {
                        S._curType = result
                        S._curLen = 1
                    } else if (S._curType === result) {
                        S._curLen += 1
                    } else {
                        S._curDone = true
                    }
                }
            }

            if (p2Id && playerStatsMap.has(p2Id)) {
                const S = playerStatsMap.get(p2Id)
                S.played += 1
                S.goalsFor += s2
                S.goalsAgainst += s1

                let result = ""
                if (s1 === s2) {
                    S.draws += 1
                    result = "D"
                } else if (s2 > s1) {
                    S.wins += 1
                    result = "W"
                } else {
                    S.losses += 1
                    result = "L"
                }

                if (!S._curDone) {
                    if (S._curType === null) {
                        S._curType = result
                        S._curLen = 1
                    } else if (S._curType === result) {
                        S._curLen += 1
                    } else {
                        S._curDone = true
                    }
                }
            }
        }

        const participantStats = Array.from(playerStatsMap.values())
            .map((stats) => {
                const scoringDifference = stats.goalsFor - stats.goalsAgainst
                const effectiveness =
                    stats.played > 0
                        ? Number(
                              (
                                  ((stats.wins * 3 + stats.draws) /
                                      (stats.played * 3)) *
                                  100
                              ).toFixed(2)
                          )
                        : 0

                const streak =
                    stats._curType && stats._curLen > 0
                        ? `${stats._curLen}${stats._curType}`
                        : null

                return {
                    player: stats.player,
                    played: stats.played,
                    wins: stats.wins,
                    draws: stats.draws,
                    losses: stats.losses,
                    goalsFor: stats.goalsFor,
                    goalsAgainst: stats.goalsAgainst,
                    scoringDifference,
                    effectiveness,
                    streak,
                }
            })
            .sort((a, b) => b.played - a.played)

        const totalMatchesPlayed = allPlayedMatches.length

        const summary = {
            tournament: {
                id,
                name,
            },
            matches: {
                recent: recentResults,
                totalPlayed: totalMatchesPlayed,
            },
            participants: participantStats,
        }

        if (!ongoing && outcome) {
            summary.outcome = {
                champion: outcome.champion,
                finalist: outcome.finalist,
            }
        }

        res.status(200).json(summary)
    } catch (err) {
        console.error("Error in getTournamentSummaryByTournamentId:", err)
        return res.status(500).send("Something went wrong! " + err)
    }
}

module.exports = getTournamentSummaryByTournamentId

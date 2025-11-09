const { retrieveMatches, retrieveTournamentById } = require("../../service")

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/

const getMatchesSummaryByDate = async (req, res) => {
    try {
        const { date } = req.query
        if (!date || !isoDateRegex.test(String(date))) {
            return res
                .status(400)
                .send("Missing or invalid date. Use ?date=YYYY-MM-DD")
        }

        // Pull all pages from existing matches endpoint logic
        let page = 0
        let totalPages = 1
        const all = []
        while (page < totalPages) {
            const { matches, totalPages: tp } = await retrieveMatches(
                page,
                undefined,
                date,
                true
            )
            totalPages = tp || 0
            if (Array.isArray(matches)) all.push(...matches)
            page += 1
            if (!tp) break
        }

        // Early return if no matches
        if (all.length === 0) {
            return res.status(200).json({ date, matches: [] })
        }

        // Ensure all matches are from the same tournament
        const idsSet = new Set(
            all
                .map((m) =>
                    m?.tournament?.id ? String(m.tournament.id) : null
                )
                .filter(Boolean)
        )

        if (idsSet.size !== 1) {
            return res
                .status(400)
                .send(
                    "Selected date contains matches from multiple tournaments."
                )
        }

        const onlyTid = Array.from(idsSet)[0]

        // Build a cache of tournament names when absent in match docs (single id)
        const tournamentNameById = new Map()
        for (const m of all) {
            const tid = m?.tournament?.id
            const tname = m?.tournament?.name
            if (tid && tname) tournamentNameById.set(String(tid), tname)
        }

        // Resolve name/format for the single tournament id
        let tournamentFormat = null
        try {
            const t = await retrieveTournamentById(onlyTid)
            if (t?.name && !tournamentNameById.has(onlyTid)) {
                tournamentNameById.set(onlyTid, t.name)
            }
            tournamentFormat = t?.format || null
        } catch (_) {
            // ignore; name/format may remain null
        }

        const summaryMatches = all.map((m) => {
            const p1 = m?.playerP1 || {}
            const p2 = m?.playerP2 || {}
            const player1 =
                p1.nickname || p1.name || (p1.id ? String(p1.id) : null)
            const player2 =
                p2.nickname || p2.name || (p2.id ? String(p2.id) : null)
            const score1 = Number(m?.scoreP1) || 0
            const score2 = Number(m?.scoreP2) || 0
            const winner =
                score1 === score2 ? "Draw" : score1 > score2 ? player1 : player2
            const result = {
                player1,
                team1: m?.teamP1?.name || null,
                player2,
                team2: m?.teamP2?.name || null,
                score1,
                score2,
                winner,
                type: m?.type || null,
                group: m?.group || null,
            }
            if (m?.playoff_id != null) result.playoff_id = m.playoff_id
            if (m?.seedP1 != null) result.seedP1 = m.seedP1
            if (m?.seedP2 != null) result.seedP2 = m.seedP2
            return result
        })

        // Build daily summary for each player grouped by group
        const dailySummary = {}
        all.forEach((m) => {
            const p1 = m?.playerP1 || {}
            const p2 = m?.playerP2 || {}
            const p1Name =
                p1.nickname || p1.name || (p1.id ? String(p1.id) : null)
            const p2Name =
                p2.nickname || p2.name || (p2.id ? String(p2.id) : null)
            const score1 = Number(m?.scoreP1) || 0
            const score2 = Number(m?.scoreP2) || 0
            const matchGroup = m?.group || "ungrouped"

            // Initialize group if not exists
            if (!dailySummary[matchGroup]) {
                dailySummary[matchGroup] = {}
            }

            // Initialize player stats if not exists
            if (p1Name && !dailySummary[matchGroup][p1Name]) {
                dailySummary[matchGroup][p1Name] = {
                    played: 0,
                    wins: 0,
                    draws: 0,
                    losses: 0,
                }
            }
            if (p2Name && !dailySummary[matchGroup][p2Name]) {
                dailySummary[matchGroup][p2Name] = {
                    played: 0,
                    wins: 0,
                    draws: 0,
                    losses: 0,
                }
            }

            // Update stats for player 1
            if (p1Name) {
                dailySummary[matchGroup][p1Name].played += 1
                if (score1 > score2) {
                    dailySummary[matchGroup][p1Name].wins += 1
                } else if (score1 === score2) {
                    dailySummary[matchGroup][p1Name].draws += 1
                } else {
                    dailySummary[matchGroup][p1Name].losses += 1
                }
            }

            // Update stats for player 2
            if (p2Name) {
                dailySummary[matchGroup][p2Name].played += 1
                if (score2 > score1) {
                    dailySummary[matchGroup][p2Name].wins += 1
                } else if (score1 === score2) {
                    dailySummary[matchGroup][p2Name].draws += 1
                } else {
                    dailySummary[matchGroup][p2Name].losses += 1
                }
            }
        })

        // Convert to flat array format with group included
        const dailySummaryArray = []
        Object.keys(dailySummary).forEach((group) => {
            Object.entries(dailySummary[group]).forEach(([player, stats]) => {
                dailySummaryArray.push({
                    player,
                    group,
                    ...stats,
                })
            })
        })

        // Calculate totals combining all groups per player
        const dailySummaryTotalsMap = {}
        dailySummaryArray.forEach(({ player, played, wins, draws, losses }) => {
            if (!dailySummaryTotalsMap[player]) {
                dailySummaryTotalsMap[player] = {
                    played: 0,
                    wins: 0,
                    draws: 0,
                    losses: 0,
                }
            }
            dailySummaryTotalsMap[player].played += played
            dailySummaryTotalsMap[player].wins += wins
            dailySummaryTotalsMap[player].draws += draws
            dailySummaryTotalsMap[player].losses += losses
        })

        const dailySummaryTotals = Object.entries(dailySummaryTotalsMap).map(
            ([player, stats]) => ({
                player,
                ...stats,
            })
        )

        return res.status(200).json({
            date,
            tournament: {
                id: onlyTid,
                name: tournamentNameById.get(onlyTid) || null,
                format: tournamentFormat,
            },
            matches: summaryMatches,
            dailySummary: dailySummaryArray,
            dailySummaryTotals,
        })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getMatchesSummaryByDate

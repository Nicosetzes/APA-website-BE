const {
    retrievePlayerMatchesByTournamentId,
    retrieveTournamentById,
    retrieveTournamentPlayersByTournamentId,
    retrieveAllPlayedMatchesByTournamentId,
} = require("../../service")

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
                    },
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
                    entry.stats.played += 1
                    entry.stats.goalsFor += Number(m.scoreP1) || 0
                    entry.stats.goalsAgainst += Number(m.scoreP2) || 0
                    if (p1 === winnerId) entry.stats.wins += 1
                    else if (p1 === loserId) entry.stats.losses += 1
                    else entry.stats.draws += 1
                    if (includeMatches) entry.matches.push(m)
                }

                if (p2 && resultMap.has(p2)) {
                    const entry = resultMap.get(p2)
                    entry.stats.played += 1
                    entry.stats.goalsFor += Number(m.scoreP2) || 0
                    entry.stats.goalsAgainst += Number(m.scoreP1) || 0
                    if (p2 === winnerId) entry.stats.wins += 1
                    else if (p2 === loserId) entry.stats.losses += 1
                    else entry.stats.draws += 1
                    if (includeMatches) entry.matches.push(m)
                }
            }

            // Finalize stats
            const playersOut = playersList.map((p) => {
                const entry = resultMap.get(String(p.id))
                const s = entry.stats
                s.scoringDifference = s.goalsFor - s.goalsAgainst
                s.effectiveness = s.played
                    ? Number(
                          (
                              ((s.wins * 3 + s.draws) / (s.played * 3)) *
                              100
                          ).toFixed(2)
                      )
                    : 0
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

        for (const m of matchesFromDB || []) {
            const isP1 = String(m.playerP1?.id) === playerId
            const isP2 = String(m.playerP2?.id) === playerId
            if (!isP1 && !isP2) continue

            played += 1
            const gf = isP1 ? m.scoreP1 : m.scoreP2
            const ga = isP1 ? m.scoreP2 : m.scoreP1
            goalsFor += Number(gf) || 0
            goalsAgainst += Number(ga) || 0

            const winnerId = String(m.outcome?.playerThatWon?.id || "")
            const loserId = String(m.outcome?.playerThatLost?.id || "")
            if (winnerId === playerId) wins += 1
            else if (loserId === playerId) losses += 1
            else draws += 1
        }

        const scoringDifference = goalsFor - goalsAgainst
        const effectiveness = played
            ? Number((((wins * 3 + draws) / (played * 3)) * 100).toFixed(2))
            : 0

        const stats = {
            played,
            wins,
            draws,
            losses,
            goalsFor,
            goalsAgainst,
            scoringDifference,
            effectiveness,
        }

        const response = {
            player: { id: playerId, name: getName(playerId) },
            teams: teamsFromDB,
            stats,
        }
        if (includeMatches) response.matches = matchesFromDB

        return res.status(200).json(response)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getPlayerInfoByTournamentId

const {
    retrieveTournamentById,
    orderMatchesFromTournamentById,
} = require("../../service")

// Utility to compute condensed standings from matches and team list
function computeStandingsSummary(teams, matches, playersIndex, maxStreak = 5) {
    const statsMap = new Map()

    const ensure = (teamObj, playerObj) => {
        const key = String(teamObj.id)
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
                points: 0,
                streak: [], // will store most-recent first letters
            })
        }
        return statsMap.get(key)
    }

    for (const m of matches || []) {
        const {
            playerP1,
            teamP1,
            scoreP1 = 0,
            playerP2,
            teamP2,
            scoreP2 = 0,
            outcome,
        } = m
        const t1 = ensure(teamP1, playerP1)
        const t2 = ensure(teamP2, playerP2)

        t1.played += 1
        t2.played += 1
        t1.goalsFor += Number(scoreP1) || 0
        t1.goalsAgainst += Number(scoreP2) || 0
        t2.goalsFor += Number(scoreP2) || 0
        t2.goalsAgainst += Number(scoreP1) || 0

        // Determine outcome for points and streak letter
        let t1Letter = "d"
        let t2Letter = "d"
        if (outcome?.draw || scoreP1 === scoreP2) {
            t1.draws += 1
            t2.draws += 1
            t1.points += 1
            t2.points += 1
        } else if (
            outcome?.teamThatWon?.id === teamP1.id ||
            scoreP1 > scoreP2
        ) {
            t1.wins += 1
            t2.losses += 1
            t1.points += 3
            t1Letter = "w"
            t2Letter = "l"
        } else {
            t2.wins += 1
            t1.losses += 1
            t2.points += 3
            t1Letter = "l"
            t2Letter = "w"
        }

        if (t1.streak.length < maxStreak) t1.streak.push(t1Letter)
        if (t2.streak.length < maxStreak) t2.streak.push(t2Letter)
    }

    // Build condensed rows only for teams present in the provided teams list (keeps group scoping intact)
    const rows = teams.map(({ team, player }) => {
        const s = statsMap.get(String(team.id)) || {
            wins: 0,
            draws: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            points: 0,
            streak: [],
        }
        const playerName =
            playersIndex.get(String(player?.id)) ||
            player?.nickname ||
            player?.name ||
            null
        return {
            team: team?.name || null,
            player: playerName,
            pts: s.points,
            wins: s.wins,
            draws: s.draws,
            losses: s.losses,
            gf: s.goalsFor,
            ga: s.goalsAgainst,
            gd: (s.goalsFor || 0) - (s.goalsAgainst || 0),
            streak: s.streak.join("").toUpperCase(),
        }
    })

    // Sort by points desc, goal difference desc, goals for desc, goals against asc
    rows.sort(
        (a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.ga - b.ga
    )

    // Add position and remove gf/ga/gd from summary output
    return rows.map((r, idx) => {
        const out = {
            pos: idx + 1,
            team: r.team,
            player: r.player,
            pts: r.pts,
            wins: r.wins,
            losses: r.losses,
            streak: r.streak,
        }
        if (r.draws) out.draws = r.draws
        return out
    })
}

const getStandingsSummaryByTournamentId = async (req, res) => {
    try {
        const { tournament } = req.params
        const tournamentDoc = await retrieveTournamentById(tournament)
        if (!tournamentDoc) return res.status(404).send("Tournament not found")

        const { teams = [], players = [], groups } = tournamentDoc
        const playersIndex = new Map(
            players.map((p) => [
                String(p.id),
                p.nickname || p.name || String(p.id),
            ])
        )

        if (!groups || groups.length === 0) {
            // No groups: use all teams and all matches
            const matches = await orderMatchesFromTournamentById(
                tournament,
                undefined,
                true
            )
            const table = computeStandingsSummary(teams, matches, playersIndex)
            return res.status(200).json({ standings: table })
        }

        // Has groups: build a groups object
        const groupNames = Array.from(
            new Set(
                (groups || [])
                    .map((g) => (typeof g === "string" ? g : g?.name))
                    .filter(Boolean)
            )
        )
        // Fallback if groups array doesn't contain names: infer from teams
        if (groupNames.length === 0) {
            for (const { group } of teams) if (group) groupNames.push(group)
        }

        const result = {}
        for (const g of groupNames) {
            const groupTeams = teams.filter((t) => t.group === g)
            const groupMatches = await orderMatchesFromTournamentById(
                tournament,
                g,
                true
            )
            result[g] = computeStandingsSummary(
                groupTeams,
                groupMatches,
                playersIndex
            )
        }

        return res.status(200).json({ standings: result })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getStandingsSummaryByTournamentId

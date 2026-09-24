const {
    retrieveAllUsers,
    retrieveAllMatches,
    retrieveTournamentById,
    orderMatchesFromTournamentById,
} = require("./../../service")
const { HttpError } = require("../../middleware/httpErrors")
const { buildDecisiveMatchesStats } = require("./domain/decisiveStatistics")
const { aggregatePlayers } = require("./domain/playerAggregation")
const { buildPlayersOutput, buildLeaderboards } = require("./domain/rankings")
const { selectMatchRecords, buildRecords } = require("./domain/records")

// Combined summary stats and streaks endpoint
// GET /api/statistics[?tournament=<id>]
// - Global: aggregates across all tournaments for all users
// - Tournament-scoped: aggregates only matches from that tournament and only players registered in it
const createGetStatistics = (dependencies = {}) => {
    const retrieveUsers = dependencies.retrieveAllUsers || retrieveAllUsers
    const retrieveMatches =
        dependencies.retrieveAllMatches || retrieveAllMatches
    const retrieveTournament =
        dependencies.retrieveTournamentById || retrieveTournamentById
    const orderTournamentMatches =
        dependencies.orderMatchesFromTournamentById ||
        orderMatchesFromTournamentById

    return async (req, res) => {
        const tournamentId = String(req.query?.tournament || "").trim()

        let players = []
        let matches = []
        let scope = { tournament: null }

        if (tournamentId) {
            const tDoc = await retrieveTournament(tournamentId)

            if (!tDoc) {
                throw new HttpError(
                    404,
                    "TOURNAMENT_NOT_FOUND",
                    "No se encontró el torneo indicado"
                )
            }

            scope.tournament = tournamentId

            // Only players from this tournament
            players = (tDoc.players || []).map((p) => ({
                id: String(p.id),
                name: p.nickname || p.name || String(p.id),
            }))
            // All played valid matches across groups, newest first
            matches =
                (await orderTournamentMatches(tournamentId, undefined, true)) ||
                []
        } else {
            // Global: all users and all matches
            const allUsers = await retrieveUsers()
            players = (allUsers || []).map((p) => ({
                id: String(p.id),
                name: p.nickname || p.name || String(p.id),
            }))
            matches = (await retrieveMatches()) || []
        }

        // Index players for fast lookup and include zeros for missing
        const playerIndex = new Map(players.map((p) => [p.id, p.name]))
        const playerIdsSet = new Set(players.map((p) => p.id))

        const matchRecords = selectMatchRecords(matches)
        const vals = aggregatePlayers({
            matches,
            registeredPlayers: players,
            playerNames: playerIndex,
            allowedPlayerIds: tournamentId ? playerIdsSet : null,
        })
        const decisiveMatchesStats = buildDecisiveMatchesStats({
            matches,
            playerNames: playerIndex,
            allowedPlayerIds: tournamentId ? playerIdsSet : null,
        })

        const playersOut = buildPlayersOutput({
            accumulators: vals,
            includeLongestStreak: Boolean(tournamentId),
        })
        const leaderboards = buildLeaderboards({
            players: playersOut,
            accumulators: vals,
        })

        const records = buildRecords({ matchRecords, accumulators: vals })

        return res.status(200).json({
            scope,
            players: playersOut,
            decisiveMatchesStats,
            leaderboards,
            records,
        })
    }
}

const getStatistics = createGetStatistics()

module.exports = getStatistics
module.exports.createGetStatistics = createGetStatistics

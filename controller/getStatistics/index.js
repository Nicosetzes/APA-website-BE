const { HttpError } = require("../../middleware/httpErrors")
const { aggregatePlayers } = require("./domain/playerAggregation")
const { buildDecisiveMatchesStats } = require("./domain/decisiveStatistics")
const defaultLogger = require("../../utils/logger")
const {
    applyTournamentStreaks,
    buildTournamentFacts,
} = require("./domain/tournamentStreaks")
const {
    buildActiveStreaks,
    buildRecords,
    selectMatchRecords,
} = require("./domain/records")
const { buildPlayersOutput, buildLeaderboards } = require("./domain/rankings")
const {
    retrieveAllUsers,
    retrieveAllMatches,
    retrieveTournamentById,
    retrieveTournamentsForStatistics,
    orderMatchesFromTournamentById,
} = require("./../../service")

const isPlayedAndValid = (match) =>
    match.played !== false && match.valid !== false

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
    const retrieveTournaments =
        dependencies.retrieveTournamentsForStatistics ||
        retrieveTournamentsForStatistics
    const orderTournamentMatches =
        dependencies.orderMatchesFromTournamentById ||
        orderMatchesFromTournamentById
    const logger = dependencies.logger || defaultLogger

    // Las rachas por torneo son opcionales: si la lectura falla, el resto de
    // las estadísticas sale igual y esas claves se omiten. Nunca rechaza.
    const loadTournaments = async (req) => {
        try {
            const tournaments = await retrieveTournaments()
            if (Array.isArray(tournaments)) return tournaments
            logger.warn("statistics_tournament_streaks_unavailable", {
                requestId: req.requestId || null,
                errorName: null,
                code: "INVALID_RESULT",
            })
        } catch (error) {
            logger.warn("statistics_tournament_streaks_unavailable", {
                requestId: req.requestId || null,
                errorName: error?.name || null,
                code: error?.code ?? null,
            })
        }
        return null
    }

    return async (req, res) => {
        const tournamentId = String(req.query?.tournament || "").trim()

        let players = []
        let matches = []
        let extraPlayoffMatches = []
        let tournaments = null
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
            // Global: all users, all matches (plus the playoff matches that
            // only the tournament streaks use) and the tournaments, in parallel.
            const [allUsers, allMatches, loadedTournaments] = await Promise.all(
                [
                    retrieveUsers(),
                    retrieveMatches({ includeAllPlayoffs: true }),
                    loadTournaments(req),
                ]
            )
            players = (allUsers || []).map((p) => ({
                id: String(p.id),
                name: p.nickname || p.name || String(p.id),
            }))
            // Same order as returned; `matches` is exactly the played and
            // valid set every other aggregate uses.
            for (const match of allMatches || []) {
                if (isPlayedAndValid(match)) matches.push(match)
                else extraPlayoffMatches.push(match)
            }
            tournaments = loadedTournaments
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

        if (tournaments) {
            applyTournamentStreaks({
                accumulators: vals,
                facts: buildTournamentFacts({
                    matches,
                    extraPlayoffMatches,
                    tournaments,
                }),
            })
        }

        const playersOut = buildPlayersOutput({
            accumulators: vals,
            includeLongestStreak: Boolean(tournamentId),
        })
        const leaderboards = buildLeaderboards({
            players: playersOut,
            accumulators: vals,
        })

        // Scoped (sólo partidos regulares): las rachas nuevas van en null.
        // Global sin torneos: las de torneo se omiten.
        const streakModes = {
            knockout: tournamentId ? "null" : "compute",
            tournament: tournamentId
                ? "null"
                : tournaments
                ? "compute"
                : "omit",
        }
        const records = buildRecords({
            matchRecords,
            accumulators: vals,
            ...streakModes,
        })
        // Fuera de `records` para que el FE no lo itere como un récord más.
        const activeStreaks = buildActiveStreaks({
            accumulators: vals,
            ...streakModes,
        })

        return res.status(200).json({
            scope,
            players: playersOut,
            decisiveMatchesStats,
            leaderboards,
            records,
            activeStreaks,
        })
    }
}

const getStatistics = createGetStatistics()

module.exports = getStatistics
module.exports.createGetStatistics = createGetStatistics

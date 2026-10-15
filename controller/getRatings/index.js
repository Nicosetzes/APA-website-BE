const { RATING_CONFIG } = require("../../config/ratings")
const defaultLogger = require("../../utils/logger")
const { isReadModelEnabled } = require("../../config/ratingReadModel")
const { rankPlayers } = require("../../service/playerRatings")
const {
    buildNameIndex,
    describeParameters,
    toRankingRow,
} = require("../../service/playerRatings/presentation")
const {
    retrieveAllUsers,
    retrieveRatingMatches,
    retrieveRatingsTimeline,
    retrieveStoredRanking,
} = require("./../../service")

const createGetRatings = (dependencies = {}) => {
    // `retrieveAllMatches` es el nombre histórico de la dependencia inyectable.
    const retrieveMatches =
        dependencies.retrieveAllMatches || retrieveRatingMatches
    const retrieveUsers = dependencies.retrieveAllUsers || retrieveAllUsers
    const logger = dependencies.logger || defaultLogger
    const readModelEnabled = dependencies.readModelEnabled || isReadModelEnabled
    const clock = dependencies.clock || Date.now

    const retrieveStored =
        dependencies.retrieveStoredRanking ??
        (dependencies.retrieveAllMatches ? undefined : retrieveStoredRanking)

    // Intenta el ranking guardado. Nunca lanza: devuelve `{ players }` o el motivo
    // por el que hay que calcular en vivo.
    const tryStored = async () => {
        try {
            if (!retrieveStored) return { reason: "not_wired" }
            if (!readModelEnabled()) return { reason: "disabled" }
            const response = await retrieveStored()
            if (response?.players instanceof Map) {
                return { players: response.players }
            }
            if (typeof response?.stale === "string") {
                return { reason: response.stale }
            }
            return { reason: "error", errorName: "MalformedStoredResponse" }
        } catch (error) {
            return { reason: "error", errorName: error?.name || "Error" }
        }
    }

    const log = (data) => {
        try {
            logger?.[data.reason === "error" ? "warn" : "info"]?.(
                "rating_read_model",
                data
            )
        } catch {
            // El log no puede romper la respuesta.
        }
    }

    return async (req, res) => {
        const startedAt = clock()
        // Los usuarios se leen en paralelo con el ranking guardado y se reutilizan
        // si hay que calcular en vivo.
        const usersPromise = Promise.resolve().then(() => retrieveUsers())
        usersPromise.catch(() => {})

        const stored = await tryStored()

        let config = RATING_CONFIG
        let ranking
        if (stored.players) {
            ranking = rankPlayers(stored.players)
        } else {
            const timeline = await retrieveRatingsTimeline({ retrieveMatches })
            config = timeline.config
            ranking = rankPlayers(timeline.snapshotAt(null))
        }
        const users = await usersPromise
        const names = buildNameIndex(users || [])

        if (retrieveStored) {
            log({
                endpoint: "ratings",
                source: stored.players ? "stored" : "live",
                reason: stored.players ? "ok" : stored.reason,
                players: ranking.length,
                durationMs: clock() - startedAt,
                ...(stored.errorName && { errorName: stored.errorName }),
            })
        }

        return res.json({
            success: true,
            parameters: describeParameters(config),
            data: ranking.map((player) => toRankingRow(player, names, config)),
        })
    }
}

const getRatings = createGetRatings()

module.exports = getRatings
module.exports.createGetRatings = createGetRatings

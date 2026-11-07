const { RATING_CONFIG } = require("../../config/ratings")
const defaultLogger = require("../../utils/logger")
const { isReadModelEnabled } = require("../../config/ratingReadModel")
const { getArgentinaDayRange } = require("../../utils/argentinaDay")
const { rankPlayers } = require("../../service/playerRatings")
const { buildNameIndex } = require("../../service/playerRatings/presentation")
const {
    retrieveAllUsers,
    retrieveRatingMatches,
    retrieveRatingsTimeline,
    retrieveStoredPeriod,
} = require("./../../service")

// Lectura de un período de ratings compartida por `GET /api/ratings/period` y
// `GET /api/ratings/history`: intenta lo guardado, cae al cálculo en vivo si no
// está fresco y registra de dónde salió. Devuelve una función
// `readPeriod({ dateFrom, dateTo, endpoint })` con los dos rankings (en `start`
// y en `end`), los eventos del período, la configuración y el índice de
// nombres.
//
// Cada evento del período trae `seq`, el orden del motor (`playedAt` y luego
// `_id`). Lo guardado ya lo tiene; el camino en vivo lo calcula como la
// posición dentro de `timeline.events` completo (1, 2, 3...), que es el mismo
// número que se persiste (`buildRatingDocuments`), así que ambos caminos
// coinciden.
//
// `includeHistory` (solo el historial) pide al lector guardado lo que el
// evento guarda del partido (equipo e id por lado, tipo de cruce y penales); el
// camino en vivo ya lo trae en los eventos del motor. Sin esa opción el pedido
// al lector es el de siempre (`{ start, end }`).
//
// `allTime` (solo el historial por torneo) lee todo el historial: la ventana es
// `[0, 9999-12-31)`. El filtro por torneo lo hace quien llama, en memoria.
const ALL_TIME_END = Date.UTC(9999, 11, 31)

const createPeriodSource = (dependencies = {}) => {
    const retrieveMatches =
        dependencies.retrieveAllMatches || retrieveRatingMatches
    const retrieveUsers = dependencies.retrieveAllUsers || retrieveAllUsers
    const logger = dependencies.logger || defaultLogger
    const readModelEnabled = dependencies.readModelEnabled || isReadModelEnabled
    const clock = dependencies.clock || Date.now

    const retrieveStored =
        dependencies.retrieveStoredPeriod ??
        (dependencies.retrieveAllMatches ? undefined : retrieveStoredPeriod)

    const tryStored = async ({ start, end, includeHistory }) => {
        try {
            if (!retrieveStored) return { reason: "not_wired" }
            if (!readModelEnabled()) return { reason: "disabled" }
            const response = await retrieveStored({
                start,
                end,
                ...(includeHistory && { includeHistory: true }),
            })
            if (
                response?.previous instanceof Map &&
                response?.current instanceof Map &&
                Array.isArray(response?.periodEvents)
            ) {
                return {
                    previous: response.previous,
                    current: response.current,
                    periodEvents: response.periodEvents,
                }
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

    return async ({
        dateFrom,
        dateTo,
        endpoint,
        includeHistory = false,
        allTime = false,
    }) => {
        const startedAt = clock()
        // Período [start, end): del inicio del primer día al fin del último.
        // Con `allTime` es todo el historial y no se usan las fechas.
        const start = allTime
            ? 0
            : getArgentinaDayRange(dateFrom).start.getTime()
        const end = allTime
            ? ALL_TIME_END
            : getArgentinaDayRange(dateTo).end.getTime()

        // Los usuarios se leen en paralelo con el período guardado y se
        // reutilizan si hay que calcular en vivo.
        const usersPromise = Promise.resolve().then(() => retrieveUsers())
        usersPromise.catch(() => {})

        const stored = await tryStored({ start, end, includeHistory })

        let config = RATING_CONFIG
        let previousRanking
        let currentRanking
        let periodEvents
        if (stored.previous) {
            previousRanking = rankPlayers(stored.previous)
            currentRanking = rankPlayers(stored.current)
            periodEvents = stored.periodEvents
        } else {
            const timeline = await retrieveRatingsTimeline({ retrieveMatches })
            config = timeline.config
            previousRanking = rankPlayers(timeline.snapshotAt(start))
            currentRanking = rankPlayers(timeline.snapshotAt(end))
            periodEvents = []
            timeline.events.forEach((event, index) => {
                if (
                    event.time !== null &&
                    event.time >= start &&
                    event.time < end
                ) {
                    periodEvents.push({ ...event, seq: index + 1 })
                }
            })
        }
        const users = await usersPromise
        const names = buildNameIndex(users || [])

        if (retrieveStored) {
            log({
                endpoint,
                source: stored.previous ? "stored" : "live",
                reason: stored.previous ? "ok" : stored.reason,
                players: currentRanking.length,
                durationMs: clock() - startedAt,
                ...(stored.errorName && { errorName: stored.errorName }),
            })
        }

        return { config, previousRanking, currentRanking, periodEvents, names }
    }
}

module.exports = { createPeriodSource }

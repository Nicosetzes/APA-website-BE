const { RATING_CONFIG } = require("../../config/ratings")
const defaultLogger = require("../../utils/logger")
const { isReadModelEnabled } = require("../../config/ratingReadModel")
const { getArgentinaDayRange } = require("../../utils/argentinaDay")
const { rankPlayers } = require("../../service/playerRatings")
const {
    buildNameIndex,
    describeParameters,
    displayName,
    round,
    toIso,
} = require("../../service/playerRatings/presentation")
const {
    retrieveAllUsers,
    retrieveRatingMatches,
    retrieveRatingsTimeline,
    retrieveStoredPeriod,
} = require("./../../service")

// La sorpresa del período: el partido con ganador que el Elo menos esperaba.
// Los empates y los penales no cuentan, y si el favorito ganó siempre no hay
// sorpresa.
const findBiggestUpset = (periodEvents, names) => {
    let upset = null

    for (const event of periodEvents) {
        if (event.resultP1 === 0.5) continue

        const p1Won = event.resultP1 === 1
        const winnerExpected = p1Won ? event.expectedP1 : 1 - event.expectedP1

        if (
            winnerExpected < 0.5 &&
            (!upset || winnerExpected < upset.expected)
        ) {
            upset = { event, p1Won, expected: winnerExpected }
        }
    }

    if (!upset) return null

    const { event, p1Won, expected } = upset
    const winner = p1Won ? event.p1 : event.p2
    const loser = p1Won ? event.p2 : event.p1

    return {
        matchId: event.matchId,
        playedAt: toIso(event.time),
        tournament: event.tournament,
        type: event.type,
        winner: { id: winner.id, name: displayName(names, winner) },
        loser: { id: loser.id, name: displayName(names, loser) },
        score: {
            winner: p1Won ? event.scoreP1 : event.scoreP2,
            loser: p1Won ? event.scoreP2 : event.scoreP1,
        },
        // Puntaje esperado por el Elo, no la probabilidad de ganar: el empate
        // cuenta como 0,5. Incluye el término de fuerza de equipo cuando hay
        // overall de ambos equipos (rating 2.0).
        winnerExpectedScore: round(expected, 3),
        ratingSwing: round(Math.abs(event.delta)),
    }
}

// Arma el cuerpo de la respuesta a partir de los dos rankings (en `start` y en
// `end`) y los eventos del período. Lo usan los dos caminos (en vivo y desde lo
// guardado), así que el payload es idéntico por construcción.
const buildPeriodPayload = ({
    previousRanking,
    currentRanking,
    periodEvents,
    config,
    names,
    dateFrom,
    dateTo,
}) => {
    const initial = config.initialRating
    const previousById = new Map(
        previousRanking.map((player) => [player.id, player])
    )

    const periodById = new Map()
    for (const event of periodEvents) {
        for (const [side, result] of [
            [event.p1, event.resultP1],
            [event.p2, 1 - event.resultP1],
        ]) {
            const record = periodById.get(side.id) ?? {
                matches: 0,
                wins: 0,
                draws: 0,
                losses: 0,
            }
            record.matches += 1
            if (result === 1) record.wins += 1
            else if (result === 0) record.losses += 1
            else record.draws += 1
            periodById.set(side.id, record)
        }
    }

    const players = currentRanking.map((player) => {
        const previous = previousById.get(player.id) ?? null
        const record = periodById.get(player.id) ?? {
            matches: 0,
            wins: 0,
            draws: 0,
            losses: 0,
        }

        return {
            position: player.position,
            previousPosition: previous?.position ?? null,
            // Positivo: subió lugares en el ranking.
            positionChange: previous
                ? previous.position - player.position
                : null,
            player: { id: player.id, name: displayName(names, player) },
            rating: round(player.rating),
            previousRating: previous ? round(previous.rating) : null,
            ratingChange: round(
                player.rating - (previous ? previous.rating : initial)
            ),
            matchesInPeriod: record.matches,
            record: {
                wins: record.wins,
                draws: record.draws,
                losses: record.losses,
            },
            provisional: player.matches < config.provisionalMatches,
        }
    })

    return {
        success: true,
        dateFrom,
        dateTo,
        parameters: describeParameters(config),
        data: {
            matchesInPeriod: periodEvents.length,
            players,
            highlights: {
                biggestUpset: findBiggestUpset(periodEvents, names),
            },
        },
    }
}

const createGetRatingsPeriod = (dependencies = {}) => {
    const retrieveMatches =
        dependencies.retrieveAllMatches || retrieveRatingMatches
    const retrieveUsers = dependencies.retrieveAllUsers || retrieveAllUsers
    const logger = dependencies.logger || defaultLogger
    const readModelEnabled = dependencies.readModelEnabled || isReadModelEnabled
    const clock = dependencies.clock || Date.now

    const retrieveStored =
        dependencies.retrieveStoredPeriod ??
        (dependencies.retrieveAllMatches ? undefined : retrieveStoredPeriod)

    const tryStored = async ({ start, end }) => {
        try {
            if (!retrieveStored) return { reason: "not_wired" }
            if (!readModelEnabled()) return { reason: "disabled" }
            const response = await retrieveStored({ start, end })
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

    return async (req, res) => {
        const startedAt = clock()
        const { dateFrom, dateTo } = req.query
        // Período [start, end): del inicio del primer día al fin del último.
        const start = getArgentinaDayRange(dateFrom).start.getTime()
        const end = getArgentinaDayRange(dateTo).end.getTime()

        // Los usuarios se leen en paralelo con el período guardado y se
        // reutilizan si hay que calcular en vivo.
        const usersPromise = Promise.resolve().then(() => retrieveUsers())
        usersPromise.catch(() => {})

        const stored = await tryStored({ start, end })

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
            periodEvents = timeline.events.filter(
                (event) =>
                    event.time !== null &&
                    event.time >= start &&
                    event.time < end
            )
        }
        const users = await usersPromise
        const names = buildNameIndex(users || [])

        if (retrieveStored) {
            log({
                endpoint: "ratings_period",
                source: stored.previous ? "stored" : "live",
                reason: stored.previous ? "ok" : stored.reason,
                players: currentRanking.length,
                durationMs: clock() - startedAt,
                ...(stored.errorName && { errorName: stored.errorName }),
            })
        }

        return res.json(
            buildPeriodPayload({
                previousRanking,
                currentRanking,
                periodEvents,
                config,
                names,
                dateFrom,
                dateTo,
            })
        )
    }
}

const getRatingsPeriod = createGetRatingsPeriod()

module.exports = getRatingsPeriod
module.exports.createGetRatingsPeriod = createGetRatingsPeriod
module.exports.buildPeriodPayload = buildPeriodPayload

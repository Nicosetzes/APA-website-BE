const { RATING_CONFIG } = require("../../config/ratings")
const { assessFreshness } = require("../ratingsStore/freshness")
const { NUMERIC_TOLERANCE } = require("../ratingsStore/constants")
const { toPlayerState } = require("./createRetrieveStoredRanking")

// Período (`GET /api/ratings/period`) leído de los ratings persistidos. Devuelve
// `{ previous, current, periodEvents }` si lo guardado está fresco, o
// `{ stale: <razón> }` si no. `previous` y `current` son Maps `id -> estado` con
// lo único que leen `rankPlayers` y la respuesta (`id`, `name`, `rating`,
// `matches`): el estado de cada jugador en `start` y en `end`, el MISMO que
// arma el camino en vivo con `timeline.snapshotAt`. `periodEvents` son los
// eventos con `start <= time < end` (con `time` en milisegundos y `matchId`
// como string), la forma que espera el controller. Un dato viejo NUNCA lanza;
// lanzan las fallas de lectura de los DAOs y los documentos malformados (el que
// lo usa lo registra como error y calcula en vivo).
//
// Se leen en paralelo cuatro cosas, sin traer nunca la cola posterior a `end`:
//   - frescura (`findRatingSourceStats`) y estado actual (`findRankingPlayerRatings`)
//   - A: los eventos del período `[start, end)` ordenados por `seq`
//   - B: por jugador, su primer y su último evento con `time >= end`
// Sirve para cualquier período, también para uno viejo: el costo no crece con
// la cantidad de partidos posteriores.
//
// Regla de reconstrucción. El estado de un jugador en T es el `before`/`games`
// de su primer evento con `time >= T` y, si no tiene, su estado actual. Es
// exacto bit a bit: el motor hace `rating = before ± delta` y el `before` del
// evento siguiente es ese mismo valor.
//   - En `start`: primer evento del jugador en A; si no, `first` de B; si no,
//     el estado actual.
//   - En `end`: `first` de B; si no, el estado actual.
// Un jugador que debuta dentro o después del período tiene `games === 0` en su
// primer evento, así que queda con `matches === 0` y `rankPlayers` lo descarta
// (igual que en vivo). Los eventos sin `time` quedan siempre antes de cualquier
// corte: no entran ni en A ni en B, pero cuentan en el `games` del siguiente.
//
// Nombre. En `end` se usa el del último evento del período del jugador; si no
// jugó en el período, el de su primer evento posterior a `end`; si no, el
// actual. Es igual al del camino en vivo (el del último evento anterior a `end`)
// salvo para un jugador que no jugó en el período y cambió de nombre en partidos
// posteriores: ahí puede diferir (y solo se nota si no tiene apodo de usuario).
// El nombre en `start` solo desempata `rankPlayers` y no sale en la respuesta.
//
// Encadenado (`findChainBreak`). Además de la frescura se verifica que los
// eventos leídos encadenan entre sí y terminan en el estado guardado de
// `player-ratings`. Límite: los jugadores cuyo último evento es anterior a
// `start` no se leen, así que no se verifican (su estado sale solo de
// `player-ratings`, una colección coherente por la regla de frescura).
const fail = (message) => {
    throw new Error(`createRetrieveStoredPeriod: ${message}`)
}

const isFiniteNumber = (value) =>
    typeof value === "number" && Number.isFinite(value)
const isCount = (value) => Number.isInteger(value) && value >= 0
const isNonEmptyString = (value) => typeof value === "string" && value !== ""
const isValidDate = (value) =>
    value instanceof Date && !Number.isNaN(value.getTime())
const near = (a, b) => Math.abs(a - b) <= NUMERIC_TOLERANCE

const parseSide = (side, where) => {
    if (typeof side !== "object" || side === null) fail(`${where} no existe`)
    if (!isNonEmptyString(side.id)) fail(`${where} no tiene id (string)`)
    if (typeof side.name !== "string") fail(`${where} no tiene name`)
    if (!isFiniteNumber(side.before)) fail(`${where} no tiene before numérico`)
    if (!isCount(side.games)) fail(`${where} no tiene games entero >= 0`)
    return {
        id: side.id,
        name: side.name,
        before: side.before,
        games: side.games,
    }
}

const optionalText = (value, where) => {
    if (value === null || value === undefined) return null
    if (typeof value !== "string") fail(`${where} no es un string`)
    return value
}

// Evento de la consulta A (documento `lean`) -> forma del motor que consume
// `findBiggestUpset`: `time` en milisegundos y `matchId` como string.
const parsePeriodEvent = (doc) => {
    if (typeof doc !== "object" || doc === null) fail("evento inválido")
    const where = `el evento ${doc.seq}`
    if (!isFiniteNumber(doc.seq)) fail("un evento no tiene seq numérico")
    if (doc.matchId === null || doc.matchId === undefined) {
        fail(`${where} no tiene matchId`)
    }
    const matchId = String(doc.matchId)
    if (matchId === "") fail(`${where} no tiene matchId`)
    if (!isValidDate(doc.time)) fail(`${where} no tiene time (Date válida)`)
    for (const field of [
        "scoreP1",
        "scoreP2",
        "expectedP1",
        "resultP1",
        "delta",
    ]) {
        if (!isFiniteNumber(doc[field])) {
            fail(`${where} no tiene ${field} numérico`)
        }
    }
    return {
        seq: doc.seq,
        matchId,
        time: doc.time.getTime(),
        tournament: optionalText(doc.tournament, `${where}: tournament`),
        type: optionalText(doc.type, `${where}: type`),
        scoreP1: doc.scoreP1,
        scoreP2: doc.scoreP2,
        expectedP1: doc.expectedP1,
        resultP1: doc.resultP1,
        delta: doc.delta,
        p1: parseSide(doc.p1, `${where}: p1`),
        p2: parseSide(doc.p2, `${where}: p2`),
    }
}

// Fila de la consulta B -> `{ id, count, first, last }`. Las huellas ya se
// verificaron antes (ver `hasForeignFingerprint`).
const parseBoundaryRow = (row) => {
    if (typeof row !== "object" || row === null) fail("fila de borde inválida")
    if (!isNonEmptyString(row.id))
        fail("una fila de borde no tiene id (string)")
    const where = `la fila de borde ${row.id}`
    if (!Number.isInteger(row.count) || row.count < 1) {
        fail(`${where} no tiene count entero >= 1`)
    }
    const { first, last } = row
    if (typeof first !== "object" || first === null) {
        fail(`${where} no tiene first`)
    }
    if (typeof last !== "object" || last === null) {
        fail(`${where} no tiene last`)
    }
    if (!isFiniteNumber(first.seq) || !isFiniteNumber(last.seq)) {
        fail(`${where} no tiene seq numérico`)
    }
    if (typeof first.name !== "string") fail(`${where} no tiene first.name`)
    for (const [field, side] of [
        ["first", first],
        ["last", last],
    ]) {
        if (!isFiniteNumber(side.before)) {
            fail(`${where} no tiene ${field}.before numérico`)
        }
        if (!isCount(side.games)) {
            fail(`${where} no tiene ${field}.games entero >= 0`)
        }
    }
    if (!isFiniteNumber(last.delta)) fail(`${where} no tiene last.delta`)
    if (last.sign !== 1 && last.sign !== -1) {
        fail(`${where} no tiene last.sign 1 o -1`)
    }
    return {
        id: row.id,
        count: row.count,
        first: {
            seq: first.seq,
            name: first.name,
            before: first.before,
            games: first.games,
        },
        last: {
            seq: last.seq,
            before: last.before,
            games: last.games,
            delta: last.delta,
            sign: last.sign,
        },
    }
}

// ¿Algún evento leído tiene una huella distinta de la actual? Cubre TODOS los
// eventos de la cola posterior a `end` (la consulta B devuelve el set de
// huellas). Tolera documentos malformados: se evalúa antes de validar tipos.
const hasForeignFingerprint = ({ rawEvents, rawBoundary, fingerprint }) =>
    rawEvents.some((event) => event?.fingerprint !== fingerprint) ||
    rawBoundary.some(
        (row) =>
            !Array.isArray(row?.fingerprints) ||
            row.fingerprints.some((value) => value !== fingerprint)
    )

// Eventos del período por jugador, en orden: `{ sign, before, games, delta,
// name }`.
const groupPeriodByPlayer = (periodEvents) => {
    const byPlayer = new Map()
    for (const event of periodEvents) {
        for (const [side, sign] of [
            [event.p1, 1],
            [event.p2, -1],
        ]) {
            if (!byPlayer.has(side.id)) byPlayer.set(side.id, [])
            byPlayer.get(side.id).push({
                sign,
                before: side.before,
                games: side.games,
                delta: event.delta,
                name: side.name,
            })
        }
    }
    return byPlayer
}

// `null` si los eventos leídos encadenan y terminan en el estado guardado; si
// no, un texto con la regla que falló (solo sirve para los tests). Reglas:
//   1. todo jugador con eventos leídos existe en `players`;
//   2. dentro de A, cada evento sigue al anterior (`games + 1` y
//      `before = before anterior + signo * delta anterior`);
//   3. empalme A -> B con el mismo criterio;
//   4. con B: `first.games + count === matches` (sin huecos ni sobrantes en la
//      cola) y el último evento termina en `rating` y `matches` guardados;
//   5. con A y sin B: el último evento de A termina en el estado guardado.
const findChainBreak = ({ players, periodEvents, boundary }) => {
    const periodByPlayer = groupPeriodByPlayer(periodEvents)
    const ids = new Set([...periodByPlayer.keys(), ...boundary.keys()])

    for (const id of ids) {
        const player = players.get(id)
        if (!player)
            return `${id}: tiene eventos pero no está en player-ratings`

        const chain = periodByPlayer.get(id) ?? []
        for (let index = 1; index < chain.length; index += 1) {
            const previous = chain[index - 1]
            const current = chain[index]
            if (
                current.games !== previous.games + 1 ||
                !near(
                    current.before,
                    previous.before + previous.sign * previous.delta
                )
            ) {
                return `${id}: el período no encadena`
            }
        }

        const lastOfPeriod = chain[chain.length - 1]
        const edge = boundary.get(id)
        if (edge) {
            if (
                lastOfPeriod &&
                (edge.first.games !== lastOfPeriod.games + 1 ||
                    !near(
                        edge.first.before,
                        lastOfPeriod.before +
                            lastOfPeriod.sign * lastOfPeriod.delta
                    ))
            ) {
                return `${id}: el empalme período-borde no encadena`
            }
            if (edge.first.games + edge.count !== player.matches) {
                return `${id}: la cola posterior no suma los partidos guardados`
            }
            if (
                edge.last.games + 1 !== player.matches ||
                !near(
                    edge.last.before + edge.last.sign * edge.last.delta,
                    player.rating
                )
            ) {
                return `${id}: el último evento no termina en el estado guardado`
            }
        } else if (
            lastOfPeriod.games + 1 !== player.matches ||
            !near(
                lastOfPeriod.before + lastOfPeriod.sign * lastOfPeriod.delta,
                player.rating
            )
        ) {
            return `${id}: el último evento del período no termina en el estado guardado`
        }
    }
    return null
}

// Estados de cada jugador en `start` (`previous`) y en `end` (`current`) con la
// regla de reconstrucción del encabezado. Función pura.
const buildPeriodSnapshots = ({ players, periodEvents, boundary }) => {
    const firstInPeriod = new Map()
    const lastPeriodName = new Map()
    for (const [id, chain] of groupPeriodByPlayer(periodEvents)) {
        firstInPeriod.set(id, chain[0])
        lastPeriodName.set(id, chain[chain.length - 1].name)
    }

    const previous = new Map()
    const current = new Map()
    for (const player of players.values()) {
        const edge = boundary.get(player.id)
        const atStart = firstInPeriod.get(player.id) ?? edge?.first
        const atEnd = edge?.first

        previous.set(
            player.id,
            atStart
                ? {
                      id: player.id,
                      name: atStart.name,
                      rating: atStart.before,
                      matches: atStart.games,
                  }
                : {
                      id: player.id,
                      name: player.name,
                      rating: player.rating,
                      matches: player.matches,
                  }
        )
        current.set(player.id, {
            id: player.id,
            name: lastPeriodName.get(player.id) ?? atEnd?.name ?? player.name,
            rating: atEnd ? atEnd.before : player.rating,
            matches: atEnd ? atEnd.games : player.matches,
        })
    }
    return { previous, current }
}

const createRetrieveStoredPeriod = ({
    findRatingSourceStats,
    findRankingPlayerRatings,
    findRatingEventsInRange,
    findRatingBoundaryEvents,
    getCurrentFingerprint,
    config = RATING_CONFIG,
} = {}) => {
    for (const [name, dependency] of Object.entries({
        findRatingSourceStats,
        findRankingPlayerRatings,
        findRatingEventsInRange,
        findRatingBoundaryEvents,
        getCurrentFingerprint,
    })) {
        if (typeof dependency !== "function") {
            throw new TypeError(`createRetrieveStoredPeriod: falta ${name}`)
        }
    }

    // `start` y `end` en milisegundos; el período es `[start, end)`.
    return async ({ start, end } = {}) => {
        if (!isFiniteNumber(start) || !isFiniteNumber(end) || start >= end) {
            fail("start y end tienen que ser milisegundos con start < end")
        }

        const [currentSourceStats, docs, rawEvents, rawBoundary] =
            await Promise.all([
                findRatingSourceStats(),
                findRankingPlayerRatings(config.version),
                findRatingEventsInRange(
                    config.version,
                    new Date(start),
                    new Date(end)
                ),
                findRatingBoundaryEvents(config.version, new Date(end)),
            ])
        const currentFingerprint = await getCurrentFingerprint()
        const freshness = assessFreshness({
            players: docs,
            currentFingerprint,
            currentSourceStats,
            ratingVersion: config.version,
        })
        if (!freshness.fresh) return { stale: freshness.reason }

        if (!Array.isArray(rawEvents))
            fail("los eventos del período no son un arreglo")
        if (!Array.isArray(rawBoundary))
            fail("el borde posterior no es un arreglo")
        if (
            hasForeignFingerprint({
                rawEvents,
                rawBoundary,
                fingerprint: currentFingerprint,
            })
        ) {
            return { stale: "fingerprint_mismatch" }
        }

        const players = new Map()
        for (const doc of docs) {
            players.set(doc.id, toPlayerState(doc))
        }
        const periodEvents = rawEvents.map(parsePeriodEvent)
        const boundary = new Map()
        for (const row of rawBoundary) {
            const parsed = parseBoundaryRow(row)
            if (boundary.has(parsed.id)) {
                fail(`el borde tiene más de una fila para ${parsed.id}`)
            }
            boundary.set(parsed.id, parsed)
        }

        if (findChainBreak({ players, periodEvents, boundary }) !== null) {
            return { stale: "inconsistent_chain" }
        }

        const { previous, current } = buildPeriodSnapshots({
            players,
            periodEvents,
            boundary,
        })
        return { previous, current, periodEvents }
    }
}

module.exports = {
    buildPeriodSnapshots,
    createRetrieveStoredPeriod,
    findChainBreak,
    parseBoundaryRow,
    parsePeriodEvent,
}

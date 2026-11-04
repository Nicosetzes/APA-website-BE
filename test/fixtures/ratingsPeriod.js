"use strict"

// Fixtures de los tests de `GET /api/ratings/period` desde lo persistido
// (dao/findRatingEventsInRange, dao/findRatingBoundaryEvents,
// service/ratingsReadModel/createRetrieveStoredPeriod y el controller).
//
// Los modelos falsos simulan las consultas A y B a partir de los eventos que
// arma el motor (`storedDocsFrom`): A filtra por `time`, ordena por `seq` y
// aplica la proyección; B ejecuta la pipeline REAL del DAO con `runPipeline`.
// Así el test dorado compara el camino en vivo contra lo que de verdad
// devolverían las consultas, no contra un fake que reimplementa el resultado.
const mongoose = require("mongoose")
const { createGetRatingsPeriod } = require("../../controller/getRatingsPeriod")
const findRatingBoundaryEvents = require("../../dao/findRatingBoundaryEvents")
const findRatingEventsInRange = require("../../dao/findRatingEventsInRange")
const {
    createRetrieveStoredPeriod,
} = require("../../service/ratingsReadModel/createRetrieveStoredPeriod")
const {
    FINGERPRINT,
    SOURCE_STATS,
    storedDocsFrom,
} = require("./ratingsReadModel")
const { match, objectId } = require("./ratingsStore")

// ---------------------------------------------------------------------------
// Mini intérprete de pipelines de agregación (solo lo que usa la consulta B)
// ---------------------------------------------------------------------------

const unsupported = (what) => {
    throw new Error(`runPipeline: no soporta ${what}`)
}

const getPath = (doc, path) =>
    path
        .split(".")
        .reduce(
            (value, key) =>
                value === null || value === undefined ? undefined : value[key],
            doc
        )

const isPlainObject = (value) =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof mongoose.Types.ObjectId)

const evalExpr = (expr, doc) => {
    if (typeof expr === "string" && expr.startsWith("$")) {
        return getPath(doc, expr.slice(1))
    }
    if (Array.isArray(expr)) {
        return expr.map((item) => evalExpr(item, doc) ?? null)
    }
    if (isPlainObject(expr)) {
        const keys = Object.keys(expr)
        if (keys.some((key) => key.startsWith("$"))) {
            if (keys.length === 1 && keys[0] === "$literal") {
                return expr.$literal
            }
            return unsupported(`el operador ${keys.join(",")}`)
        }
        const result = {}
        for (const key of keys) {
            const value = evalExpr(expr[key], doc)
            if (value !== undefined) result[key] = value
        }
        return result
    }
    return expr
}

const comparable = (value) => (value instanceof Date ? value.getTime() : value)

// Igual que Mongo: `null` y `undefined` no se pueden comparar con una fecha o un
// número, así que no cumplen `$gte` ni `$lt`.
const matchesFilter = (doc, filter) =>
    Object.entries(filter).every(([field, condition]) => {
        const value = getPath(doc, field)
        if (!isPlainObject(condition)) {
            return comparable(value) === comparable(condition)
        }
        return Object.entries(condition).every(([operator, operand]) => {
            if (operator !== "$gte" && operator !== "$lt") {
                return unsupported(`el operador ${operator} en $match`)
            }
            if (value === null || value === undefined) return false
            return operator === "$gte"
                ? comparable(value) >= comparable(operand)
                : comparable(value) < comparable(operand)
        })
    })

const sortDocs = (docs, spec) =>
    [...docs].sort((a, b) => {
        for (const [field, direction] of Object.entries(spec)) {
            if (direction !== 1 && direction !== -1) {
                return unsupported("un $sort distinto de 1 o -1")
            }
            const left = comparable(getPath(a, field))
            const right = comparable(getPath(b, field))
            if (left === right) continue
            return (left < right ? -1 : 1) * direction
        }
        return 0
    })

const projectStage = (docs, spec) => {
    const entries = Object.entries(spec)
    const exclusion = entries.every(([, value]) => value === 0)
    return docs.map((doc) => {
        if (exclusion) {
            const copy = { ...doc }
            for (const [key] of entries) delete copy[key]
            return copy
        }
        const result = {}
        for (const [key, value] of entries) {
            if (value === 0) continue
            if (value === 1) {
                if (getPath(doc, key) !== undefined) {
                    result[key] = getPath(doc, key)
                }
            } else {
                const evaluated = evalExpr(value, doc)
                if (evaluated !== undefined) result[key] = evaluated
            }
        }
        return result
    })
}

const unwindStage = (docs, spec) => {
    if (typeof spec !== "string" || !spec.startsWith("$")) {
        return unsupported("un $unwind con opciones")
    }
    const field = spec.slice(1)
    const result = []
    for (const doc of docs) {
        const array = doc[field]
        if (!Array.isArray(array)) continue
        for (const item of array) result.push({ ...doc, [field]: item })
    }
    return result
}

const groupStage = (docs, spec) => {
    const { _id: idExpr, ...accumulators } = spec
    const groups = new Map()
    for (const doc of docs) {
        const id = evalExpr(idExpr, doc)
        if (!groups.has(id)) groups.set(id, { _id: id, rows: [] })
        groups.get(id).rows.push(doc)
    }
    return [...groups.values()].map(({ _id, rows }) => {
        const result = { _id }
        for (const [name, accumulator] of Object.entries(accumulators)) {
            const keys = Object.keys(accumulator)
            if (keys.length !== 1) return unsupported("un acumulador")
            const [operator] = keys
            const operand = accumulator[operator]
            if (operator === "$sum") {
                if (operand !== 1) return unsupported("$sum distinto de 1")
                result[name] = rows.length
            } else if (operator === "$addToSet") {
                const seen = []
                for (const row of rows) {
                    const value = evalExpr(operand, row)
                    if (!seen.some((item) => item === value)) seen.push(value)
                }
                result[name] = seen
            } else if (operator === "$first") {
                result[name] = evalExpr(operand, rows[0])
            } else if (operator === "$last") {
                result[name] = evalExpr(operand, rows[rows.length - 1])
            } else {
                return unsupported(`el acumulador ${operator}`)
            }
        }
        return result
    })
}

const runPipeline = (docs, pipeline) =>
    pipeline.reduce((current, stage) => {
        const keys = Object.keys(stage)
        if (keys.length !== 1) return unsupported("una etapa con varias claves")
        const [name] = keys
        const spec = stage[name]
        switch (name) {
            case "$match":
                return current.filter((doc) => matchesFilter(doc, spec))
            case "$sort":
                return sortDocs(current, spec)
            case "$project":
                return projectStage(current, spec)
            case "$unwind":
                return unwindStage(current, spec)
            case "$group":
                return groupStage(current, spec)
            default:
                return unsupported(`la etapa ${name}`)
        }
    }, docs)

// Aplica una proyección tipo string de Mongoose ("a b.c -_id") a un documento.
const projectDoc = (doc, projection) => {
    const result = {}
    for (const field of projection.split(/\s+/).filter(Boolean)) {
        if (field.startsWith("-")) continue
        const keys = field.split(".")
        const value = getPath(doc, field)
        if (value === undefined) continue
        let target = result
        for (const key of keys.slice(0, -1)) {
            target[key] = target[key] ?? {}
            target = target[key]
        }
        target[keys[keys.length - 1]] = value
    }
    return result
}

// ---------------------------------------------------------------------------
// Modelos y DAOs falsos
// ---------------------------------------------------------------------------

// Documento tal como lo devuelve Mongo: `matchId` ObjectId y `time` Date o null.
const toMongoEvent = (event) => ({
    ...structuredClone({ ...event, matchId: undefined }),
    matchId: new mongoose.Types.ObjectId(String(event.matchId)),
    time: event.time ?? null,
})

// Modelo con `find().sort().lean()` (consulta A). Lee `docs.events` en cada
// llamada, así los tests pueden mutarlos.
const fakeRangeModel = (docs, calls = []) => ({
    find: (filter, projection) => {
        calls.push({ query: "find", filter, projection })
        const found = docs.events
            .map(toMongoEvent)
            .filter((event) => matchesFilter(event, filter))
        return {
            sort: (spec) => ({
                lean: async () =>
                    sortDocs(found, spec).map((event) =>
                        projectDoc(event, projection)
                    ),
            }),
        }
    },
})

// Modelo con `aggregate` (consulta B): ejecuta la pipeline real.
const fakeBoundaryModel = (docs, calls = []) => ({
    aggregate: async (pipeline) => {
        calls.push({ query: "aggregate", pipeline })
        return runPipeline(docs.events.map(toMongoEvent), pipeline)
    },
})

// Proyección de `findRankingPlayerRatings`.
const leanRankingPlayers = (docs) =>
    docs.players.map((player) => ({
        ratingVersion: player.ratingVersion,
        id: player.id,
        name: player.name,
        rating: player.rating,
        peak: player.peak,
        matches: player.matches,
        wins: player.wins,
        draws: player.draws,
        losses: player.losses,
        lastPlayedAt: player.lastPlayedAt,
        lastChange: player.lastChange,
        fingerprint: player.fingerprint,
        source: player.source && { ...player.source },
    }))

// Las dependencias del lector con los DAOs reales de A y B sobre modelos falsos.
const periodDaos = (
    docs,
    { sourceStats = SOURCE_STATS, calls = [], fingerprint = FINGERPRINT } = {}
) => ({
    findRatingSourceStats: async () => {
        calls.push({ dao: "findRatingSourceStats" })
        return sourceStats
    },
    findRankingPlayerRatings: async (version) => {
        calls.push({ dao: "findRankingPlayerRatings", args: [version] })
        return leanRankingPlayers(docs).filter(
            (player) => player.ratingVersion === version
        )
    },
    findRatingEventsInRange: (version, start, end) => {
        calls.push({
            dao: "findRatingEventsInRange",
            args: [version, start, end],
        })
        return findRatingEventsInRange(version, start, end, {
            model: fakeRangeModel(docs),
        })
    },
    findRatingBoundaryEvents: (version, end) => {
        calls.push({ dao: "findRatingBoundaryEvents", args: [version, end] })
        return findRatingBoundaryEvents(version, end, {
            model: fakeBoundaryModel(docs),
        })
    },
    getCurrentFingerprint: () => fingerprint,
})

// ---------------------------------------------------------------------------
// Historias
// ---------------------------------------------------------------------------

const P = (id, name) => ({ id, name: name ?? id.toUpperCase() })

// Ventana fija de `comboHistory`: del 2026-03-10 al 2026-03-12 (inclusive).
const COMBO_WINDOW = { dateFrom: "2026-03-10", dateTo: "2026-03-12" }

// Una historia con todas las categorías de jugador respecto de `COMBO_WINDOW`:
//   pa, pb   solo antes del período
//   pc, pd   solo después
//   pe, pf   antes y después, sin partidos en el período (ratingChange 0)
//   pg, ph   antes + período + después
//   pi, pj   debutan en el período y siguen después
//   pk, pl   solo en el período (pk/pl también juegan con pb: antes + período)
//   pm, pn   solo partidos sin fecha (time nulo)
const comboHistory = () => [
    match(1, P("pa"), 2, P("pb"), 0, "2026-03-01T15:00:00Z"),
    match(2, P("pe"), 1, P("pf"), 1, "2026-03-02T15:00:00Z"),
    match(3, P("pg"), 3, P("ph"), 1, "2026-03-03T15:00:00Z"),
    match(4, P("pg"), 0, P("ph"), 1, "2026-03-11T15:00:00Z"),
    match(5, P("pi"), 2, P("pj"), 1, "2026-03-11T18:00:00Z"),
    match(6, P("pk"), 1, P("pl"), 0, "2026-03-12T15:00:00Z"),
    match(7, P("pb"), 0, P("pk"), 2, "2026-03-12T18:00:00Z"),
    match(8, P("pc"), 4, P("pd"), 0, "2026-03-20T15:00:00Z"),
    match(9, P("pe"), 0, P("pf"), 2, "2026-03-21T15:00:00Z"),
    match(10, P("pg"), 2, P("ph"), 2, "2026-03-22T15:00:00Z"),
    match(11, P("pi"), 1, P("pj"), 0, "2026-03-23T15:00:00Z"),
    match(12, P("pm"), 2, P("pn"), 1, "2026-03-01T00:00:00Z", {
        playedAt: undefined,
    }),
    match(13, P("pm"), 0, P("pn"), 3, "2026-03-01T00:00:00Z", {
        playedAt: undefined,
    }),
]

// PRNG determinista (mulberry32).
const mulberry32 = (seed) => {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let t = state
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

const RANDOM_PLAYERS = ["ra", "rb", "rc", "rd", "re"].map((id) => P(id))
const RANDOM_FIRST_DAY = "2026-03-01"
const RANDOM_DAYS = 12
const RANDOM_HOURS = [12, 15, 18, 21]

// 30 a 60 partidos entre 5 jugadores en 12 días, con horas repetidas (mismo
// `playedAt` en varios partidos), ~10% sin fecha, ~5% no rateables y empates.
const randomHistory = (seed) => {
    const random = mulberry32(seed)
    const pick = (list) => list[Math.floor(random() * list.length)]
    const count = 30 + Math.floor(random() * 31)
    const matches = []
    for (let n = 1; n <= count; n += 1) {
        const first = pick(RANDOM_PLAYERS)
        let second = pick(RANDOM_PLAYERS)
        while (second.id === first.id) second = pick(RANDOM_PLAYERS)
        const day = 1 + Math.floor(random() * RANDOM_DAYS)
        const hour = pick(RANDOM_HOURS)
        const playedAt = `2026-03-${String(day).padStart(2, "0")}T${String(
            hour
        ).padStart(2, "0")}:00:00Z`
        const extra = {}
        if (random() < 0.1) extra.playedAt = undefined
        if (random() < 0.05) extra.played = false
        if (random() < 0.15) extra.type = "playoff"
        matches.push(
            match(
                n,
                first,
                Math.floor(random() * 5),
                second,
                Math.floor(random() * 5),
                playedAt,
                extra
            )
        )
    }
    return matches
}

// Todos los días de una lista de fechas `YYYY-MM-DD` consecutivas.
const daysFrom = (firstDay, count) => {
    const [year, month, day] = firstDay.split("-").map(Number)
    return Array.from({ length: count }, (_, offset) =>
        new Date(Date.UTC(year, month - 1, day + offset))
            .toISOString()
            .slice(0, 10)
    )
}

// Todas las ventanas `dateFrom <= dateTo` de una lista de días.
const allWindows = (days) => {
    const windows = []
    for (let from = 0; from < days.length; from += 1) {
        for (let to = from; to < days.length; to += 1) {
            windows.push({ dateFrom: days[from], dateTo: days[to] })
        }
    }
    return windows
}

// ---------------------------------------------------------------------------
// Controller: respuesta en vivo y respuesta desde lo guardado
// ---------------------------------------------------------------------------

const createResponse = () => ({
    body: null,
    json(body) {
        this.body = body
        return this
    },
})

const makeLogger = () => {
    const logs = []
    return {
        logs,
        info: (event, data) => logs.push({ level: "info", event, ...data }),
        warn: (event, data) => logs.push({ level: "warn", event, ...data }),
    }
}

const DEFAULT_USERS = [
    { id: "a", nickname: "Ana (nick)" },
    { id: "b", nickname: "Beto" },
    { id: "ra", nickname: "Rata" },
    { id: "pa", nickname: "Pa (nick)" },
    { id: "pg", nickname: "Pg (nick)" },
]

// La misma historia y ventana por los dos caminos. `docs` permite pasar
// documentos ya mutados; `overrides` pisa dependencias del controller guardado.
const bothPeriodResponses = async ({
    matches,
    users = DEFAULT_USERS,
    dateFrom,
    dateTo,
    docs = storedDocsFrom(matches),
    overrides = {},
    retrieveOptions = {},
}) => {
    const query = { dateFrom, dateTo }

    const live = createResponse()
    await createGetRatingsPeriod({
        retrieveAllMatches: async () => matches,
        retrieveAllUsers: async () => users,
    })({ query }, live)

    let liveReads = 0
    const calls = []
    const logger = makeLogger()
    const retrieve = createRetrieveStoredPeriod(
        periodDaos(docs, { calls, ...retrieveOptions })
    )
    const fromStored = createResponse()
    await createGetRatingsPeriod({
        retrieveAllMatches: async () => {
            liveReads += 1
            return matches
        },
        retrieveAllUsers: async () => users,
        retrieveStoredPeriod: retrieve,
        readModelEnabled: () => true,
        logger,
        ...overrides,
    })({ query }, fromStored)

    return {
        live: live.body,
        stored: fromStored.body,
        liveReads,
        logger,
        calls,
        docs,
    }
}

module.exports = {
    COMBO_WINDOW,
    DEFAULT_USERS,
    RANDOM_DAYS,
    RANDOM_FIRST_DAY,
    allWindows,
    bothPeriodResponses,
    comboHistory,
    createResponse,
    daysFrom,
    fakeBoundaryModel,
    fakeRangeModel,
    leanRankingPlayers,
    makeLogger,
    objectId,
    periodDaos,
    projectDoc,
    randomHistory,
    runPipeline,
    toMongoEvent,
}

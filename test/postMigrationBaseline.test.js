// Baseline de salidas antes/después de la limpieza post-migración.
//
// Corre los controllers con DI sobre un dataset en forma nueva
// (test/fixtures/postMigrationDataset.js). Los services y DAOs son los reales;
// sólo se reemplazan los métodos de los modelos por un motor en memoria que
// aplica filtro, orden y projection.
//
// - `UPDATE_BASELINE=1` escribe test/fixtures/post-migration-baseline.json.
//   Se genera una sola vez, sobre el código previo a la limpieza.
// - Sin la variable, compara contra `applyIntendedChanges(baseline)`: los
//   cambios intencionales (a)-(c) de esa función y el orden de torneos por
//   `startedAt`. Fuera de eso, todo tiene que dar idéntico.

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const matchesModel = require("../dao/models/matches")
const tournamentsModel = require("../dao/models/tournaments")
const usersModel = require("../dao/models/users")
const findTournaments = require("../dao/findTournaments")
const service = require("../service")
const { createGetStatistics } = require("../controller/getStatistics")
const { createGetAllTimeTeams } = require("../controller/getAllTimeTeams")
const {
    createGetAllTimeFaceToFace,
} = require("../controller/getAllTimeFaceToFace")
const {
    createGetStandingsTableByTournamentId,
} = require("../controller/getStandingsTableByTournamentId")
const {
    createGetPlayoffsTableByTournamentId,
} = require("../controller/getPlayoffsTableByTournamentId")
const {
    createGetTournamentSummaryByTournamentId,
} = require("../controller/getTournamentSummaryByTournamentId")
const { IDS, createDataset } = require("./fixtures/postMigrationDataset")

const BASELINE_PATH = path.join(
    __dirname,
    "fixtures",
    "post-migration-baseline.json"
)

// Se pone en true recién cuando el código ya refleja la limpieza (plan 1.6).
const CLEANUP_APPLIED = true

// --- Motor de consultas en memoria -----------------------------------------

const getPath = (doc, key) =>
    key
        .split(".")
        .reduce((value, part) => (value == null ? undefined : value[part]), doc)

const toComparable = (value) =>
    value instanceof Date ? value.getTime() : value

const equals = (actual, expected) => {
    if (expected === null) return actual === null || actual === undefined
    return toComparable(actual) === toComparable(expected)
}

const compareValues = (a, b) => {
    const left = toComparable(a)
    const right = toComparable(b)
    if (left === right) return 0
    // Como en Mongo, null/ausente va antes que cualquier valor en asc.
    if (left === null || left === undefined) return -1
    if (right === null || right === undefined) return 1
    return left < right ? -1 : 1
}

const matchesCondition = (actual, condition) => {
    const isOperatorObject =
        condition !== null &&
        typeof condition === "object" &&
        !(condition instanceof Date) &&
        Object.keys(condition).some((key) => key.startsWith("$"))

    if (!isOperatorObject) return equals(actual, condition)

    return Object.entries(condition).every(([operator, operand]) => {
        switch (operator) {
            case "$ne":
                return !equals(actual, operand)
            case "$in":
                return operand.some((value) => equals(actual, value))
            case "$exists":
                return (actual !== undefined) === Boolean(operand)
            case "$gte":
                return actual != null && compareValues(actual, operand) >= 0
            case "$gt":
                return actual != null && compareValues(actual, operand) > 0
            case "$lte":
                return actual != null && compareValues(actual, operand) <= 0
            case "$lt":
                return actual != null && compareValues(actual, operand) < 0
            default:
                throw new Error(`Operador no soportado: ${operator}`)
        }
    })
}

const matchesFilter = (doc, filter = {}) =>
    Object.entries(filter).every(([key, condition]) => {
        if (key === "$or") return condition.some((f) => matchesFilter(doc, f))
        if (key === "$and") return condition.every((f) => matchesFilter(doc, f))
        return matchesCondition(getPath(doc, key), condition)
    })

const sortDocs = (docs, spec) => {
    const entries = Object.entries(spec || {})
    return [...docs].sort((a, b) => {
        for (const [key, direction] of entries) {
            const result = compareValues(getPath(a, key), getPath(b, key))
            if (result !== 0) return direction < 0 ? -result : result
        }
        return 0
    })
}

const toProjectionObject = (projection) => {
    if (!projection) return null
    if (typeof projection === "object") return projection
    return Object.fromEntries(
        projection
            .split(/\s+/)
            .filter(Boolean)
            .map((field) => [field, 1])
    )
}

// `_id` más los campos nombrados (sólo projections de inclusión).
const projectPlain = (doc, projection) => {
    if (!projection) return doc
    const result = { _id: doc._id }
    for (const field of Object.keys(projection)) {
        if (doc[field] !== undefined) result[field] = doc[field]
    }
    return result
}

const createQuery = ({ model, source, filter, projection, single, plain }) => {
    let sortSpec = null
    let lean = false
    const projectionObject = toProjectionObject(projection)

    const query = {
        sort(spec) {
            sortSpec = spec
            return query
        },
        lean() {
            lean = true
            return query
        },
        session() {
            return query
        },
        async exec() {
            let docs = source().filter((doc) => matchesFilter(doc, filter))
            if (sortSpec) docs = sortDocs(docs, sortSpec)
            const output = docs.map((doc) => {
                const copy = structuredClone(doc)
                if (lean || plain) return projectPlain(copy, projectionObject)
                return model.hydrate(copy, projectionObject)
            })
            return single ? output[0] ?? null : output
        },
        then(onFulfilled, onRejected) {
            return query.exec().then(onFulfilled, onRejected)
        },
    }
    return query
}

const installModelStubs = (t, dataset) => {
    const originals = {
        matchesFind: matchesModel.find,
        tournamentsFind: tournamentsModel.find,
        tournamentsFindById: tournamentsModel.findById,
        usersFind: usersModel.find,
    }
    t.after(() => {
        matchesModel.find = originals.matchesFind
        tournamentsModel.find = originals.tournamentsFind
        tournamentsModel.findById = originals.tournamentsFindById
        usersModel.find = originals.usersFind
    })

    matchesModel.find = (filter, projection) =>
        createQuery({
            model: matchesModel,
            source: () => dataset.matches,
            filter,
            projection,
        })
    // Las listas de torneos reciben objetos planos con `_id` + projection.
    tournamentsModel.find = (filter, projection) =>
        createQuery({
            model: tournamentsModel,
            source: () => dataset.tournaments,
            filter,
            projection,
            plain: true,
        })
    tournamentsModel.findById = (id) =>
        createQuery({
            model: tournamentsModel,
            source: () => dataset.tournaments,
            filter: { _id: String(id) },
            single: true,
        })
    usersModel.find = (filter, projection) =>
        createQuery({
            model: usersModel,
            source: () => dataset.users,
            filter,
            projection,
        })
}

// --- Ejecución de controllers -----------------------------------------------

const silentLogger = { info() {}, warn() {}, error() {} }

const createResponse = () => ({
    statusCode: null,
    body: null,
    status(code) {
        this.statusCode = code
        return this
    },
    json(body) {
        this.body = body
        return this
    },
    send(body) {
        this.body = body
        return this
    },
})

const serialize = (value) => JSON.parse(JSON.stringify(value))

const run = async (controller, request) => {
    const response = createResponse()
    await controller({ params: {}, query: {}, ...request }, response)
    assert.equal(response.statusCode, 200)
    return serialize(response.body)
}

const captureSnapshot = async () => {
    const getStatistics = createGetStatistics({
        retrieveAllUsers: service.retrieveAllUsers,
        retrieveAllMatches: service.retrieveAllMatches,
        retrieveTournamentById: service.retrieveTournamentById,
        retrieveTournamentsForStatistics:
            service.retrieveTournamentsForStatistics,
        orderMatchesFromTournamentById: service.orderMatchesFromTournamentById,
        logger: silentLogger,
    })
    const getAllTimeTeams = createGetAllTimeTeams({
        retrieveAllMatches: service.retrieveAllMatches,
    })
    const getAllTimeFaceToFace = createGetAllTimeFaceToFace({
        retrieveAllUsers: service.retrieveAllUsers,
        retrieveAllMatches: service.retrieveAllMatches,
    })
    const getStandings = createGetStandingsTableByTournamentId({
        retrieveTournamentById: service.retrieveTournamentById,
        orderMatchesFromTournamentById: service.orderMatchesFromTournamentById,
        retrieveAllNotPlayedMatchesByTournamentId:
            service.retrieveAllNotPlayedMatchesByTournamentId,
    })
    const getPlayoffsTable = createGetPlayoffsTableByTournamentId({
        retrieveTournamentById: service.retrieveTournamentById,
        orderMatchesFromTournamentById: service.orderMatchesFromTournamentById,
        retrievePlayinMatchesByTournamentId:
            service.retrievePlayinMatchesByTournamentId,
    })
    const getSummary = createGetTournamentSummaryByTournamentId({
        retrieveTournamentById: service.retrieveTournamentById,
        retrieveAllPlayedMatchesByTournamentId:
            service.retrieveAllPlayedMatchesByTournamentId,
    })

    return {
        statisticsGlobal: await run(getStatistics, {}),
        statisticsTournamentL: await run(getStatistics, {
            query: { tournament: IDS.L },
        }),
        allTimeTeams: await run(getAllTimeTeams, {}),
        allTimeFaceToFace: await run(getAllTimeFaceToFace, {}),
        standingsL: await run(getStandings, { params: { tournament: IDS.L } }),
        standingsG: await run(getStandings, { params: { tournament: IDS.G } }),
        standingsGGroupA: await run(getStandings, {
            params: { tournament: IDS.G },
            query: { group: "A" },
        }),
        playoffsTableG: await run(getPlayoffsTable, {
            params: { tournament: IDS.G },
        }),
        summaryL: await run(getSummary, { params: { tournament: IDS.L } }),
        tournamentsLegacyFalse: serialize(await findTournaments(false)),
        tournamentsFinalized: serialize(
            await findTournaments(undefined, "finalized")
        ),
        tournamentsActive: serialize(
            await findTournaments(undefined, "active")
        ),
        tournamentsAll: serialize(await findTournaments(undefined)),
    }
}

// --- Cambios intencionales ---------------------------------------------------

const TOURNAMENT_LISTS = {
    tournamentsLegacyFalse: "desc",
    tournamentsFinalized: "asc",
    tournamentsActive: "desc",
    tournamentsAll: "desc",
}

const STANDINGS_KEYS = ["standingsL", "standingsG", "standingsGGroupA"]

const toTime = (value) => (value == null ? null : new Date(value).getTime())

// Orden de torneos: sin `startedAt` cuenta como el más nuevo; desempate por
// `_id` desc.
const byStartedAt = (direction) => (a, b) => {
    const timeA = toTime(a.startedAt)
    const timeB = toTime(b.startedAt)
    if (timeA !== timeB) {
        if (timeA === null) return direction === "asc" ? 1 : -1
        if (timeB === null) return direction === "asc" ? -1 : 1
        return direction === "asc" ? timeA - timeB : timeB - timeA
    }
    if (a._id === b._id) return 0
    return a._id < b._id ? 1 : -1
}

const applyIntendedChanges = (baseline) => {
    const expected = structuredClone(baseline)
    if (!CLEANUP_APPLIED) return expected

    // (a) `streak[].date` (texto del server) sale de /standings/table.
    for (const key of STANDINGS_KEYS) {
        for (const group of expected[key].standings) {
            for (const row of group.teams) {
                for (const item of row.streak) delete item.date
            }
        }
    }

    // (b) `matches.recent[].updatedAt` sale de /summary.
    for (const match of expected.summaryL.matches.recent) {
        delete match.updatedAt
    }

    // (c) listas de torneos sin `createdAt`/`updatedAt`, ordenadas por `startedAt`.
    for (const [key, direction] of Object.entries(TOURNAMENT_LISTS)) {
        for (const tournament of expected[key]) {
            delete tournament.createdAt
            delete tournament.updatedAt
        }
        expected[key].sort(byStartedAt(direction))
    }

    return expected
}

test("post-migration outputs match the baseline", async (t) => {
    installModelStubs(t, createDataset())
    const snapshot = await captureSnapshot()

    if (process.env.UPDATE_BASELINE === "1") {
        fs.writeFileSync(
            BASELINE_PATH,
            `${JSON.stringify(snapshot, null, 4)}\n`,
            "utf8"
        )
        return
    }

    const expected = applyIntendedChanges(
        JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"))
    )
    assert.deepStrictEqual(Object.keys(snapshot), Object.keys(expected))
    for (const key of Object.keys(expected)) {
        await t.test(key, () => {
            assert.deepStrictEqual(snapshot[key], expected[key])
        })
    }
})

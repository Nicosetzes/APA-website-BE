"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const mongoose = require("mongoose")

const { createGetMatches } = require("../controller/getMatches")
const findRatingChangesByMatchIds = require("../dao/findRatingChangesByMatchIds")
const {
    createRetrieveRatingChanges,
    roundPoints,
} = require("../service/ratingsReadModel/createRetrieveRatingChanges")
const {
    decorateMatchesWithRatingChange,
} = require("../service/ratingsReadModel/decorateMatchesWithRatingChange")
const {
    FINGERPRINT,
    leanPlayers,
    objectId,
    storedDocsFrom,
    syntheticHistory,
} = require("./fixtures/ratingsReadModel")

const VERSION = "2.0"
const SOURCE_STATS = {
    ratedMatches: 20,
    maxUpdatedAt: new Date("2026-02-20T12:00:00Z"),
}

// Proyección de `findRatingChangesByMatchIds`; `matchId` vuelve como ObjectId.
const leanChanges = (events) =>
    events.map((event) => ({
        matchId: new mongoose.Types.ObjectId(String(event.matchId)),
        delta: event.delta,
        fingerprint: event.fingerprint,
    }))

const setup = ({ sourceStats = SOURCE_STATS } = {}) => {
    const docs = storedDocsFrom(syntheticHistory())
    const calls = []
    const retrieve = createRetrieveRatingChanges({
        findRatingSourceStats: async () => {
            calls.push("findRatingSourceStats")
            return sourceStats
        },
        findPlayerRatings: async (version) => {
            calls.push("findPlayerRatings")
            return leanPlayers(docs).filter(
                (player) => player.ratingVersion === version
            )
        },
        findRatingChangesByMatchIds: async (version, ids) => {
            calls.push("findRatingChangesByMatchIds")
            const wanted = new Set(ids.map(String))
            return leanChanges(
                docs.events.filter(
                    (event) =>
                        event.ratingVersion === version &&
                        wanted.has(String(event.matchId))
                )
            )
        },
        getCurrentFingerprint: () => FINGERPRINT,
    })
    const matchIds = docs.events.map((event) => String(event.matchId))
    return { docs, calls, retrieve, matchIds }
}

// ---------------------------------------------------------------------------
// roundPoints
// ---------------------------------------------------------------------------

test("roundPoints redondea a 2 decimales y nunca devuelve -0", () => {
    assert.equal(roundPoints(4.3249), 4.32)
    assert.equal(roundPoints(-4.326), -4.33)
    assert.ok(Object.is(roundPoints(0.001), 0))
    assert.ok(Object.is(roundPoints(-0.001), 0))
    assert.ok(Object.is(roundPoints(-0), 0))
})

// ---------------------------------------------------------------------------
// Retriever
// ---------------------------------------------------------------------------

test("retriever: lo guardado fresco devuelve el delta de cada partido con p2 = -p1", async () => {
    const { docs, retrieve, matchIds } = setup()
    const result = await retrieve({ matchIds })

    assert.deepEqual(Object.keys(result), ["changes"])
    assert.equal(result.changes.size, docs.events.length)
    for (const event of docs.events) {
        const change = result.changes.get(String(event.matchId))
        assert.equal(change.p1, roundPoints(event.delta))
        assert.equal(change.p2, change.p1 === 0 ? 0 : -change.p1)
        assert.equal(change.ratingVersion, VERSION)
        assert.ok(!Object.is(change.p2, -0))
    }
})

test("retriever: sin ids no lee nada", async () => {
    const { calls, retrieve } = setup()
    for (const args of [{ matchIds: [] }, {}, undefined]) {
        const result = await retrieve(args)
        assert.equal(result.changes.size, 0)
    }
    assert.deepEqual(calls, [])
})

test("retriever: las tres lecturas arrancan antes de que termine ninguna", async () => {
    const docs = storedDocsFrom(syntheticHistory())
    let started = 0
    let release
    const allStarted = new Promise((resolve) => {
        release = resolve
    })
    const gated =
        (read) =>
        async (...args) => {
            started += 1
            if (started === 3) release()
            await allStarted
            return read(...args)
        }
    const retrieve = createRetrieveRatingChanges({
        findRatingSourceStats: gated(async () => SOURCE_STATS),
        findPlayerRatings: gated(async () => leanPlayers(docs)),
        findRatingChangesByMatchIds: gated(async () =>
            leanChanges(docs.events)
        ),
        getCurrentFingerprint: () => FINGERPRINT,
    })
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("lecturas en serie")), 1000).unref()
    )

    const result = await Promise.race([
        retrieve({ matchIds: docs.events.map((e) => String(e.matchId)) }),
        timeout,
    ])

    assert.ok(result.changes)
    assert.equal(started, 3)
})

test("retriever: cada razón stale devuelve { stale } y no lanza", async () => {
    const cases = [
        ["no_players", (docs) => (docs.players = [])],
        [
            "inconsistent_players",
            (docs) => (docs.players[0].fingerprint = "1".repeat(64)),
        ],
        [
            "fingerprint_mismatch",
            (docs) => {
                for (const player of docs.players) {
                    player.fingerprint = "1".repeat(64)
                }
            },
        ],
        [
            "missing_source",
            (docs) => {
                delete docs.players[0].source
            },
        ],
        [
            "stale_count",
            (docs) => {
                for (const player of docs.players) {
                    player.source.ratedMatches += 1
                }
            },
        ],
        [
            "stale_updated_at",
            (docs) => {
                for (const player of docs.players) {
                    player.source.maxUpdatedAt = new Date(
                        "2020-01-01T00:00:00Z"
                    )
                }
            },
        ],
    ]
    for (const [reason, change] of cases) {
        const { docs, retrieve, matchIds } = setup()
        change(docs)
        assert.deepEqual(
            await retrieve({ matchIds }),
            { stale: reason },
            reason
        )
    }
})

test("retriever: la huella actual distinta o un evento con otra huella es stale", async () => {
    const current = setup()
    const retrieveOther = createRetrieveRatingChanges({
        findRatingSourceStats: async () => SOURCE_STATS,
        findPlayerRatings: async () => leanPlayers(current.docs),
        findRatingChangesByMatchIds: async () =>
            leanChanges(current.docs.events),
        getCurrentFingerprint: () => "0".repeat(64),
    })
    assert.deepEqual(await retrieveOther({ matchIds: current.matchIds }), {
        stale: "fingerprint_mismatch",
    })

    const { docs, retrieve, matchIds } = setup()
    docs.events[3].fingerprint = "1".repeat(64)
    assert.deepEqual(await retrieve({ matchIds }), {
        stale: "fingerprint_mismatch",
    })
})

test("retriever: un partido sin evento no vuelve nula toda la página", async () => {
    const { docs, retrieve, matchIds } = setup()
    const missing = docs.events.pop()

    const result = await retrieve({ matchIds })

    assert.ok(result.changes)
    assert.equal(result.changes.has(String(missing.matchId)), false)
    assert.equal(result.changes.size, docs.events.length)
})

test("retriever: ignora eventos con delta inválido", async () => {
    const { docs, retrieve, matchIds } = setup()
    docs.events[0].delta = "x"
    docs.events[1].delta = Number.NaN

    const result = await retrieve({ matchIds })

    assert.equal(result.changes.has(String(docs.events[0].matchId)), false)
    assert.equal(result.changes.has(String(docs.events[1].matchId)), false)
    assert.equal(result.changes.size, docs.events.length - 2)
})

test("retriever: los errores de los DAOs se propagan", async () => {
    for (const failing of [
        "findRatingSourceStats",
        "findPlayerRatings",
        "findRatingChangesByMatchIds",
    ]) {
        const docs = storedDocsFrom(syntheticHistory())
        const daos = {
            findRatingSourceStats: async () => SOURCE_STATS,
            findPlayerRatings: async () => leanPlayers(docs),
            findRatingChangesByMatchIds: async () => leanChanges(docs.events),
            getCurrentFingerprint: () => FINGERPRINT,
        }
        daos[failing] = async () => {
            throw new Error(`falla ${failing}`)
        }
        const retrieve = createRetrieveRatingChanges(daos)
        await assert.rejects(
            retrieve({ matchIds: docs.events.map((e) => String(e.matchId)) }),
            new RegExp(failing)
        )
    }
})

test("retriever: exige todas las dependencias", () => {
    assert.throws(() => createRetrieveRatingChanges(), TypeError)
    assert.throws(
        () =>
            createRetrieveRatingChanges({
                findRatingSourceStats: async () => ({}),
            }),
        /findPlayerRatings/
    )
})

// ---------------------------------------------------------------------------
// DAO
// ---------------------------------------------------------------------------

test("findRatingChangesByMatchIds: filtro, proyección mínima y .lean()", async () => {
    const calls = []
    const model = {
        find: (...args) => {
            calls.push(args)
            return { lean: async () => [{ matchId: "x", delta: 1 }] }
        },
    }
    const ids = [objectId(1).toHexString(), objectId(2).toHexString()]

    const result = await findRatingChangesByMatchIds(VERSION, ids, { model })

    assert.deepEqual(result, [{ matchId: "x", delta: 1 }])
    assert.equal(calls.length, 1)
    assert.equal(calls[0][0].ratingVersion, VERSION)
    assert.equal(calls[0][0].matchId.$in.length, 2)
    assert.ok(
        calls[0][0].matchId.$in.every(
            (id) => id instanceof mongoose.Types.ObjectId
        )
    )
    assert.equal(calls[0][1], "matchId delta fingerprint -_id")
})

test("findRatingChangesByMatchIds: sin ids válidos no consulta y sin versión lanza", async () => {
    const model = {
        find: () => {
            throw new Error("no debería consultar")
        },
    }
    for (const ids of [[], ["no-es-un-id", 5, null], undefined]) {
        assert.deepEqual(
            await findRatingChangesByMatchIds(VERSION, ids, { model }),
            []
        )
    }
    await assert.rejects(
        findRatingChangesByMatchIds("", [objectId(1)], { model }),
        /ratingVersion/
    )
})

// ---------------------------------------------------------------------------
// Decorator
// ---------------------------------------------------------------------------

const player = (id) => ({ id, name: id.toUpperCase() })
const page = () => [
    {
        _id: objectId(101),
        played: true,
        playerP1: player("a"),
        playerP2: player("b"),
        scoreP1: 2,
        scoreP2: 0,
        extra: "se conserva",
    },
    {
        _id: objectId(102),
        played: false,
        playerP1: player("a"),
        playerP2: player("b"),
    },
    {
        _id: objectId(103),
        played: true,
        valid: false,
        playerP1: player("a"),
        playerP2: player("b"),
        scoreP1: 1,
        scoreP2: 0,
    },
    {
        _id: objectId(104),
        played: true,
        playerP1: player("a"),
        playerP2: player("a"),
        scoreP1: 1,
        scoreP2: 0,
    },
    {
        _id: objectId(105),
        played: true,
        playerP1: player("b"),
        playerP2: player("c"),
        scoreP1: 1,
        scoreP2: 1,
    },
]
const CHANGES = new Map([
    [String(objectId(101)), { p1: 4.32, p2: -4.32, ratingVersion: VERSION }],
])

const makeLogger = () => {
    const logs = []
    return {
        logs,
        info: (event, data) => logs.push({ level: "info", event, ...data }),
        warn: (event, data) => logs.push({ level: "warn", event, ...data }),
    }
}

test("decorator: agrega ratingChange donde hay evento y null donde no, conservando el resto", async () => {
    const logger = makeLogger()
    const requested = []
    const payload = {
        matches: page(),
        totalMatches: 5,
        totalPages: 1,
        currentPage: 1,
    }

    const result = await decorateMatchesWithRatingChange({
        payload,
        retrieveRatingChanges: async ({ matchIds }) => {
            requested.push(matchIds)
            return { changes: CHANGES }
        },
        logger,
    })

    assert.equal(result.totalMatches, 5)
    assert.equal(result.totalPages, 1)
    assert.equal(result.currentPage, 1)
    assert.deepEqual(
        result.matches.map((match) => match.ratingChange),
        [CHANGES.get(String(objectId(101))), null, null, null, null]
    )
    // Los demás campos de cada partido quedan como estaban.
    assert.equal(result.matches[0].extra, "se conserva")
    assert.deepEqual(
        { ...result.matches[0], ratingChange: undefined },
        { ...page()[0], ratingChange: undefined }
    )
    // Solo se piden los partidos que pueden tener evento (jugados, válidos y con
    // dos jugadores distintos).
    assert.deepEqual(requested, [
        [String(objectId(101)), String(objectId(105))],
    ])
    assert.deepEqual(logger.logs, [
        {
            level: "info",
            event: "matches_rating_change",
            source: "stored",
            reason: "ok",
            matches: 5,
            durationMs: logger.logs[0].durationMs,
        },
    ])
})

test("decorator: usa toJSON de los documentos de Mongoose", async () => {
    const documents = page().map((raw) => ({
        toJSON: () => ({ ...raw, desdeToJSON: true }),
    }))

    const result = await decorateMatchesWithRatingChange({
        payload: { matches: documents, totalMatches: 5 },
        retrieveRatingChanges: async () => ({ changes: CHANGES }),
        logger: makeLogger(),
    })

    assert.ok(result.matches.every((match) => match.desdeToJSON === true))
    assert.deepEqual(result.matches[0].ratingChange, {
        p1: 4.32,
        p2: -4.32,
        ratingVersion: VERSION,
    })
})

test("decorator: lo guardado stale deja la columna en null en toda la página", async () => {
    const logger = makeLogger()

    const result = await decorateMatchesWithRatingChange({
        payload: { matches: page() },
        retrieveRatingChanges: async () => ({ stale: "stale_count" }),
        logger,
    })

    assert.ok(result.matches.every((match) => match.ratingChange === null))
    assert.equal(result.matches.length, 5)
    assert.equal(logger.logs[0].source, "none")
    assert.equal(logger.logs[0].reason, "stale_count")
})

test("decorator: con el interruptor apagado no lee nada", async () => {
    let reads = 0
    const logger = makeLogger()

    const result = await decorateMatchesWithRatingChange({
        payload: { matches: page() },
        retrieveRatingChanges: async () => {
            reads += 1
            return { changes: CHANGES }
        },
        readModelEnabled: () => false,
        logger,
    })

    assert.equal(reads, 0)
    assert.ok(result.matches.every((match) => match.ratingChange === null))
    assert.equal(logger.logs[0].reason, "disabled")
})

test("decorator: si la lectura falla, la página sale completa con ratingChange null", async () => {
    const logger = makeLogger()
    const original = page()

    const result = await decorateMatchesWithRatingChange({
        payload: { matches: original, totalMatches: 5 },
        retrieveRatingChanges: async () => {
            throw new Error("falla de red con mongodb://u:p@h")
        },
        logger,
    })

    assert.equal(result.totalMatches, 5)
    assert.equal(result.matches.length, 5)
    assert.ok(result.matches.every((match) => match.ratingChange === null))
    assert.equal(logger.logs[0].level, "warn")
    assert.equal(logger.logs[0].reason, "error")
    // Solo el nombre del error, nunca el mensaje (puede traer la URI).
    assert.equal(logger.logs[0].errorName, "Error")
    assert.ok(!JSON.stringify(logger.logs).includes("mongodb://"))
})

test("decorator: un logger que falla no rompe la respuesta", async () => {
    const result = await decorateMatchesWithRatingChange({
        payload: { matches: page() },
        retrieveRatingChanges: async () => ({ changes: CHANGES }),
        logger: {
            info: () => {
                throw new Error("log roto")
            },
        },
    })

    assert.equal(result.matches[0].ratingChange.p1, 4.32)
})

test("decorator: sin partidos o con una forma inesperada devuelve el mismo payload", async () => {
    for (const payload of [
        { matches: [], totalMatches: 0 },
        { totalMatches: 0 },
        null,
        undefined,
    ]) {
        const result = await decorateMatchesWithRatingChange({
            payload,
            retrieveRatingChanges: async () => {
                throw new Error("no debería leer")
            },
            logger: makeLogger(),
        })
        assert.equal(result, payload)
    }
})

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

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
})

test("controller: sin inyectar retrieveRatingChanges con retrieveMatches falso, la respuesta no cambia ni toca la base", async () => {
    const payload = { matches: page(), totalMatches: 5, totalPages: 1 }
    const response = createResponse()

    await createGetMatches({ retrieveMatches: async () => payload })(
        { query: {} },
        response
    )

    assert.equal(response.statusCode, 200)
    assert.equal(response.body, payload)
    assert.ok(
        response.body.matches.every((match) => !("ratingChange" in match))
    )
})

test("controller: con retrieveRatingChanges inyectado decora la página", async () => {
    const response = createResponse()

    await createGetMatches({
        retrieveMatches: async () => ({
            matches: page(),
            totalMatches: 5,
            totalPages: 1,
            currentPage: 1,
        }),
        retrieveRatingChanges: async () => ({ changes: CHANGES }),
        logger: makeLogger(),
    })({ query: {} }, response)

    assert.equal(response.statusCode, 200)
    assert.equal(response.body.currentPage, 1)
    assert.equal(response.body.matches[0].ratingChange.p1, 4.32)
    assert.equal(response.body.matches[1].ratingChange, null)
})

test("controller: una falla del lector de ratings no cambia el estado 200", async () => {
    const response = createResponse()

    await createGetMatches({
        retrieveMatches: async () => ({ matches: page(), totalMatches: 5 }),
        retrieveRatingChanges: async () => {
            throw new Error("boom")
        },
        logger: makeLogger(),
    })({ query: {} }, response)

    assert.equal(response.statusCode, 200)
    assert.equal(response.body.matches.length, 5)
    assert.ok(
        response.body.matches.every((match) => match.ratingChange === null)
    )
})

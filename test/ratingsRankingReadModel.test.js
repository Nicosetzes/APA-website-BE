"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const { createGetRatings } = require("../controller/getRatings")
const findRankingPlayerRatings = require("../dao/findRankingPlayerRatings")
const {
    createRetrieveStoredRanking,
} = require("../service/ratingsReadModel/createRetrieveStoredRanking")
const {
    FINGERPRINT,
    leanPlayers,
    storedDocsFrom,
    syntheticHistory,
} = require("./fixtures/ratingsReadModel")

const VERSION = "2.0"
const SOURCE_STATS = {
    ratedMatches: 20,
    maxUpdatedAt: new Date("2026-02-20T12:00:00Z"),
}

// Proyección de `findRankingPlayerRatings`: todo lo que muestra el ranking.
const leanRanking = (docs) =>
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

const USERS = [
    { id: "a", nickname: "Ana (nick)" },
    { id: "b", nickname: "Beto" },
]

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

const setup = ({ docs = storedDocsFrom(syntheticHistory()) } = {}) => {
    const calls = []
    const retrieve = createRetrieveStoredRanking({
        findRatingSourceStats: async () => {
            calls.push("findRatingSourceStats")
            return SOURCE_STATS
        },
        findRankingPlayerRatings: async (version) => {
            calls.push("findRankingPlayerRatings")
            return leanRanking(docs).filter((p) => p.ratingVersion === version)
        },
        getCurrentFingerprint: () => FINGERPRINT,
    })
    return { docs, calls, retrieve }
}

// ---------------------------------------------------------------------------
// Retriever
// ---------------------------------------------------------------------------

test("retriever: lo guardado fresco devuelve el estado de cada jugador", async () => {
    const { docs, retrieve } = setup()
    const result = await retrieve()

    assert.deepEqual(Object.keys(result), ["players"])
    assert.equal(result.players.size, docs.players.length)
    for (const doc of docs.players) {
        const state = result.players.get(doc.id)
        assert.equal(state.name, doc.name)
        assert.equal(state.rating, doc.rating)
        assert.equal(state.peak, doc.peak)
        assert.equal(state.matches, doc.matches)
        assert.equal(state.wins, doc.wins)
        assert.equal(state.draws, doc.draws)
        assert.equal(state.losses, doc.losses)
        assert.equal(state.lastChange, doc.lastChange)
        // El motor trabaja con milisegundos.
        assert.equal(state.lastPlayedAt, doc.lastPlayedAt.getTime())
    }
})

test("retriever: las dos lecturas arrancan antes de que termine ninguna", async () => {
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
            if (started === 2) release()
            await allStarted
            return read(...args)
        }
    const retrieve = createRetrieveStoredRanking({
        findRatingSourceStats: gated(async () => SOURCE_STATS),
        findRankingPlayerRatings: gated(async () => leanRanking(docs)),
        getCurrentFingerprint: () => FINGERPRINT,
    })
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("lecturas en serie")), 1000).unref()
    )

    const result = await Promise.race([retrieve(), timeout])

    assert.ok(result.players)
    assert.equal(started, 2)
})

test("retriever: cada razón stale devuelve { stale } y no lanza", async () => {
    const cases = [
        ["no_players", (docs) => (docs.players = [])],
        [
            "inconsistent_players",
            (docs) => (docs.players[0].fingerprint = "1".repeat(64)),
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
        const { docs, retrieve } = setup()
        change(docs)
        assert.deepEqual(await retrieve(), { stale: reason }, reason)
    }
})

test("retriever: datos guardados malformados lanzan", async () => {
    const breakers = [
        (docs) => (docs.players[0].rating = "x"),
        (docs) => (docs.players[0].peak = Number.NaN),
        (docs) => (docs.players[0].matches = -1),
        (docs) => (docs.players[0].wins = 1.5),
        (docs) => (docs.players[0].name = null),
        (docs) => (docs.players[0].lastPlayedAt = "ayer"),
        (docs) => (docs.players[0].lastChange = "x"),
    ]
    for (const breakIt of breakers) {
        const { docs, retrieve } = setup()
        breakIt(docs)
        await assert.rejects(retrieve(), /createRetrieveStoredRanking/)
    }
})

test("retriever: lastPlayedAt y lastChange ausentes pasan a null", async () => {
    const { docs, retrieve } = setup()
    docs.players[0].lastPlayedAt = null
    delete docs.players[0].lastChange

    const state = (await retrieve()).players.get(docs.players[0].id)

    assert.equal(state.lastPlayedAt, null)
    assert.equal(state.lastChange, null)
})

test("retriever: los errores de los DAOs se propagan y exige dependencias", async () => {
    const docs = storedDocsFrom(syntheticHistory())
    for (const failing of [
        "findRatingSourceStats",
        "findRankingPlayerRatings",
    ]) {
        const daos = {
            findRatingSourceStats: async () => SOURCE_STATS,
            findRankingPlayerRatings: async () => leanRanking(docs),
            getCurrentFingerprint: () => FINGERPRINT,
        }
        daos[failing] = async () => {
            throw new Error(`falla ${failing}`)
        }
        await assert.rejects(
            createRetrieveStoredRanking(daos)(),
            new RegExp(failing)
        )
    }
    assert.throws(() => createRetrieveStoredRanking(), TypeError)
})

// ---------------------------------------------------------------------------
// DAO
// ---------------------------------------------------------------------------

test("findRankingPlayerRatings: filtro por versión, proyección completa y .lean()", async () => {
    const calls = []
    const model = {
        find: (...args) => {
            calls.push(args)
            return { lean: async () => [{ id: "a" }] }
        },
    }

    const result = await findRankingPlayerRatings(VERSION, { model })

    assert.deepEqual(result, [{ id: "a" }])
    assert.deepEqual(calls[0][0], { ratingVersion: VERSION })
    const fields = calls[0][1].split(" ")
    for (const field of [
        "id",
        "name",
        "rating",
        "peak",
        "matches",
        "wins",
        "draws",
        "losses",
        "lastPlayedAt",
        "lastChange",
        "fingerprint",
        "source",
        "-_id",
    ]) {
        assert.ok(fields.includes(field), field)
    }
    await assert.rejects(
        findRankingPlayerRatings("", { model }),
        /ratingVersion/
    )
})

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

// Respuesta en vivo y respuesta desde lo guardado para la MISMA historia.
const bothResponses = async (overrides = {}) => {
    const matches = syntheticHistory()
    const docs = storedDocsFrom(matches)
    const stored = createRetrieveStoredRanking({
        findRatingSourceStats: async () => SOURCE_STATS,
        findRankingPlayerRatings: async () => leanRanking(docs),
        getCurrentFingerprint: () => FINGERPRINT,
    })

    const live = createResponse()
    await createGetRatings({
        retrieveAllMatches: async () => matches,
        retrieveAllUsers: async () => USERS,
    })({ query: {} }, live)

    let liveReads = 0
    const fromStored = createResponse()
    const logger = makeLogger()
    await createGetRatings({
        retrieveAllMatches: async () => {
            liveReads += 1
            return matches
        },
        retrieveAllUsers: async () => USERS,
        retrieveStoredRanking: stored,
        readModelEnabled: () => true,
        logger,
        ...overrides,
    })({ query: {} }, fromStored)

    return { live: live.body, stored: fromStored.body, liveReads, logger }
}

test("controller: el ranking guardado es idéntico al calculado en vivo y no lee el historial", async () => {
    const { live, stored, liveReads, logger } = await bothResponses()

    assert.deepEqual(stored, live)
    assert.ok(stored.data.length >= 3)
    assert.equal(liveReads, 0)
    assert.deepEqual(logger.logs, [
        {
            level: "info",
            event: "rating_read_model",
            endpoint: "ratings",
            source: "stored",
            reason: "ok",
            players: stored.data.length,
            durationMs: logger.logs[0].durationMs,
        },
    ])
    // Los apodos de los usuarios se siguen usando.
    assert.ok(stored.data.some((row) => row.player.name === "Ana (nick)"))
})

test("controller: si lo guardado está viejo calcula en vivo con el mismo resultado", async () => {
    const { live, stored, liveReads, logger } = await bothResponses({
        retrieveStoredRanking: async () => ({ stale: "stale_count" }),
    })

    assert.deepEqual(stored, live)
    assert.equal(liveReads, 1)
    assert.equal(logger.logs[0].source, "live")
    assert.equal(logger.logs[0].reason, "stale_count")
})

test("controller: si el lector falla o responde mal cae a en vivo y registra el error sin mensaje", async () => {
    for (const retrieveStoredRanking of [
        async () => {
            throw new Error("falla con mongodb://u:p@h")
        },
        async () => ({}),
        async () => null,
    ]) {
        const { live, stored, liveReads, logger } = await bothResponses({
            retrieveStoredRanking,
        })
        assert.deepEqual(stored, live)
        assert.equal(liveReads, 1)
        assert.equal(logger.logs[0].level, "warn")
        assert.equal(logger.logs[0].reason, "error")
        assert.ok(!JSON.stringify(logger.logs).includes("mongodb://"))
    }
})

test("controller: con el interruptor apagado no consulta lo guardado", async () => {
    let storedReads = 0
    const { live, stored, liveReads, logger } = await bothResponses({
        retrieveStoredRanking: async () => {
            storedReads += 1
            return { stale: "x" }
        },
        readModelEnabled: () => false,
    })

    assert.deepEqual(stored, live)
    assert.equal(storedReads, 0)
    assert.equal(liveReads, 1)
    assert.equal(logger.logs[0].reason, "disabled")
})

test("controller: sin lector guardado (solo retrieveAllMatches) no loguea ni toca la base", async () => {
    const logger = makeLogger()
    const response = createResponse()

    await createGetRatings({
        retrieveAllMatches: async () => syntheticHistory(),
        retrieveAllUsers: async () => USERS,
        logger,
    })({ query: {} }, response)

    assert.equal(response.body.success, true)
    assert.deepEqual(logger.logs, [])
})

test("controller: un logger roto no rompe la respuesta", async () => {
    const { live, stored } = await bothResponses({
        logger: {
            info: () => {
                throw new Error("log roto")
            },
        },
    })

    assert.deepEqual(stored, live)
})

test("controller: la lectura de usuarios se sigue haciendo y sus errores se propagan", async () => {
    await assert.rejects(
        createGetRatings({
            retrieveStoredRanking: async () => ({ players: new Map() }),
            retrieveAllUsers: async () => {
                throw new Error("sin usuarios")
            },
            logger: makeLogger(),
            readModelEnabled: () => true,
        })({ query: {} }, createResponse()),
        /sin usuarios/
    )
})

test("fixtures: leanPlayers sigue siendo compatible (guarda de los tests del read-model)", () => {
    const docs = storedDocsFrom(syntheticHistory())
    assert.equal(leanPlayers(docs).length, docs.players.length)
})

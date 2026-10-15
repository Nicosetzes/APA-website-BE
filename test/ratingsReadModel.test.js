"use strict"
const assert = require("node:assert/strict")
const test = require("node:test")
const mongoose = require("mongoose")
const {
    isReadModelEnabled,
    parseReadModelEnabled,
} = require("../config/ratingReadModel")
const { RATING_CONFIG } = require("../config/ratings")
const dao = require("../dao")
const findPlayerRatings = require("../dao/findPlayerRatings")
const findRatingEventsByMatchIds = require("../dao/findRatingEventsByMatchIds")
const { defaultTeamStrength } = require("../service/playerRatings/teamStrength")
const {
    buildStoredPredictionIndex,
    createRetrieveStoredPredictionIndex,
} = require("../service/ratingsReadModel")
const {
    FINGERPRINT,
    SOURCE_STATS,
    fakeReadDaos,
    leanEvents,
    leanPlayers,
    objectId,
    storedDocsFrom,
    syntheticHistory,
} = require("./fixtures/ratingsReadModel")

const VERSION = RATING_CONFIG.version

// ---------------------------------------------------------------------------
// Kill switch
// ---------------------------------------------------------------------------

test("parseReadModelEnabled: solo off / 0 / false apagan (trim, sin mayúsculas)", () => {
    const off = [
        "off",
        "OFF",
        " Off ",
        "0",
        " 0 ",
        "false",
        "FALSE",
        " False\n",
    ]
    for (const value of off) {
        assert.equal(parseReadModelEnabled(value), false, JSON.stringify(value))
    }
    const on = [
        undefined,
        null,
        "",
        "   ",
        "on",
        "1",
        "true",
        "garbage",
        "offf",
        "no",
        "00",
        0,
        false,
    ]
    for (const value of on) {
        assert.equal(parseReadModelEnabled(value), true, String(value))
    }
})

test("isReadModelEnabled: lee el entorno en cada llamada", () => {
    const env = {}
    assert.equal(isReadModelEnabled(env), true)
    env.RATING_READ_MODEL = "off"
    assert.equal(isReadModelEnabled(env), false)
    env.RATING_READ_MODEL = "true"
    assert.equal(isReadModelEnabled(env), true)
    const previous = process.env.RATING_READ_MODEL
    try {
        process.env.RATING_READ_MODEL = "0"
        assert.equal(isReadModelEnabled(), false)
        delete process.env.RATING_READ_MODEL
        assert.equal(isReadModelEnabled(), true)
    } finally {
        if (previous === undefined) delete process.env.RATING_READ_MODEL
        else process.env.RATING_READ_MODEL = previous
    }
})

// ---------------------------------------------------------------------------
// DAOs de lectura
// ---------------------------------------------------------------------------

// Modelo fake: registra cada `find` y exige `.lean()`.
const fakeModel = (rows = []) => {
    const calls = []
    return {
        calls,
        find(filter, projection) {
            const call = { filter, projection, lean: false }
            calls.push(call)
            return {
                lean: async () => {
                    call.lean = true
                    return rows
                },
            }
        },
    }
}

test("dao/index.js exporta los tres DAOs de lectura nuevos", () => {
    assert.equal(dao.findPlayerRatings, findPlayerRatings)
    assert.equal(dao.findRatingEventsByMatchIds, findRatingEventsByMatchIds)
    assert.equal(typeof dao.findRatingSourceStats, "function")
    assert.equal(dao.applyRatingDiff, undefined)
    assert.equal(dao.findStoredRatingDocuments, undefined)
})

test("findPlayerRatings: filtro y proyección exactos, con .lean()", async () => {
    const rows = [{ id: "a" }]
    const model = fakeModel(rows)
    const result = await findPlayerRatings(VERSION, { model })
    assert.equal(result, rows)
    assert.equal(model.calls.length, 1)
    assert.deepEqual(model.calls[0], {
        filter: { ratingVersion: VERSION },
        projection: "ratingVersion id rating matches fingerprint source -_id",
        lean: true,
    })
})

test("findPlayerRatings: ratingVersion inválida lanza sin consultar", async () => {
    for (const value of [undefined, null, "", "  ", 2]) {
        const model = fakeModel()
        await assert.rejects(
            findPlayerRatings(value, { model }),
            /falta ratingVersion/
        )
        assert.equal(model.calls.length, 0)
    }
})

test("findRatingEventsByMatchIds: filtro y proyección exactos, con .lean()", async () => {
    const rows = [{ matchId: objectId(1) }]
    const model = fakeModel(rows)
    const result = await findRatingEventsByMatchIds(
        VERSION,
        [objectId(1).toHexString()],
        { model }
    )
    assert.equal(result, rows)
    assert.equal(model.calls.length, 1)
    const [call] = model.calls
    assert.equal(
        call.projection,
        "matchId expectedP1 p1.games p1.teamOverall p2.games fingerprint -_id"
    )
    assert.equal(call.lean, true)
    assert.deepEqual(Object.keys(call.filter), ["ratingVersion", "matchId"])
    assert.equal(call.filter.ratingVersion, VERSION)
    assert.deepEqual(Object.keys(call.filter.matchId), ["$in"])
    assert.equal(call.filter.matchId.$in.length, 1)
    assert.ok(call.filter.matchId.$in[0] instanceof mongoose.Types.ObjectId)
    assert.equal(
        call.filter.matchId.$in[0].toHexString(),
        objectId(1).toHexString()
    )
})

test("findRatingEventsByMatchIds: cast seguro (inválidos, mezcla, duplicados, ObjectId)", async () => {
    const hex = objectId(7).toHexString()
    const model = fakeModel()
    await findRatingEventsByMatchIds(
        VERSION,
        [
            hex,
            hex.toUpperCase(),
            objectId(7),
            objectId(8),
            "no-es-un-id",
            "abc",
            12345,
            null,
            undefined,
            {},
            `${hex}0`,
            "zzzzzzzzzzzzzzzzzzzzzzzz",
        ],
        { model }
    )
    assert.equal(model.calls.length, 1)
    const ids = model.calls[0].filter.matchId.$in
    assert.deepEqual(
        ids.map((id) => id.toHexString()).sort(),
        [objectId(7).toHexString(), objectId(8).toHexString()].sort()
    )
})

test("findRatingEventsByMatchIds: sin ids válidos devuelve [] sin consultar", async () => {
    for (const ids of [[], ["x", 3, null], undefined, null, "no-array"]) {
        const model = fakeModel([{ matchId: "no debería leerse" }])
        assert.deepEqual(
            await findRatingEventsByMatchIds(VERSION, ids, { model }),
            []
        )
        assert.equal(model.calls.length, 0)
    }
})

test("findRatingEventsByMatchIds: ratingVersion inválida lanza", async () => {
    const model = fakeModel()
    await assert.rejects(
        findRatingEventsByMatchIds("", [objectId(1)], { model }),
        /falta ratingVersion/
    )
    assert.equal(model.calls.length, 0)
})

// ---------------------------------------------------------------------------
// Adaptador
// ---------------------------------------------------------------------------

const storedParts = () => {
    const docs = storedDocsFrom(syntheticHistory())
    return { docs, players: leanPlayers(docs), events: leanEvents(docs) }
}

test("buildStoredPredictionIndex: forma exacta del índice", () => {
    const { docs, players, events } = storedParts()
    const index = buildStoredPredictionIndex({ players, events })
    assert.deepEqual(Object.keys(index), [
        "eventsByMatchId",
        "snapshot",
        "config",
        "lookup",
    ])
    assert.equal(index.config, RATING_CONFIG)
    assert.equal(index.lookup, defaultTeamStrength)
    assert.ok(index.eventsByMatchId instanceof Map)
    assert.ok(index.snapshot instanceof Map)
    assert.equal(index.eventsByMatchId.size, docs.events.length)
    assert.equal(index.snapshot.size, docs.players.length)
    for (const event of docs.events) {
        const entry = index.eventsByMatchId.get(String(event.matchId))
        assert.deepEqual(entry, {
            expectedP1: event.expectedP1,
            p1: { games: event.p1.games, teamOverall: event.p1.teamOverall },
            p2: { games: event.p2.games },
        })
    }
    for (const player of docs.players) {
        assert.deepEqual(index.snapshot.get(player.id), {
            id: player.id,
            rating: player.rating,
            matches: player.matches,
        })
    }
})

test("buildStoredPredictionIndex: claves de eventos como String(matchId) y snapshot sin ajenos", () => {
    const { players, events } = storedParts()
    const index = buildStoredPredictionIndex({ players, events })
    for (const key of index.eventsByMatchId.keys()) {
        assert.equal(typeof key, "string")
        assert.match(key, /^[0-9a-f]{24}$/)
    }
    assert.equal(index.snapshot.get("desconocido"), undefined)
    assert.deepEqual(
        [...index.snapshot.keys()].sort(),
        players.map((p) => p.id).sort()
    )
})

test("buildStoredPredictionIndex: teamOverall undefined o ausente pasa a null", () => {
    const { players, events } = storedParts()
    const [first, second] = events
    first.p1 = { games: first.p1.games, teamOverall: undefined }
    delete second.p1.teamOverall
    const index = buildStoredPredictionIndex({ players, events })
    assert.equal(
        index.eventsByMatchId.get(String(first.matchId)).p1.teamOverall,
        null
    )
    assert.equal(
        index.eventsByMatchId.get(String(second.matchId)).p1.teamOverall,
        null
    )
    assert.ok(
        [...index.eventsByMatchId.values()].some(
            (event) => event.p1.teamOverall !== null
        ),
        "el historial sintético tiene eventos con término de equipo"
    )
})

test("buildStoredPredictionIndex: datos malformados lanzan en español", () => {
    const mutate = (change) => {
        const parts = storedParts()
        change(parts)
        return () =>
            buildStoredPredictionIndex({
                players: parts.players,
                events: parts.events,
            })
    }
    const cases = [
        [(p) => (p.players[0].ratingVersion = "1.0"), /ratingVersion/],
        [(p) => (p.players[0].id = 7), /id/],
        [(p) => (p.players[0].id = ""), /id/],
        [(p) => (p.players[0].rating = "1500"), /rating/],
        [(p) => (p.players[0].rating = Number.NaN), /rating/],
        [(p) => (p.players[0].matches = 1.5), /matches/],
        [(p) => (p.players[0].matches = -1), /matches/],
        [(p) => delete p.events[0].matchId, /matchId/],
        [(p) => (p.events[0].matchId = null), /matchId/],
        [(p) => (p.events[0].expectedP1 = 1.2), /expectedP1/],
        [(p) => (p.events[0].expectedP1 = -0.1), /expectedP1/],
        [(p) => (p.events[0].expectedP1 = "0.5"), /expectedP1/],
        [(p) => (p.events[0].p1.games = 1.5), /games/],
        [(p) => (p.events[0].p2.games = -1), /games/],
        [(p) => (p.events[0].p2 = undefined), /games/],
        [(p) => (p.events[0].p1.teamOverall = "80"), /teamOverall/],
        [(p) => (p.events[0].p1.teamOverall = Number.NaN), /teamOverall/],
    ]
    for (const [change, pattern] of cases) {
        assert.throws(mutate(change), pattern, String(change))
    }
    assert.throws(
        () => buildStoredPredictionIndex({ players: null, events: [] }),
        /players tiene que ser un arreglo/
    )
    assert.throws(
        () => buildStoredPredictionIndex({ players: [], events: null }),
        /events tiene que ser un arreglo/
    )
})

test("buildStoredPredictionIndex: acepta config y lookup inyectados", () => {
    const config = { ...RATING_CONFIG, version: "9.9" }
    const lookup = () => null
    const index = buildStoredPredictionIndex({
        players: [{ ratingVersion: "9.9", id: "a", rating: 1500, matches: 0 }],
        events: [],
        config,
        lookup,
    })
    assert.equal(index.config, config)
    assert.equal(index.lookup, lookup)
})

// ---------------------------------------------------------------------------
// Retriever
// ---------------------------------------------------------------------------

const setup = ({
    sourceStats = SOURCE_STATS,
    currentFingerprint = FINGERPRINT,
} = {}) => {
    const docs = storedDocsFrom(syntheticHistory())
    const calls = []
    const fingerprintCalls = []
    const retrieve = createRetrieveStoredPredictionIndex({
        ...fakeReadDaos({ docs, sourceStats, calls }),
        getCurrentFingerprint: () => {
            fingerprintCalls.push(1)
            return currentFingerprint
        },
    })
    const matchIds = docs.events.map((event) => event.matchId)
    return { docs, calls, fingerprintCalls, retrieve, matchIds }
}
const daoNames = (calls) => calls.map((call) => call.dao)

test("retriever: lo guardado fresco devuelve { index } con los eventos pedidos", async () => {
    const { docs, calls, retrieve, matchIds } = setup()
    const result = await retrieve({ matchIds })
    assert.deepEqual(Object.keys(result), ["index"])
    assert.equal(result.index.eventsByMatchId.size, docs.events.length)
    assert.equal(result.index.snapshot.size, docs.players.length)
    assert.deepEqual(daoNames(calls).sort(), [
        "findPlayerRatings",
        "findRatingEventsByMatchIds",
        "findRatingSourceStats",
    ])
    const eventsCall = calls.find((c) => c.dao === "findRatingEventsByMatchIds")
    assert.deepEqual(eventsCall.args, [VERSION, matchIds])
    const playersCall = calls.find((c) => c.dao === "findPlayerRatings")
    assert.deepEqual(playersCall.args, [VERSION])
})

test("retriever: sin matchIds no consulta eventos y devuelve el índice", async () => {
    const { calls, retrieve } = setup()
    for (const args of [{ matchIds: [] }, {}, undefined]) {
        calls.length = 0
        const result = await retrieve(args)
        assert.equal(result.index.eventsByMatchId.size, 0)
        assert.ok(result.index.snapshot.size > 0)
        assert.ok(!daoNames(calls).includes("findRatingEventsByMatchIds"))
    }
})

test("retriever: ids repetidos se piden una sola vez", async () => {
    const { calls, retrieve, matchIds } = setup()
    const result = await retrieve({ matchIds: [...matchIds, ...matchIds] })
    assert.ok(result.index)
    const eventsCall = calls.find((c) => c.dao === "findRatingEventsByMatchIds")
    assert.deepEqual(eventsCall.args[1], matchIds)
})

test("retriever: pide la huella actual una vez por llamada", async () => {
    const { fingerprintCalls, retrieve, matchIds } = setup()
    await retrieve({ matchIds })
    assert.equal(fingerprintCalls.length, 1)
    await retrieve({ matchIds })
    assert.equal(fingerprintCalls.length, 2)
})

test("retriever: cada razón stale devuelve { stale } y nunca lanza", async () => {
    const stale = async (change, options) => {
        const ctx = setup(options)
        change(ctx.docs, ctx)
        return {
            ...ctx,
            result: await ctx.retrieve({ matchIds: ctx.matchIds }),
        }
    }
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
        const { result, calls } = await stale(change)
        assert.deepEqual(result, { stale: reason }, reason)
        // Las tres lecturas salen en paralelo: aun siendo stale ya se pidieron
        // todas y el resultado de eventos se descarta.
        assert.deepEqual(
            daoNames(calls).sort(),
            [
                "findPlayerRatings",
                "findRatingEventsByMatchIds",
                "findRatingSourceStats",
            ],
            reason
        )
    }
})

test("retriever: un DAO que devuelve otra ratingVersion es version_mismatch", async () => {
    const docs = storedDocsFrom(syntheticHistory())
    const daos = fakeReadDaos({ docs })
    daos.findPlayerRatings = async () => {
        const players = leanPlayers(docs)
        players[0].ratingVersion = "1.0"
        return players
    }
    const retrieve = createRetrieveStoredPredictionIndex({
        ...daos,
        getCurrentFingerprint: () => FINGERPRINT,
    })
    assert.deepEqual(await retrieve({ matchIds: [] }), {
        stale: "version_mismatch",
    })
})

test("retriever: la huella actual distinta es fingerprint_mismatch", async () => {
    const { retrieve, matchIds, calls } = setup({
        currentFingerprint: "0".repeat(64),
    })
    assert.deepEqual(await retrieve({ matchIds }), {
        stale: "fingerprint_mismatch",
    })
    assert.ok(daoNames(calls).includes("findRatingEventsByMatchIds"))
})

test("retriever: las tres lecturas arrancan antes de que termine ninguna", async () => {
    const docs = storedDocsFrom(syntheticHistory())
    const daos = fakeReadDaos({ docs })
    let started = 0
    let releaseAll
    const allStarted = new Promise((resolve) => {
        releaseAll = resolve
    })
    // Cada lectura espera a que las tres hayan empezado: si el retriever las
    // pidiera de a una, la primera nunca terminaría y el test fallaría por tiempo.
    const gated =
        (name) =>
        async (...args) => {
            started += 1
            if (started === 3) releaseAll()
            await allStarted
            return daos[name](...args)
        }
    const retrieve = createRetrieveStoredPredictionIndex({
        findRatingSourceStats: gated("findRatingSourceStats"),
        findPlayerRatings: gated("findPlayerRatings"),
        findRatingEventsByMatchIds: gated("findRatingEventsByMatchIds"),
        getCurrentFingerprint: () => FINGERPRINT,
    })
    const matchIds = docs.events.map((event) => event.matchId)
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("lecturas en serie")), 1000).unref()
    )

    const result = await Promise.race([retrieve({ matchIds }), timeout])

    assert.ok(result.index)
    assert.equal(started, 3)
})

test("retriever: conteo o maxUpdatedAt actuales distintos son stale", async () => {
    const count = setup({
        sourceStats: { ...SOURCE_STATS, ratedMatches: 21 },
    })
    assert.deepEqual(await count.retrieve({ matchIds: count.matchIds }), {
        stale: "stale_count",
    })
    const updated = setup({
        sourceStats: {
            ratedMatches: 20,
            maxUpdatedAt: new Date("2026-03-05T00:00:00Z"),
        },
    })
    assert.deepEqual(await updated.retrieve({ matchIds: updated.matchIds }), {
        stale: "stale_updated_at",
    })
})

test("retriever: evento con otra huella es fingerprint_mismatch a nivel evento", async () => {
    const { docs, retrieve, matchIds, calls } = setup()
    docs.events[3].fingerprint = "1".repeat(64)
    assert.deepEqual(await retrieve({ matchIds }), {
        stale: "fingerprint_mismatch",
    })
    assert.ok(daoNames(calls).includes("findRatingEventsByMatchIds"))
})

test("retriever: partido pedido sin evento es missing_event", async () => {
    const { docs, retrieve, matchIds } = setup()
    const missing = docs.events.pop()
    assert.deepEqual(await retrieve({ matchIds }), { stale: "missing_event" })
    // Un id que nunca tuvo evento también.
    const ctx = setup()
    assert.deepEqual(
        await ctx.retrieve({
            matchIds: [...ctx.matchIds, objectId(999).toHexString()],
        }),
        { stale: "missing_event" }
    )
    // Pedir solo los que sí existen vuelve a andar.
    const ok = await retrieve({
        matchIds: matchIds.filter((id) => id !== missing.matchId),
    })
    assert.ok(ok.index)
})

test("retriever: los errores de los DAOs se propagan", async () => {
    for (const failing of [
        "findRatingSourceStats",
        "findPlayerRatings",
        "findRatingEventsByMatchIds",
    ]) {
        const docs = storedDocsFrom(syntheticHistory())
        const daos = fakeReadDaos({ docs })
        daos[failing] = async () => {
            throw new Error(`falla ${failing}`)
        }
        const retrieve = createRetrieveStoredPredictionIndex({
            ...daos,
            getCurrentFingerprint: () => FINGERPRINT,
        })
        const matchIds = docs.events.map((event) => event.matchId)
        await assert.rejects(retrieve({ matchIds }), new RegExp(failing))
    }
})

test("retriever: datos guardados malformados lanzan (no se confunden con stale)", async () => {
    const { docs, retrieve, matchIds } = setup()
    docs.events[0].expectedP1 = 7
    await assert.rejects(retrieve({ matchIds }), /expectedP1/)
})

test("createRetrieveStoredPredictionIndex: exige todas las dependencias", () => {
    const base = {
        ...fakeReadDaos({ docs: storedDocsFrom(syntheticHistory()) }),
        getCurrentFingerprint: () => FINGERPRINT,
    }
    for (const name of Object.keys(base)) {
        assert.throws(
            () =>
                createRetrieveStoredPredictionIndex({
                    ...base,
                    [name]: undefined,
                }),
            TypeError,
            name
        )
    }
    assert.throws(() => createRetrieveStoredPredictionIndex(), TypeError)
})

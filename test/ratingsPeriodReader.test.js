"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const { RATING_CONFIG } = require("../config/ratings")
const {
    buildPeriodSnapshots,
    createRetrieveStoredPeriod,
    findChainBreak,
    parseBoundaryRow,
    parsePeriodEvent,
} = require("../service/ratingsReadModel/createRetrieveStoredPeriod")
const {
    toPlayerState,
} = require("../service/ratingsReadModel/createRetrieveStoredRanking")
const { getArgentinaDayRange } = require("../utils/argentinaDay")
const { periodDaos } = require("./fixtures/ratingsPeriod")
const {
    FINGERPRINT,
    storedDocsFrom,
    syntheticHistory,
} = require("./fixtures/ratingsReadModel")

const MALFORMED = /createRetrieveStored(Ranking|Period)/

const range = (dateFrom, dateTo) => ({
    start: getArgentinaDayRange(dateFrom).start.getTime(),
    end: getArgentinaDayRange(dateTo).end.getTime(),
})

// Ventanas sobre `syntheticHistory()` (un partido por día en enero de 2026; Dani
// debuta el 1 de febrero).
const MID = range("2026-01-05", "2026-01-10") // A y B con los tres jugadores
const ALL = range("2025-12-30", "2026-02-04") // todo en A, B vacío
const BEFORE_ALL = range("2025-12-01", "2025-12-05") // A vacío, todo en B
const AFTER_ALL = range("2026-03-01", "2026-03-05") // A y B vacíos
const FEB = range("2026-02-01", "2026-02-02") // Caro no juega desde enero

const setup = (mutate) => {
    const docs = storedDocsFrom(syntheticHistory())
    if (mutate) mutate(docs)
    const calls = []
    const daos = periodDaos(docs, { calls })
    return { docs, calls, daos, retrieve: createRetrieveStoredPeriod(daos) }
}

// Las piezas ya validadas que reciben las funciones puras, leídas con los DAOs
// reales sobre los modelos falsos.
const loadParts = async (window, mutate) => {
    const { docs, daos } = setup(mutate)
    const [players, rawEvents, rawBoundary] = await Promise.all([
        daos.findRankingPlayerRatings(RATING_CONFIG.version),
        daos.findRatingEventsInRange(
            RATING_CONFIG.version,
            new Date(window.start),
            new Date(window.end)
        ),
        daos.findRatingBoundaryEvents(
            RATING_CONFIG.version,
            new Date(window.end)
        ),
    ])
    return {
        docs,
        players: new Map(players.map((doc) => [doc.id, toPlayerState(doc)])),
        periodEvents: rawEvents.map(parsePeriodEvent),
        boundary: new Map(
            rawBoundary.map((row) => {
                const parsed = parseBoundaryRow(row)
                return [parsed.id, parsed]
            })
        ),
    }
}

const sideOf = (event, id) => (event.p1.id === id ? event.p1 : event.p2)
const eventsOf = (parts, id) =>
    parts.periodEvents.filter(
        (event) => event.p1.id === id || event.p2.id === id
    )

// ---------------------------------------------------------------------------
// buildPeriodSnapshots (pura)
// ---------------------------------------------------------------------------

const player = (id, rating, matches, name = id.toUpperCase()) => ({
    id,
    name,
    rating,
    peak: rating,
    matches,
    wins: 0,
    draws: 0,
    losses: 0,
    lastPlayedAt: null,
    lastChange: null,
})

const periodEvent = (seq, p1, p2, delta = 10) => ({
    seq,
    matchId: String(seq),
    time: seq * 1000,
    tournament: null,
    type: null,
    scoreP1: 1,
    scoreP2: 0,
    expectedP1: 0.5,
    resultP1: 1,
    delta,
    p1,
    p2,
})

const side = (id, before, games, name = id.toUpperCase()) => ({
    id,
    name,
    before,
    games,
})

const edge = (
    id,
    first,
    last = { ...first, delta: 0, sign: 1 },
    count = 1
) => ({
    id,
    count,
    first: { seq: 100, name: id.toUpperCase(), ...first },
    last: { seq: 100, ...last },
})

const snapshot = (map, id) => {
    const { name, rating, matches } = map.get(id)
    return { name, rating, matches }
}

test("buildPeriodSnapshots: jugador con eventos en el período y después de end", () => {
    const { previous, current } = buildPeriodSnapshots({
        players: new Map([["x", player("x", 1530, 7)]]),
        periodEvents: [
            periodEvent(1, side("x", 1500, 3), side("y", 1500, 3)),
            periodEvent(2, side("x", 1510, 4), side("y", 1490, 4)),
        ],
        boundary: new Map([
            ["x", edge("x", { before: 1520, games: 5, name: "X tarde" })],
        ]),
    })

    assert.deepEqual(snapshot(previous, "x"), {
        name: "X",
        rating: 1500,
        matches: 3,
    })
    // En end: el primer evento posterior; nombre del último evento del período.
    assert.deepEqual(snapshot(current, "x"), {
        name: "X",
        rating: 1520,
        matches: 5,
    })
})

test("buildPeriodSnapshots: jugador con eventos solo en el período", () => {
    const { previous, current } = buildPeriodSnapshots({
        players: new Map([["x", player("x", 1510, 4)]]),
        periodEvents: [periodEvent(1, side("x", 1500, 3), side("y", 1500, 0))],
        boundary: new Map(),
    })

    assert.equal(previous.get("x").rating, 1500)
    assert.equal(previous.get("x").matches, 3)
    assert.equal(current.get("x").rating, 1510)
    assert.equal(current.get("x").matches, 4)
})

test("buildPeriodSnapshots: jugador con eventos solo después de end", () => {
    const { previous, current } = buildPeriodSnapshots({
        players: new Map([["x", player("x", 1530, 7)]]),
        periodEvents: [],
        boundary: new Map([
            ["x", edge("x", { before: 1520, games: 5, name: "X tarde" })],
        ]),
    })

    for (const map of [previous, current]) {
        assert.equal(map.get("x").rating, 1520)
        assert.equal(map.get("x").matches, 5)
    }
})

test("buildPeriodSnapshots: jugador con eventos solo antes de start usa el estado actual", () => {
    const { previous, current } = buildPeriodSnapshots({
        players: new Map([["x", player("x", 1530, 7, "X actual")]]),
        periodEvents: [],
        boundary: new Map(),
    })

    for (const map of [previous, current]) {
        assert.deepEqual(snapshot(map, "x"), {
            name: "X actual",
            rating: 1530,
            matches: 7,
        })
    }
})

test("buildPeriodSnapshots: el jugador que debuta en el período queda con 0 partidos en start", () => {
    const { previous, current } = buildPeriodSnapshots({
        players: new Map([["x", player("x", 1510, 1)]]),
        periodEvents: [periodEvent(1, side("x", 1500, 0), side("y", 1500, 5))],
        boundary: new Map(),
    })

    assert.equal(previous.get("x").matches, 0)
    assert.equal(previous.get("x").rating, 1500)
    assert.equal(current.get("x").matches, 1)
})

test("buildPeriodSnapshots: el jugador que debuta después de end queda con 0 partidos en start y end", () => {
    const { previous, current } = buildPeriodSnapshots({
        players: new Map([["x", player("x", 1510, 1)]]),
        periodEvents: [],
        boundary: new Map([["x", edge("x", { before: 1500, games: 0 })]]),
    })

    assert.equal(previous.get("x").matches, 0)
    assert.equal(current.get("x").matches, 0)
})

test("buildPeriodSnapshots: nombre en end = último evento del período, o primer evento posterior, o el actual", () => {
    const players = new Map([
        ["a", player("a", 1500, 5, "A actual")],
        ["b", player("b", 1500, 5, "B actual")],
        ["c", player("c", 1500, 5, "C actual")],
    ])
    const periodEvents = [
        periodEvent(
            1,
            side("a", 1500, 1, "A uno"),
            side("c", 1500, 1, "C uno")
        ),
        periodEvent(
            2,
            side("a", 1490, 2, "A dos"),
            side("c", 1510, 2, "C dos")
        ),
    ]
    const boundary = new Map([
        ["a", edge("a", { before: 1480, games: 3, name: "A tarde" })],
        ["b", edge("b", { before: 1480, games: 3, name: "B tarde" })],
    ])

    const { current } = buildPeriodSnapshots({
        players,
        periodEvents,
        boundary,
    })

    // Con eventos en el período y después: gana el del último del período.
    assert.equal(current.get("a").name, "A dos")
    // Sin eventos en el período pero con borde: el del primer evento posterior.
    assert.equal(current.get("b").name, "B tarde")
    // Solo período, sin borde: el del último evento del período.
    assert.equal(current.get("c").name, "C dos")

    const bare = buildPeriodSnapshots({
        players: new Map([["d", player("d", 1500, 5, "D actual")]]),
        periodEvents: [],
        boundary: new Map(),
    })
    assert.equal(bare.current.get("d").name, "D actual")
})

// ---------------------------------------------------------------------------
// findChainBreak (pura)
// ---------------------------------------------------------------------------

test("findChainBreak: datos coherentes no tienen rotura (A y B, solo A, solo B, ninguno)", async () => {
    for (const [label, window] of [
        ["A y B", MID],
        ["solo A", ALL],
        ["solo B", BEFORE_ALL],
        ["ninguno", AFTER_ALL],
    ]) {
        const parts = await loadParts(window)
        assert.equal(findChainBreak(parts), null, label)
    }
    const mid = await loadParts(MID)
    assert.ok(mid.periodEvents.length > 0 && mid.boundary.size > 0)
    const all = await loadParts(ALL)
    assert.ok(all.periodEvents.length > 0 && all.boundary.size === 0)
    const before = await loadParts(BEFORE_ALL)
    assert.ok(before.periodEvents.length === 0 && before.boundary.size > 0)
    const after = await loadParts(AFTER_ALL)
    assert.ok(after.periodEvents.length === 0 && after.boundary.size === 0)
})

test("findChainBreak: cada regla detecta su rotura", async () => {
    const cases = [
        [
            "jugador con eventos que no está en player-ratings",
            MID,
            (parts) => parts.players.delete("a"),
            /no está en player-ratings/,
        ],
        [
            "games que salta dentro de A",
            MID,
            (parts) => (sideOf(eventsOf(parts, "a")[1], "a").games += 1),
            /el período no encadena/,
        ],
        [
            "before que no encadena dentro de A",
            MID,
            (parts) => (sideOf(eventsOf(parts, "a")[1], "a").before += 0.5),
            /el período no encadena/,
        ],
        [
            "empalme A-B con before incorrecto",
            MID,
            (parts) => (parts.boundary.get("a").first.before += 0.5),
            /empalme/,
        ],
        [
            "empalme A-B con games incorrecto",
            MID,
            (parts) => (parts.boundary.get("a").first.games += 1),
            /empalme/,
        ],
        [
            "first.games + count distinto de matches",
            MID,
            (parts) => (parts.boundary.get("a").count -= 1),
            /cola posterior/,
        ],
        [
            "matches guardado distinto",
            MID,
            (parts) => (parts.players.get("a").matches += 1),
            /cola posterior/,
        ],
        [
            "el último evento de B no termina en rating",
            MID,
            (parts) => (parts.boundary.get("a").last.before += 0.5),
            /último evento no termina/,
        ],
        [
            "last.games + 1 distinto de matches",
            MID,
            (parts) => (parts.boundary.get("a").last.games += 1),
            /último evento no termina/,
        ],
        [
            "B solo con rating guardado distinto",
            BEFORE_ALL,
            (parts) => (parts.players.get("a").rating += 0.5),
            /último evento no termina/,
        ],
        [
            "último evento de A (sin B) no termina en el estado guardado",
            ALL,
            (parts) => (parts.players.get("a").rating += 0.5),
            /último evento del período no termina/,
        ],
        [
            "último evento de A (sin B) con matches distinto",
            ALL,
            (parts) => (parts.players.get("a").matches += 1),
            /último evento del período no termina/,
        ],
    ]

    for (const [label, window, mutate, pattern] of cases) {
        const parts = await loadParts(window)
        assert.equal(findChainBreak(parts), null, `base: ${label}`)
        mutate(parts)
        assert.match(String(findChainBreak(parts)), pattern, label)
    }
})

test("findChainBreak: la tolerancia numérica es 1e-9", async () => {
    const within = await loadParts(ALL)
    within.players.get("a").rating += 1e-10
    assert.equal(findChainBreak(within), null)

    const outside = await loadParts(ALL)
    outside.players.get("a").rating += 1e-8
    assert.notEqual(findChainBreak(outside), null)
})

// ---------------------------------------------------------------------------
// Validadores
// ---------------------------------------------------------------------------

const baseRow = async () => {
    const { daos } = setup()
    const [row] = await daos.findRatingEventsInRange(
        RATING_CONFIG.version,
        new Date(MID.start),
        new Date(MID.end)
    )
    return row
}

const copyRow = (row) => ({ ...row, p1: { ...row.p1 }, p2: { ...row.p2 } })

test("parsePeriodEvent: convierte matchId a string, time a milisegundos y tournament/type ausentes a null", async () => {
    const row = await baseRow()
    delete row.tournament
    delete row.type

    const event = parsePeriodEvent(row)

    assert.equal(event.matchId, row.matchId.toHexString())
    assert.match(event.matchId, /^[0-9a-f]{24}$/)
    assert.equal(event.time, row.time.getTime())
    assert.equal(event.tournament, null)
    assert.equal(event.type, null)
    assert.deepEqual(event.p1, {
        id: row.p1.id,
        name: row.p1.name,
        before: row.p1.before,
        games: row.p1.games,
    })
    assert.deepEqual(Object.keys(event).sort(), [
        "delta",
        "expectedP1",
        "matchId",
        "p1",
        "p2",
        "resultP1",
        "scoreP1",
        "scoreP2",
        "seq",
        "time",
        "tournament",
        "type",
    ])
})

test("parsePeriodEvent: lanza con campos malformados", async () => {
    const row = await baseRow()
    const breakers = [
        (r) => (r.seq = Number.NaN),
        (r) => (r.seq = "1"),
        (r) => delete r.matchId,
        (r) => (r.time = null),
        (r) => (r.time = "2026-01-05"),
        (r) => (r.time = new Date("x")),
        (r) => (r.delta = "x"),
        (r) => (r.expectedP1 = undefined),
        (r) => (r.resultP1 = null),
        (r) => (r.scoreP1 = Number.POSITIVE_INFINITY),
        (r) => (r.tournament = 5),
        (r) => (r.p1.id = ""),
        (r) => (r.p1.id = 7),
        (r) => (r.p2.name = null),
        (r) => (r.p1.before = "1500"),
        (r) => (r.p1.games = -1),
        (r) => (r.p2.games = 1.5),
        (r) => (r.p2 = undefined),
    ]
    for (const breakIt of breakers) {
        const copy = copyRow(row)
        breakIt(copy)
        assert.throws(() => parsePeriodEvent(copy), MALFORMED)
    }
    assert.throws(() => parsePeriodEvent(null), MALFORMED)
})

test("parseBoundaryRow: acepta una fila válida y lanza con filas malformadas", async () => {
    const { daos } = setup()
    const [row] = await daos.findRatingBoundaryEvents(
        RATING_CONFIG.version,
        new Date(MID.end)
    )

    const parsed = parseBoundaryRow(row)
    assert.equal(parsed.id, row.id)
    assert.deepEqual(Object.keys(parsed).sort(), [
        "count",
        "first",
        "id",
        "last",
    ])
    assert.deepEqual(Object.keys(parsed.last).sort(), [
        "before",
        "delta",
        "games",
        "seq",
        "sign",
    ])

    const clone = () => ({
        ...row,
        first: { ...row.first },
        last: { ...row.last },
    })
    const breakers = [
        (r) => (r.id = ""),
        (r) => (r.count = 0),
        (r) => (r.count = 1.5),
        (r) => delete r.first,
        (r) => delete r.last,
        (r) => (r.first.seq = "1"),
        (r) => (r.first.name = null),
        (r) => (r.first.before = Number.NaN),
        (r) => (r.first.games = -1),
        (r) => (r.last.before = "x"),
        (r) => (r.last.games = 0.5),
        (r) => (r.last.delta = undefined),
        (r) => (r.last.sign = 0),
        (r) => (r.last.sign = 2),
    ]
    for (const breakIt of breakers) {
        const copy = clone()
        breakIt(copy)
        assert.throws(() => parseBoundaryRow(copy), MALFORMED)
    }
    assert.throws(() => parseBoundaryRow(null), MALFORMED)
})

// ---------------------------------------------------------------------------
// Lector
// ---------------------------------------------------------------------------

test("lector: lo guardado fresco devuelve previous, current y periodEvents", async () => {
    const { docs, retrieve } = setup()

    const result = await retrieve(MID)

    assert.deepEqual(Object.keys(result), [
        "previous",
        "current",
        "periodEvents",
    ])
    assert.ok(result.previous instanceof Map)
    assert.ok(result.current instanceof Map)
    assert.equal(result.previous.size, docs.players.length)
    assert.equal(result.current.size, docs.players.length)
    const expected = docs.events.filter(
        (event) =>
            event.time.getTime() >= MID.start && event.time.getTime() < MID.end
    )
    assert.ok(expected.length > 0)
    assert.deepEqual(
        result.periodEvents.map((event) => event.seq),
        expected.map((event) => event.seq)
    )
    const [first] = result.periodEvents
    assert.equal(typeof first.matchId, "string")
    assert.equal(typeof first.time, "number")
    assert.deepEqual(Object.keys(first.p1).sort(), [
        "before",
        "games",
        "id",
        "name",
    ])
    // Los estados traen solo lo que leen rankPlayers y la respuesta.
    assert.deepEqual(Object.keys(result.previous.get("a")).sort(), [
        "id",
        "matches",
        "name",
        "rating",
    ])
})

test("lector: pide los DAOs con versión, Date(start/end) y Date(end)", async () => {
    const { calls, retrieve } = setup()

    await retrieve(MID)

    const byDao = Object.fromEntries(calls.map((call) => [call.dao, call.args]))
    assert.deepEqual(byDao.findRankingPlayerRatings, [RATING_CONFIG.version])
    assert.deepEqual(byDao.findRatingEventsInRange, [
        RATING_CONFIG.version,
        new Date(MID.start),
        new Date(MID.end),
    ])
    assert.deepEqual(byDao.findRatingBoundaryEvents, [
        RATING_CONFIG.version,
        new Date(MID.end),
    ])
    assert.equal(calls.length, 4)
})

test("lector: las cuatro lecturas arrancan antes de que termine ninguna", async () => {
    const { daos } = setup()
    let started = 0
    let release
    const allStarted = new Promise((resolve) => {
        release = resolve
    })
    const gated =
        (read) =>
        async (...args) => {
            started += 1
            if (started === 4) release()
            await allStarted
            return read(...args)
        }
    const retrieve = createRetrieveStoredPeriod({
        ...daos,
        findRatingSourceStats: gated(daos.findRatingSourceStats),
        findRankingPlayerRatings: gated(daos.findRankingPlayerRatings),
        findRatingEventsInRange: gated(daos.findRatingEventsInRange),
        findRatingBoundaryEvents: gated(daos.findRatingBoundaryEvents),
    })
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("lecturas en serie")), 1000).unref()
    )

    const result = await Promise.race([retrieve(MID), timeout])

    assert.ok(result.previous)
    assert.equal(started, 4)
})

test("lector: cada razón de frescura devuelve { stale } sin lanzar, aunque los eventos estén mal", async () => {
    const cases = [
        ["no_players", (docs) => (docs.players = [])],
        [
            "inconsistent_players",
            (docs) => (docs.players[0].fingerprint = "1".repeat(64)),
        ],
        [
            "fingerprint_mismatch",
            (docs) => {
                for (const doc of docs.players) doc.fingerprint = "1".repeat(64)
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
                for (const doc of docs.players) doc.source.ratedMatches += 1
            },
        ],
        [
            "stale_updated_at",
            (docs) => {
                for (const doc of docs.players) {
                    doc.source.maxUpdatedAt = new Date("2020-01-01T00:00:00Z")
                }
            },
        ],
    ]
    for (const [reason, change] of cases) {
        const { calls, retrieve } = setup((docs) => {
            // Eventos rotos: la frescura gana igual.
            for (const event of docs.events) event.scoreP1 = "x"
            change(docs)
        })
        assert.deepEqual(await retrieve(MID), { stale: reason }, reason)
        assert.equal(calls.length, 4, reason)
    }
})

test("lector: la huella de un evento distinta da fingerprint_mismatch", async () => {
    const other = "1".repeat(64)
    const cases = [
        [
            "un evento del período (A)",
            (docs) =>
                (docs.events.find((e) => e.seq === 7).fingerprint = other),
        ],
        [
            "un evento de la cola posterior (B), que no es el primero ni el último",
            (docs) =>
                (docs.events.find((e) => e.seq === 14).fingerprint = other),
        ],
        [
            "el último evento de la cola posterior",
            (docs) => (docs.events[docs.events.length - 1].fingerprint = other),
        ],
    ]
    for (const [label, change] of cases) {
        const { retrieve } = setup(change)
        assert.deepEqual(
            await retrieve(MID),
            { stale: "fingerprint_mismatch" },
            label
        )
    }

    // Se evalúa antes de validar tipos: un evento ajeno y malformado da stale.
    const { retrieve } = setup((docs) => {
        const event = docs.events.find((e) => e.seq === 7)
        event.fingerprint = other
        event.scoreP1 = "x"
    })
    assert.deepEqual(await retrieve(MID), { stale: "fingerprint_mismatch" })
})

test("lector: fingerprints de una fila de B ajenos o que no son un arreglo dan fingerprint_mismatch", async () => {
    const { docs, daos } = setup()
    const rows = await daos.findRatingBoundaryEvents(
        RATING_CONFIG.version,
        new Date(MID.end)
    )
    const variants = [
        (row) => ({ ...row, fingerprints: [FINGERPRINT, "1".repeat(64)] }),
        (row) => ({ ...row, fingerprints: "x" }),
        (row) => ({ ...row, fingerprints: undefined }),
    ]
    for (const variant of variants) {
        const retrieve = createRetrieveStoredPeriod({
            ...daos,
            findRatingBoundaryEvents: async () => [
                variant(rows[0]),
                ...rows.slice(1),
            ],
        })
        assert.deepEqual(await retrieve(MID), { stale: "fingerprint_mismatch" })
    }
    assert.ok(docs.events.length > 0)
})

test("lector: una cadena rota da inconsistent_chain", async () => {
    const seqOfAna = (docs, nth) =>
        docs.events.filter((e) => e.p1.id === "a" || e.p2.id === "a")[nth]
    const cases = [
        [
            "rating de un jugador con eventos en B",
            MID,
            (docs) => (docs.players.find((p) => p.id === "a").rating += 0.5),
        ],
        [
            "matches de un jugador con eventos en B",
            MID,
            (docs) => (docs.players.find((p) => p.id === "a").matches += 1),
        ],
        [
            "rating de un jugador con eventos solo en A",
            ALL,
            (docs) => (docs.players.find((p) => p.id === "c").rating += 0.5),
        ],
        [
            "before alterado a mitad de A",
            MID,
            (docs) => {
                const event = docs.events.find((e) => e.seq === 7)
                event.p1.before += 0.5
            },
        ],
        [
            "un evento borrado de A",
            MID,
            (docs) => {
                const event = seqOfAna(docs, 6)
                docs.events = docs.events.filter((e) => e !== event)
            },
        ],
        [
            "un evento borrado de la cola de B",
            MID,
            (docs) => {
                docs.events = docs.events.filter((e) => e.seq !== 18)
            },
        ],
        [
            "un evento de un jugador inexistente en player-ratings",
            MID,
            (docs) => {
                docs.players = docs.players.filter((p) => p.id !== "d")
            },
        ],
    ]
    for (const [label, window, change] of cases) {
        const { retrieve } = setup(change)
        assert.deepEqual(
            await retrieve(window),
            { stale: "inconsistent_chain" },
            label
        )
    }
})

test("lector: límite conocido, el rating de un jugador sin eventos desde start no se verifica", async () => {
    // Caro no juega desde enero: ni A ni B lo leen, su estado sale de
    // player-ratings (coherente por la regla de frescura).
    const { retrieve } = setup((docs) => {
        docs.players.find((p) => p.id === "c").rating += 5
    })

    const result = await retrieve(FEB)

    assert.ok(result.previous)
    assert.equal(
        result.current.get("c").rating,
        setup().docs.players.find((p) => p.id === "c").rating + 5
    )
})

test("lector: previous y current coinciden con el motor en cada jugador", async () => {
    const {
        buildRatingsTimeline,
    } = require("../service/playerRatings/timeline")
    const matches = syntheticHistory()
    const timeline = buildRatingsTimeline(matches)
    const { retrieve } = setup()

    for (const window of [MID, ALL, BEFORE_ALL, AFTER_ALL, FEB]) {
        const { previous, current } = await retrieve(window)
        for (const [stored, cutoff] of [
            [previous, window.start],
            [current, window.end],
        ]) {
            const live = timeline.snapshotAt(cutoff)
            for (const [id, state] of stored) {
                const expected = live.get(id)
                assert.equal(state.matches, expected?.matches ?? 0, id)
                if (state.matches > 0) {
                    assert.equal(state.rating, expected.rating, id)
                }
            }
        }
    }
})

test("lector: documentos malformados lanzan", async () => {
    const breakers = [
        (docs) => (docs.players[0].rating = "x"),
        (docs) => (docs.players[0].matches = -1),
        (docs) => (docs.players[0].name = null),
        (docs) => (docs.events.find((e) => e.seq === 7).scoreP1 = "x"),
        (docs) => (docs.events.find((e) => e.seq === 7).p1.games = -1),
        (docs) => (docs.events.find((e) => e.seq === 7).tournament = 5),
    ]
    for (const breakIt of breakers) {
        const { retrieve } = setup(breakIt)
        await assert.rejects(retrieve(MID), MALFORMED)
    }

    // Filas de B malformadas o repetidas.
    const { daos } = setup()
    const rows = await daos.findRatingBoundaryEvents(
        RATING_CONFIG.version,
        new Date(MID.end)
    )
    for (const boundary of [
        [{ ...rows[0], count: 0 }, ...rows.slice(1)],
        [{ ...rows[0], last: undefined }, ...rows.slice(1)],
        [rows[0], rows[0]],
    ]) {
        const retrieve = createRetrieveStoredPeriod({
            ...daos,
            findRatingBoundaryEvents: async () => boundary,
        })
        await assert.rejects(retrieve(MID), MALFORMED)
    }
    for (const [dao, value] of [
        ["findRatingEventsInRange", {}],
        ["findRatingBoundaryEvents", null],
    ]) {
        const retrieve = createRetrieveStoredPeriod({
            ...daos,
            [dao]: async () => value,
        })
        await assert.rejects(
            retrieve(MID),
            /no son un arreglo|no es un arreglo/
        )
    }
})

test("lector: los errores de los DAOs se propagan y exige dependencias y ventana válida", async () => {
    const { daos } = setup()
    for (const failing of [
        "findRatingSourceStats",
        "findRankingPlayerRatings",
        "findRatingEventsInRange",
        "findRatingBoundaryEvents",
    ]) {
        const retrieve = createRetrieveStoredPeriod({
            ...daos,
            [failing]: async () => {
                throw new Error(`falla ${failing}`)
            },
        })
        await assert.rejects(retrieve(MID), new RegExp(failing))
    }

    for (const missing of Object.keys(daos)) {
        assert.throws(
            () => createRetrieveStoredPeriod({ ...daos, [missing]: undefined }),
            (error) =>
                error instanceof TypeError && error.message.includes(missing)
        )
    }
    assert.throws(() => createRetrieveStoredPeriod(), TypeError)

    const retrieve = createRetrieveStoredPeriod(daos)
    await assert.rejects(
        retrieve({ start: Number.NaN, end: MID.end }),
        /start y end/
    )
    await assert.rejects(retrieve({ start: MID.start }), /start y end/)
    await assert.rejects(
        retrieve({ start: MID.end, end: MID.start }),
        /start y end/
    )
    await assert.rejects(
        retrieve({ start: MID.start, end: MID.start }),
        /start y end/
    )
    await assert.rejects(retrieve(), /start y end/)
})

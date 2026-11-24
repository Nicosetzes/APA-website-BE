"use strict"

process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const { once } = require("node:events")
const test = require("node:test")

const { createApp } = require("../app")
const { createGetRatingsReigns } = require("../controller/getRatingsReigns")
const matchesModel = require("../dao/models/matches")
const tournamentsModel = require("../dao/models/tournaments")
const usersModel = require("../dao/models/users")
const { rankPlayers } = require("../service/playerRatings")
const { buildHistoryPayload } = require("../service/playerRatings/history")
const {
    buildReignsPayload,
    createLeadershipTracker,
    findReigns,
    trackPeriodPositions,
} = require("../service/playerRatings/leadership")
const { buildRatingsTimeline } = require("../service/playerRatings/timeline")
const {
    createRetrieveStoredPeriod,
} = require("../service/ratingsReadModel/createRetrieveStoredPeriod")
const {
    invalidate: invalidateRatingMatches,
} = require("../service/retrieveRatingMatches")
const { getArgentinaDayRange } = require("../utils/argentinaDay")
const {
    DEFAULT_USERS,
    createResponse,
    makeLogger,
} = require("./fixtures/ratingsPeriod")
const { historyDaos } = require("./fixtures/ratingsHistory")
const { storedDocsFrom } = require("./fixtures/ratingsReadModel")
const { LEO, NICO, SANTI, match } = require("./fixtures/ratingsStore")

const DAY = 86400000
const FIRST_TIME = Date.UTC(2026, 0, 1, 15)

// Eventos sintéticos con la forma del motor: `moves` es `[p1, p2, delta]` y el
// `before`/`games` de cada lado sale de los eventos anteriores.
const makeEvents = (moves) => {
    const state = new Map()
    return moves.map(([p1, p2, delta], index) => {
        const side = (id) => {
            const current = state.get(id) ?? { rating: 1500, games: 0 }
            return { id, name: id.toUpperCase(), ...current }
        }
        const a = side(p1)
        const b = side(p2)
        state.set(p1, { rating: a.rating + delta, games: a.games + 1 })
        state.set(p2, { rating: b.rating - delta, games: b.games + 1 })
        return {
            seq: index + 1,
            matchId: `m${index + 1}`,
            time: FIRST_TIME + index * DAY,
            delta,
            p1: { id: a.id, name: a.name, before: a.rating, games: a.games },
            p2: { id: b.id, name: b.name, before: b.rating, games: b.games },
        }
    })
}

const leadersAfterEach = (events, provisionalMatches, seed = []) => {
    const tracker = createLeadershipTracker({ provisionalMatches, seed })
    return events.map((event) => {
        tracker.apply(event)
        return tracker.leader()
    })
}

const iso = (index) => new Date(FIRST_TIME + index * DAY).toISOString()

test("líder: un provisorio no puede ser #1 aunque tenga más rating", () => {
    const events = makeEvents([
        ["x", "y", 30], // x 1530 con 1 partido (provisorio con 2)
        ["a", "b", 5],
        ["a", "b", 5], // a 1510 y b 1490 con 2 partidos: a es #1
        ["x", "y", 1], // x 1531 con 2 partidos: deja de ser provisorio
    ])
    assert.deepEqual(leadersAfterEach(events, 2), [null, null, "a", "x"])
})

test("líder: el empate en la cima sin líder previo no corona a nadie", () => {
    const events = makeEvents([
        ["a", "b", 0],
        ["c", "d", 0],
        ["a", "c", 3],
    ])
    assert.deepEqual(leadersAfterEach(events, 1), [null, null, "a"])
})

test("líder: empatarlo no lo destrona; superarlo sí", () => {
    const events = makeEvents([
        ["a", "b", 10], // a 1510
        ["c", "d", 10], // c 1510: empata con a, a sigue
        ["c", "b", 1], // c 1511: supera a a
        ["a", "d", 1], // a 1511: empata con c, c sigue
    ])
    assert.deepEqual(leadersAfterEach(events, 1), ["a", "a", "c", "c"])
})

test("líder: si el líder pierde y queda debajo de otro, cambia", () => {
    const events = makeEvents([
        ["a", "b", 10], // a 1510, b 1490
        ["c", "d", 5], // c 1505
        ["b", "a", 8], // a 1502: c lo supera sin jugar
    ])
    assert.deepEqual(leadersAfterEach(events, 1), ["a", "a", "c"])
})

test("líder: desde una foto, mayor rating y orden del ranking ante empate", () => {
    const seed = [
        { id: "a", name: "A", rating: 1520, matches: 5 },
        { id: "b", name: "B", rating: 1520, matches: 6 },
        { id: "c", name: "C", rating: 1600, matches: 2 },
    ]
    const tracker = createLeadershipTracker({ provisionalMatches: 5, seed })
    // c tiene más rating pero es provisorio; a y b empatan y b tiene más partidos.
    assert.equal(tracker.leader(), "b")
    assert.equal(
        createLeadershipTracker({ provisionalMatches: 5 }).leader(),
        null
    )
})

test("reinados: partidos, fechas, vigente y quién lo destronó", () => {
    const events = makeEvents([
        ["a", "b", 10],
        ["c", "d", 10],
        ["c", "b", 1],
        ["a", "d", 1],
    ])
    const names = new Map([["c", "Caro"]])
    const reigns = findReigns({ events, provisionalMatches: 1, names })
    const withoutMatches = reigns.map(
        ({ startMatch, lastMatch, breakMatch, ...rest }) => rest
    )
    assert.deepEqual(withoutMatches, [
        {
            player: { id: "a", name: "A" },
            matches: 2,
            startDate: iso(0),
            endDate: iso(2),
            isActive: false,
            dethronedBy: { id: "c", name: "Caro" },
        },
        {
            player: { id: "c", name: "Caro" },
            matches: 2,
            startDate: iso(2),
            endDate: iso(3),
            isActive: true,
            dethronedBy: null,
        },
    ])
    // Partidos: el que lo coronó, el último como #1 y el que lo destronó (que
    // no involucra a A: C le gana a B).
    const [first, second] = reigns
    assert.equal(first.startMatch.matchId, "m1")
    assert.equal(first.lastMatch.matchId, "m2")
    assert.equal(first.breakMatch.matchId, "m3")
    assert.deepEqual(
        [first.breakMatch.p1.id, first.breakMatch.p2.id],
        ["c", "b"]
    )
    assert.equal(first.breakMatch.p1.name, "Caro")
    assert.equal(second.startMatch.matchId, "m3")
    assert.equal(second.lastMatch.matchId, "m4")
    assert.equal(second.breakMatch, null)
})

test("reinados: el partido trae equipos, marcador, tanda, torneo y precisión de la fecha", () => {
    const [event] = makeEvents([["a", "b", 10]])
    const enriched = {
        ...event,
        scoreP1: 1,
        scoreP2: 1,
        shootoutP1: 4,
        shootoutP2: 3,
        tournament: "Copa APA",
        type: "playoff",
        playedAtPrecision: "year",
        p1: { ...event.p1, team: "Boca", teamId: 0 },
        p2: { ...event.p2, team: "River" },
    }
    const [reign] = findReigns({
        events: [enriched],
        provisionalMatches: 1,
        names: new Map(),
    })
    assert.deepEqual(reign.startMatch, {
        matchId: "m1",
        date: iso(0),
        datePrecision: "year",
        tournament: "Copa APA",
        type: "playoff",
        p1: { id: "a", name: "A", team: { id: 0, name: "Boca" }, score: 1 },
        p2: { id: "b", name: "B", team: { id: null, name: "River" }, score: 1 },
        penalties: { p1: 4, p2: 3 },
    })
    // Sin datos de partido (evento mínimo): equipos, tanda y precisión nulos.
    const [plain] = findReigns({
        events: [event],
        provisionalMatches: 1,
        names: new Map(),
    })
    assert.equal(plain.startMatch.p1.team, null)
    assert.equal(plain.startMatch.penalties, null)
    assert.equal(plain.startMatch.datePrecision, null)
})

test("reinados: el ya #1 en la foto inicial arranca sin fecha", () => {
    const seed = [{ id: "a", name: "A", rating: 1550, matches: 3 }]
    const events = makeEvents([["b", "c", 1]])
    const [reign] = findReigns({
        seed,
        events,
        provisionalMatches: 1,
        names: new Map(),
    })
    assert.equal(reign.player.id, "a")
    assert.equal(reign.startDate, null)
    assert.equal(reign.startMatch, null)
    assert.equal(reign.matches, 1)
    assert.equal(reign.isActive, true)
})

test("reinados: payload con vigente, los más largos empatados y parámetros", () => {
    const events = makeEvents([
        ["a", "b", 10],
        ["c", "d", 10],
        ["c", "b", 1],
        ["a", "d", 1],
    ])
    const payload = buildReignsPayload({
        periodEvents: [...events].reverse(),
        config: { version: "2.0", provisionalMatches: 1 },
        names: new Map(),
    })
    assert.deepEqual(Object.keys(payload), ["success", "parameters", "data"])
    assert.equal(payload.parameters.version, "2.0")
    assert.deepEqual(Object.keys(payload.data), [
        "current",
        "longest",
        "reigns",
    ])
    // Ordena por `seq` aunque los eventos lleguen desordenados.
    assert.equal(payload.data.reigns.length, 2)
    assert.equal(payload.data.current.player.id, "c")
    assert.deepEqual(
        payload.data.longest.map((reign) => reign.player.id),
        ["a", "c"]
    )

    const empty = buildReignsPayload({
        periodEvents: [],
        config: { version: "2.0", provisionalMatches: 1 },
        names: new Map(),
    })
    assert.deepEqual(empty.data, { current: null, longest: [], reigns: [] })
})

test("posiciones del período: cambios desde x = 0 y null antes del debut", () => {
    const events = makeEvents([
        ["a", "b", 10],
        ["c", "a", 15],
    ])
    const { positionsById, leaderMatchesById } = trackPeriodPositions({
        seed: [],
        events,
        provisionalMatches: 1,
        ids: ["a", "b", "c"],
    })
    assert.deepEqual(positionsById.get("a"), [
        { x: 0, position: null },
        { x: 1, position: 1 },
        { x: 2, position: 2 },
    ])
    assert.deepEqual(positionsById.get("c"), [
        { x: 0, position: null },
        { x: 2, position: 1 },
    ])
    assert.equal(leaderMatchesById.get("a"), 1)
    assert.equal(leaderMatchesById.get("c"), 1)
    assert.equal(leaderMatchesById.get("b"), 0)
})

// Historia real del motor: 3 jugadores, 45 partidos (15 cada uno contra cada
// uno), con resultados variados para que el #1 cambie de mano.
const RESULTS = [
    [2, 0],
    [0, 1],
    [1, 1],
    [3, 1],
    [0, 2],
]
const longHistory = () => {
    const pairs = [
        [NICO, SANTI],
        [SANTI, LEO],
        [LEO, NICO],
    ]
    return Array.from({ length: 45 }, (_, index) => {
        const [p1, p2] = pairs[index % 3]
        const [s1, s2] = RESULTS[(index * 7) % RESULTS.length]
        const day = new Date(Date.UTC(2026, 0, 1 + index, 15)).toISOString()
        return match(index + 1, p1, s1, p2, s2, day)
    })
}

const historyInputs = (matches, dateFrom, dateTo) => {
    const timeline = buildRatingsTimeline(matches, { teamStrength: null })
    const start = getArgentinaDayRange(dateFrom).start.getTime()
    const end = getArgentinaDayRange(dateTo).end.getTime()
    const periodEvents = []
    timeline.events.forEach((event, index) => {
        if (event.time !== null && event.time >= start && event.time < end) {
            periodEvents.push({ ...event, seq: index + 1 })
        }
    })
    return {
        previousRanking: rankPlayers(timeline.snapshotAt(start)),
        currentRanking: rankPlayers(timeline.snapshotAt(end)),
        periodEvents,
        config: timeline.config,
        names: new Map(),
        dateFrom,
        dateTo,
    }
}

const positionAt = (positions, x) =>
    positions.filter((change) => change.x <= x).at(-1)?.position ?? null

test("historial: las posiciones empalman con la posición inicial y final", () => {
    const inputs = historyInputs(longHistory(), "2026-01-20", "2026-02-05")
    const payload = buildHistoryPayload(inputs)
    const lastX = payload.data.matchesTimeline.length
    assert.ok(lastX > 0)
    for (const player of payload.data.players) {
        assert.equal(player.positions[0].x, 0)
        assert.equal(
            positionAt(player.positions, 0),
            player.summary.previousPosition
        )
        assert.equal(
            positionAt(player.positions, lastX),
            player.summary.position
        )
    }
})

test("historial: con todo el historial, los partidos en el #1 suman lo mismo que los reinados", () => {
    const inputs = historyInputs(longHistory(), "2019-01-01", "2026-12-31")
    const payload = buildHistoryPayload(inputs)
    const reigns = buildReignsPayload(inputs).data.reigns
    assert.ok(reigns.length >= 2, "el #1 cambia de mano en la historia")
    const totals = new Map()
    for (const reign of reigns) {
        totals.set(
            reign.player.id,
            (totals.get(reign.player.id) ?? 0) + reign.matches
        )
    }
    for (const player of payload.data.players) {
        assert.equal(
            player.summary.leaderMatches,
            totals.get(player.player.id) ?? 0,
            player.player.id
        )
    }
    // Nadie es #1 hasta tener 10 partidos: los primeros eventos no cuentan.
    const counted = reigns.reduce((sum, reign) => sum + reign.matches, 0)
    assert.ok(counted < payload.data.matchesInPeriod)
})

test("historial: el filtro players no cambia las posiciones", () => {
    const inputs = historyInputs(longHistory(), "2026-01-20", "2026-02-05")
    const all = buildHistoryPayload(inputs)
    const only = buildHistoryPayload({ ...inputs, playerIds: ["s"] })
    assert.equal(only.data.players.length, 1)
    assert.deepEqual(
        only.data.players[0].positions,
        all.data.players.find((player) => player.player.id === "s").positions
    )
    assert.equal(
        only.data.players[0].summary.leaderMatches,
        all.data.players.find((player) => player.player.id === "s").summary
            .leaderMatches
    )
})

test("reigns: el camino guardado y el en vivo responden lo mismo", async () => {
    const matches = longHistory()
    const live = createResponse()
    await createGetRatingsReigns({
        retrieveAllMatches: async () => matches,
        retrieveAllUsers: async () => DEFAULT_USERS,
    })({ query: {} }, live)

    let liveReads = 0
    const fromStored = createResponse()
    await createGetRatingsReigns({
        retrieveAllMatches: async () => {
            liveReads += 1
            return matches
        },
        retrieveAllUsers: async () => DEFAULT_USERS,
        retrieveStoredPeriod: createRetrieveStoredPeriod(
            historyDaos(storedDocsFrom(matches))
        ),
        readModelEnabled: () => true,
        logger: makeLogger(),
    })({ query: {} }, fromStored)

    assert.equal(liveReads, 0, "lo guardado estaba fresco")
    assert.ok(live.body.data.reigns.length >= 2)
    // Con los datos del historial: equipos del partido en los dos caminos.
    assert.deepEqual(live.body.data.reigns[1].startMatch.p1.team, {
        id: 1,
        name: "Boca",
    })
    assert.deepEqual(fromStored.body, live.body)
})

const withApp = async (t, callback) => {
    invalidateRatingMatches()
    t.after(invalidateRatingMatches)
    const previousReadModel = process.env.RATING_READ_MODEL
    process.env.RATING_READ_MODEL = "off"
    t.after(() => {
        if (previousReadModel === undefined)
            delete process.env.RATING_READ_MODEL
        else process.env.RATING_READ_MODEL = previousReadModel
    })
    const matches = longHistory()
    t.mock.method(matchesModel, "find", () => ({ lean: async () => matches }))
    t.mock.method(tournamentsModel, "find", () => ({ lean: async () => [] }))
    t.mock.method(usersModel, "find", async () => [])
    const app = createApp({
        ensureDatabase: async () => {},
        getDatabaseStatus: () => ({ state: "connected", name: "apa_test" }),
    })
    const server = app.listen(0)
    await once(server, "listening")
    try {
        await callback(`http://127.0.0.1:${server.address().port}`)
    } finally {
        server.close()
        await once(server, "close")
    }
}

test("GET /api/ratings/reigns es público y no acepta parámetros", async (t) => {
    await withApp(t, async (baseUrl) => {
        const response = await globalThis.fetch(`${baseUrl}/api/ratings/reigns`)
        assert.equal(response.status, 200)
        const body = await response.json()
        assert.equal(body.success, true)
        assert.ok(body.data.current)
        assert.ok(body.data.longest.length >= 1)

        const invalid = await globalThis.fetch(
            `${baseUrl}/api/ratings/reigns?limit=5`
        )
        assert.equal(invalid.status, 400)
    })
})

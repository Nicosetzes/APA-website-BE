"use strict"

process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const { once } = require("node:events")
const test = require("node:test")

const { createApp } = require("../app")
const { UPSETS_LIMIT } = require("../config/ratingUpsets")
const { createGetRatingsUpsets } = require("../controller/getRatingsUpsets")
const findRatingEventsInRange = require("../dao/findRatingEventsInRange")
const matchesModel = require("../dao/models/matches")
const tournamentsModel = require("../dao/models/tournaments")
const usersModel = require("../dao/models/users")
const {
    eventProbability,
    eventProbabilityRaw,
} = require("../service/playerRatings/eventProbability")
const {
    buildGlobalUpsetsPayload,
} = require("../service/playerRatings/globalUpsets")
const {
    createRetrieveStoredPeriod,
} = require("../service/ratingsReadModel/createRetrieveStoredPeriod")
const {
    invalidate: invalidateRatingMatches,
} = require("../service/retrieveRatingMatches")
const requestSchemas = require("../validation/requestSchemas")
const { historyDaos } = require("./fixtures/ratingsHistory")
const { contextHistory } = require("./fixtures/ratingsStore")
const { storedDocsFrom } = require("./fixtures/ratingsReadModel")

const T1 = "111111111111111111111111"
const T2 = "222222222222222222222222"
const names = new Map([
    ["a", "Ana"],
    ["b", "Beto"],
    ["c", "Caro"],
    ["d", "Dani"],
])

const side = (id, team = id.toUpperCase(), teamId = id.charCodeAt(0)) => ({
    id,
    name: `Nombre ${id}`,
    before: 1500,
    games: 0,
    team,
    teamId,
})

const event = ({
    seq,
    matchId = `match-${seq}`,
    time = Date.UTC(2026, 0, seq, 15),
    tournamentId = T1,
    tournament = "Copa Uno",
    type = "regular",
    kind = type === "regular" ? "win" : "advance",
    p1 = side("a"),
    p2 = side("b"),
    expectedP1 = 0.2,
    resultP1 = 1,
    delta = 16,
    scoreP1 = resultP1 === 1 ? 2 : resultP1 === 0 ? 0 : 1,
    scoreP2 = resultP1 === 0 ? 2 : resultP1 === 1 ? 0 : 1,
    playedAtPrecision = "exact",
    ...extra
}) => ({
    seq,
    matchId,
    time,
    tournamentId,
    tournament,
    type,
    kind,
    p1,
    p2,
    expectedP1,
    resultP1,
    delta,
    scoreP1,
    scoreP2,
    playedAtPrecision,
    ...extra,
})

const payload = (periodEvents, filters = {}) =>
    buildGlobalUpsetsPayload({ periodEvents, names, ...filters })

const response = () => ({
    body: null,
    json(body) {
        this.body = body
        return body
    },
})

test("conserva la probabilidad pública redondeada y expone la cruda para ordenar", () => {
    const rawWin = eventProbabilityRaw({
        kind: "win",
        expectedP1: 0.20004,
        isP1: true,
    })
    const shownWin = eventProbability({
        kind: "win",
        expectedP1: 0.20004,
        isP1: true,
    })
    const rawAdvance = eventProbabilityRaw({
        kind: "advance",
        expectedP1: 0.20004,
        isP1: false,
    })

    assert.notEqual(rawWin.for, shownWin.for)
    assert.equal(shownWin.for, Math.round(rawWin.for * 1000) / 1000)
    assert.deepEqual(rawAdvance, {
        kind: "advance",
        for: 0.79996,
        against: 0.20004,
    })
    assert.equal(
        eventProbabilityRaw({ kind: "win", expectedP1: NaN, isP1: true }),
        null
    )
})

test("orienta victorias P1/P2, usa ganar o avanzar y no excluye provisorios", () => {
    const result = payload([
        event({ seq: 1, p1: side("a"), p2: side("b") }),
        event({
            seq: 2,
            type: "playoff",
            p1: side("c"),
            p2: side("d"),
            expectedP1: 0.8,
            resultP1: 0,
            delta: -18,
        }),
        event({
            seq: 3,
            kind: null,
            p1: side("c"),
            p2: side("a"),
        }),
    ])

    assert.equal(result.data.total, 3)
    assert.deepEqual(result.data.upsets[0].winner, { id: "a", name: "Ana" })
    assert.deepEqual(result.data.upsets[0].loser, { id: "b", name: "Beto" })
    assert.equal(result.data.upsets[0].kind, "win")
    assert.equal(result.data.upsets[0].tournamentId, T1)
    assert.deepEqual(result.data.upsets[0].tournament, {
        id: T1,
        name: "Copa Uno",
    })
    assert.deepEqual(result.data.upsets[0].teams, {
        winner: { id: 97, name: "A" },
        loser: { id: 98, name: "B" },
    })

    const p2Win = result.data.upsets.find(
        ({ matchId }) => matchId === "match-2"
    )
    assert.equal(p2Win.winner.id, "d")
    assert.deepEqual(p2Win.score, { winner: 2, loser: 0 })
    assert.equal(p2Win.kind, "advance")
    assert.equal(p2Win.probability, 0.2)
    assert.equal(p2Win.ratingChange, 18)
})

test("mantiene los objetos de equipo cuando faltan ids o nombres históricos", () => {
    const result = payload([
        event({
            seq: 1,
            tournamentId: null,
            p1: { ...side("a"), team: undefined, teamId: undefined },
            p2: { ...side("b"), team: "", teamId: null },
        }),
    ])

    assert.equal(result.data.upsets[0].tournamentId, null)
    assert.deepEqual(result.data.upsets[0].teams, {
        winner: { id: null, name: null },
        loser: { id: null, name: null },
    })
})

test("incluye penales como victoria deportiva y los orienta por la tanda", () => {
    const result = payload([
        event({
            seq: 1,
            type: "playoff",
            expectedP1: 0.8,
            resultP1: 0.5,
            delta: -6,
            scoreP1: 1,
            scoreP2: 1,
            shootoutP1: 3,
            shootoutP2: 5,
        }),
    ])

    assert.equal(result.data.total, 1)
    assert.deepEqual(result.data.upsets[0].penalties, { winner: 5, loser: 3 })
    assert.equal(result.data.upsets[0].winner.id, "b")
    assert.equal(result.data.upsets[0].probability, 0.2)
    assert.equal(result.data.upsets[0].ratingChange, 6)
})

test("excluye empates, favoritos, probabilidades iguales y clases no interpretables", () => {
    const result = payload([
        event({ seq: 1, resultP1: 0.5, scoreP1: 1, scoreP2: 1 }),
        event({ seq: 2, expectedP1: 0.8, resultP1: 1 }),
        event({ seq: 3, expectedP1: 0.5, resultP1: 1 }),
        event({ seq: 4, type: "playoff", kind: null }),
        event({ seq: 5, kind: "unknown" }),
        event({ seq: 6, expectedP1: Infinity }),
        event({
            seq: 7,
            resultP1: 0.5,
            scoreP1: 1,
            scoreP2: 1,
            shootoutP1: 4,
            shootoutP2: 4,
        }),
    ])

    assert.equal(result.data.total, 0)
    assert.deepEqual(result.data.upsets, [])
})

test("ordena por probabilidad cruda, cambio de rating, seq y matchId", () => {
    const result = payload([
        event({
            seq: 5,
            matchId: "z",
            type: "playoff",
            expectedP1: 0.2002,
            delta: 50,
        }),
        event({
            seq: 4,
            matchId: "d",
            type: "playoff",
            expectedP1: 0.2001,
            delta: 10,
        }),
        event({
            seq: 8,
            matchId: "c",
            type: "playoff",
            expectedP1: 0.2001,
            delta: 20,
        }),
        event({
            seq: 3,
            matchId: "b",
            type: "playoff",
            expectedP1: 0.2001,
            delta: 10,
        }),
        event({
            seq: 3,
            matchId: "a",
            type: "playoff",
            expectedP1: 0.2001,
            delta: 10,
        }),
    ])

    assert.deepEqual(
        result.data.upsets.map(({ matchId }) => matchId),
        ["c", "a", "b", "d", "z"]
    )
    assert.equal(result.data.upsets[0].probability, 0.2)
    assert.equal(result.data.upsets[4].probability, 0.2)
})

test("mantiene un registro por matchId y no expone el evento completo", () => {
    const result = payload([
        event({ seq: 2, matchId: "same", delta: 20 }),
        event({ seq: 1, matchId: "same", delta: 10 }),
    ])
    const row = result.data.upsets[0]

    assert.equal(result.data.total, 1)
    assert.equal(row.ratingChange, 10)
    assert.deepEqual(Object.keys(row), [
        "matchId",
        "playedAt",
        "playedAtPrecision",
        "tournamentId",
        "tournament",
        "type",
        "winner",
        "loser",
        "teams",
        "score",
        "penalties",
        "probability",
        "kind",
        "ratingChange",
    ])
    assert.equal("expectedP1" in row, false)
    assert.equal("seq" in row, false)
    assert.equal("p1" in row, false)
})

test("aplica todos los filtros antes del límite y conserva opciones globales", () => {
    const events = [
        event({ seq: 1, time: Date.parse("2026-01-02T02:59:00Z") }),
        event({
            seq: 2,
            time: Date.parse("2026-01-02T03:00:00Z"),
            tournamentId: T2,
            tournament: "Copa Dos",
            type: "playoff",
            p1: side("c"),
            p2: side("d"),
            expectedP1: 0.8,
            resultP1: 0.5,
            delta: -5,
            shootoutP1: 2,
            shootoutP2: 4,
        }),
        event({
            seq: 3,
            time: Date.parse("2026-01-03T15:00:00Z"),
            type: "playin",
            p1: side("a"),
            p2: side("c"),
            expectedP1: 0.8,
            resultP1: 0,
            delta: -12,
        }),
    ]

    assert.deepEqual(
        payload(events, {
            dateFrom: "2026-01-01",
            dateTo: "2026-01-01",
        }).data.upsets.map(({ matchId }) => matchId),
        ["match-1"]
    )
    assert.equal(payload(events, { tournamentId: T2 }).data.total, 1)
    assert.equal(payload(events, { playerId: "d" }).data.total, 1)
    assert.equal(payload(events, { type: "playin" }).data.total, 1)
    assert.equal(payload(events, { penalties: "only" }).data.total, 1)
    assert.equal(payload(events, { penalties: "exclude" }).data.total, 2)

    const fixedTop = payload(events)
    assert.equal(fixedTop.data.total, 3)
    assert.equal(fixedTop.data.upsets.length, 3)
    assert.equal(fixedTop.data.players.length, 4)
    assert.equal(fixedTop.data.tournaments.length, 2)
})

test("usa un top 10 fijo después de aplicar los filtros", () => {
    const events = Array.from({ length: UPSETS_LIMIT + 2 }, (_, index) =>
        event({ seq: index + 1, matchId: `limit-${index + 1}` })
    )
    const result = payload(events)

    assert.equal(result.data.total, UPSETS_LIMIT + 2)
    assert.equal(result.data.upsets.length, UPSETS_LIMIT)
})

test("el schema valida filtros y rechaza el parámetro limit retirado", () => {
    const valid = requestSchemas.getRatingsUpsets.query.validate({})
    assert.equal(valid.error, undefined)
    assert.deepEqual(valid.value, {
        penalties: "all",
    })
    assert.equal(
        requestSchemas.getRatingsUpsets.query.validate({
            dateFrom: "2026-01-01",
        }).error,
        undefined
    )
    assert.equal(
        requestSchemas.getRatingsUpsets.query.validate({
            dateTo: "2026-01-01",
        }).error,
        undefined
    )
    assert.equal(
        requestSchemas.getRatingsUpsets.query.validate({
            tournamentId: T1.toUpperCase(),
            playerId: " a ",
            type: "regular",
            penalties: "only",
        }).value.tournamentId,
        T1
    )

    for (const query of [
        { dateFrom: "2026-02-02", dateTo: "2026-02-01" },
        { dateFrom: "2026-02-30" },
        { tournamentId: "bad" },
        { playerId: "" },
        { type: "knockout" },
        { penalties: "yes" },
        { limit: 10 },
        { extra: "x" },
    ]) {
        assert.ok(requestSchemas.getRatingsUpsets.query.validate(query).error)
    }
})

test("controller hace una única lectura global con historial ampliado", async () => {
    let storedReads = 0
    let liveReads = 0
    let received
    const res = response()

    await createGetRatingsUpsets({
        retrieveAllMatches: async () => {
            liveReads += 1
            return []
        },
        retrieveAllUsers: async () => [],
        retrieveStoredPeriod: async (options) => {
            storedReads += 1
            received = options
            return {
                previous: new Map(),
                current: new Map(),
                periodEvents: [],
            }
        },
        readModelEnabled: () => true,
        logger: { info() {} },
    })({ query: { penalties: "all" } }, res)

    assert.equal(storedReads, 1)
    assert.equal(liveReads, 0)
    assert.equal(received.includeHistory, true)
    assert.equal(received.allTime, true)
    assert.equal(received.start, 0)
    assert.equal(received.end, Date.UTC(9999, 11, 31))
    assert.deepEqual(res.body.data, {
        total: 0,
        players: [],
        tournaments: [],
        upsets: [],
    })
})

test("endpoint persistido coincide con el vivo sin leer partidos", async () => {
    const matches = contextHistory()
    const liveResponse = response()
    await createGetRatingsUpsets({
        retrieveAllMatches: async () => matches,
        retrieveAllUsers: async () => [],
    })({ query: { penalties: "all" } }, liveResponse)

    let liveReads = 0
    const calls = []
    const storedResponse = response()
    await createGetRatingsUpsets({
        retrieveAllMatches: async () => {
            liveReads += 1
            return matches
        },
        retrieveAllUsers: async () => [],
        retrieveStoredPeriod: createRetrieveStoredPeriod(
            historyDaos(storedDocsFrom(matches), { calls })
        ),
        readModelEnabled: () => true,
        logger: { info() {} },
    })({ query: { penalties: "all" } }, storedResponse)

    assert.equal(liveReads, 0)
    assert.equal(
        JSON.stringify(storedResponse.body),
        JSON.stringify(liveResponse.body)
    )
    assert.deepEqual(
        calls.find(({ dao }) => dao === "findRatingEventsInRange").extra,
        { includeHistory: true, allTime: true }
    )
})

for (const fallback of [
    { name: "stale", value: { stale: "stale_count" }, reason: "stale_count" },
    { name: "error", error: new Error("read failed"), reason: "error" },
    { name: "disabled", value: null, reason: "disabled", enabled: false },
]) {
    test(`endpoint cae al timeline vivo con read model ${fallback.name}`, async () => {
        let liveReads = 0
        let storedReads = 0
        const logs = []
        const res = response()
        await createGetRatingsUpsets({
            retrieveAllMatches: async () => {
                liveReads += 1
                return contextHistory()
            },
            retrieveAllUsers: async () => [],
            retrieveStoredPeriod: async () => {
                storedReads += 1
                if (fallback.error) throw fallback.error
                return fallback.value
            },
            readModelEnabled: () => fallback.enabled !== false,
            logger: {
                info: (...args) => logs.push(args),
                warn: (...args) => logs.push(args),
            },
        })({ query: { penalties: "all" } }, res)

        assert.equal(liveReads, 1)
        assert.equal(storedReads, fallback.enabled === false ? 0 : 1)
        assert.equal(res.body.success, true)
        assert.equal(logs[0][1].endpoint, "ratings_upsets")
        assert.equal(logs[0][1].source, "live")
        assert.equal(logs[0][1].reason, fallback.reason)
    })
}

test("la proyección histórica contiene todo el ranking sin payload extra", () => {
    const projection = findRatingEventsInRange.RATING_EVENTS_HISTORY_PROJECTION
    for (const field of [
        "seq",
        "time",
        "matchId",
        "tournamentId",
        "playedAtPrecision",
        "type",
        "kind",
        "shootoutP1",
        "shootoutP2",
        "p1.team",
        "p1.teamId",
        "p2.team",
        "p2.teamId",
    ]) {
        assert.match(
            projection,
            new RegExp(`(^| )${field.replace(".", "\\.")}( |$)`)
        )
    }
    assert.doesNotMatch(projection, / computedAt( |$)/)
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
    t.mock.method(matchesModel, "find", () => ({ lean: async () => [] }))
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

test("GET /api/ratings/upsets es público y rechaza queries inválidas", async (t) => {
    await withApp(t, async (baseUrl) => {
        const result = await globalThis.fetch(`${baseUrl}/api/ratings/upsets`)
        assert.equal(result.status, 200)
        assert.deepEqual(await result.json(), {
            success: true,
            data: {
                total: 0,
                players: [],
                tournaments: [],
                upsets: [],
            },
        })

        for (const query of [
            "extra=1",
            "dateFrom=2026-02-02&dateTo=2026-02-01",
            "penalties=bad",
            "limit=10",
        ]) {
            const invalid = await globalThis.fetch(
                `${baseUrl}/api/ratings/upsets?${query}`
            )
            assert.equal(invalid.status, 400)
        }
    })
})

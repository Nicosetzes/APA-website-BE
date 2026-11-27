"use strict"

process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const { once } = require("node:events")
const test = require("node:test")

const { createApp } = require("../app")
const {
    createGetRatingsTournaments,
} = require("../controller/getRatingsTournaments")
const matchesModel = require("../dao/models/matches")
const tournamentsModel = require("../dao/models/tournaments")
const usersModel = require("../dao/models/users")
const {
    buildTournamentComparisonsPayload,
} = require("../service/playerRatings/tournaments")
const {
    createRetrieveStoredPeriod,
} = require("../service/ratingsReadModel/createRetrieveStoredPeriod")
const {
    invalidate: invalidateRatingMatches,
} = require("../service/retrieveRatingMatches")
const { historyDaos } = require("./fixtures/ratingsHistory")
const { contextHistory } = require("./fixtures/ratingsStore")
const { storedDocsFrom } = require("./fixtures/ratingsReadModel")

const CONFIG = {
    version: "test",
    initialRating: 1500,
    scale: 400,
    kFactor: 20,
    marginWeight: 0,
    teamStrengthWeight: 25,
    provisionalMatches: 10,
}

const A = { id: "a", name: "Ana partido" }
const B = { id: "b", name: "Beto" }
const C = { id: "c", name: "Caro" }
const D = { id: "d", name: "Dani" }
const T1 = "111111111111111111111111"
const T2 = "222222222222222222222222"
const T3 = "333333333333333333333333"
const T4 = "444444444444444444444444"
const T5 = "555555555555555555555555"

const side = (player, teamOverall) => ({
    ...player,
    before: 1500,
    games: 0,
    ...(teamOverall === undefined ? {} : { teamOverall }),
})

const event = ({
    seq,
    tournamentId,
    tournament = null,
    time = Date.UTC(2026, 0, seq),
    playedAtPrecision = "exact",
    p1 = A,
    p2 = B,
    p1Overall,
    p2Overall,
    expectedP1 = 0.5,
    resultP1 = 0.5,
    delta = 0,
    ...extra
}) => ({
    seq,
    matchId: `m${seq}`,
    tournamentId,
    tournament,
    time,
    playedAtPrecision,
    expectedP1,
    resultP1,
    delta,
    p1: side(p1, p1Overall),
    p2: side(p2, p2Overall),
    ...extra,
})

const source = () => ({
    periodEvents: [
        event({
            seq: 1,
            tournamentId: T1,
            p1Overall: 80,
            p2Overall: 80,
            expectedP1: 0.6,
            resultP1: 1,
            delta: 10,
            playedAtPrecision: "day",
        }),
        event({
            seq: 2,
            tournamentId: T1,
            tournament: "Copa histórica",
            p1: B,
            p2: A,
            p1Overall: 80,
            p2Overall: 70,
            expectedP1: 0.7,
            resultP1: 1,
            delta: 8,
        }),
        // Otro torneo entre dos partidos de T1. Sus números extremos detectan
        // cualquier agregado incorrecto por rango contiguo.
        event({
            seq: 3,
            tournamentId: T2,
            tournament: "Torneo breve",
            p2: C,
            expectedP1: 0.9,
            resultP1: 0,
            delta: -99,
        }),
        event({
            seq: 4,
            tournamentId: T1,
            tournament: "Copa histórica",
            expectedP1: 0.5,
            resultP1: 0.5,
            delta: 2,
        }),
        event({
            seq: 5,
            tournamentId: T1,
            tournament: "Copa histórica",
            p1Overall: 80,
            p2Overall: 80,
            expectedP1: 0.5,
            resultP1: 0.5,
            delta: 0,
            shootoutP1: 5,
            shootoutP2: 4,
        }),
        event({
            seq: 6,
            tournamentId: T1,
            tournament: "Copa histórica",
            p1Overall: 70,
            p2Overall: 80,
            expectedP1: 0.2,
            resultP1: 0,
            delta: -4,
        }),
        event({
            seq: 7,
            tournamentId: T1,
            tournament: "Copa histórica",
            p1: B,
            p2: A,
            p1Overall: 70,
            p2Overall: 80,
            expectedP1: 0.4,
            resultP1: 0,
            delta: -6,
            playedAtPrecision: "approx",
        }),
        event({
            seq: 8,
            tournamentId: T3,
            tournament: "Ajuste neutro",
            p2: C,
            p1Overall: 80,
            p2Overall: 80,
            expectedP1: 0.6,
            resultP1: 1,
            delta: 1,
        }),
        event({
            seq: 9,
            tournamentId: T3,
            tournament: "Ajuste neutro",
            p2: C,
            p1Overall: 80,
            p2Overall: 80,
            expectedP1: 0.4,
            resultP1: 0,
            delta: -1,
        }),
        event({
            seq: 10,
            tournamentId: T4,
            p1: C,
            p2: D,
            time: null,
            playedAtPrecision: null,
            resultP1: 1,
            delta: 3,
        }),
        event({ seq: 11, tournamentId: undefined, tournament: "Sin id" }),
        event({
            seq: 12,
            tournamentId: T5,
            tournament: "Rango parcial",
            time: null,
            playedAtPrecision: null,
        }),
        event({
            seq: 13,
            tournamentId: T5,
            tournament: "Rango parcial",
            playedAtPrecision: "month",
        }),
        event({
            seq: 14,
            tournamentId: T5,
            tournament: "Rango parcial",
            time: null,
            playedAtPrecision: null,
        }),
    ],
    config: CONFIG,
    names: new Map([["a", "Ana"]]),
})

const performance = (payload, tournamentId, playerId) =>
    payload.data.performances.find(
        (row) => row.tournamentId === tournamentId && row.playerId === playerId
    )

const response = () => ({
    body: null,
    json(body) {
        this.body = body
        return body
    },
})

test("agrega cada actuación solo con los eventos de su tournamentId y orienta P1/P2", () => {
    const payload = buildTournamentComparisonsPayload(source())
    const ana = performance(payload, T1, "a")
    const beto = performance(payload, T1, "b")

    assert.deepEqual(ana, {
        tournamentId: T1,
        playerId: "a",
        matches: 6,
        record: { wins: 2, draws: 2, losses: 2 },
        ratingChange: 6,
        actualPercentage: 50,
        expectedPercentage: 45,
        differencePercentagePoints: 5,
        teamAdjustmentPercentagePoints: -5,
        comparable: true,
    })
    assert.deepEqual(beto.record, { wins: 2, draws: 2, losses: 2 })
    assert.equal(beto.ratingChange, -6)
    assert.equal(beto.actualPercentage, 50)
    assert.equal(beto.expectedPercentage, 55)
    assert.equal(beto.differencePercentagePoints, -5)
    assert.equal(beto.teamAdjustmentPercentagePoints, 5)

    assert.equal(performance(payload, T2, "a").matches, 1)
    assert.equal(performance(payload, T2, "a").ratingChange, -99)
    assert.equal(
        payload.data.tournaments.some(({ id }) => id === undefined),
        false
    )
})

test("marca muestras menores, conserva penales como empate y distingue ajuste null de cero", () => {
    const payload = buildTournamentComparisonsPayload(source())

    assert.equal(performance(payload, T1, "a").comparable, true)
    assert.equal(performance(payload, T2, "a").comparable, false)
    assert.equal(
        performance(payload, T2, "a").teamAdjustmentPercentagePoints,
        null
    )
    assert.equal(
        performance(payload, T3, "a").teamAdjustmentPercentagePoints,
        0
    )
    assert.equal(
        performance(payload, T3, "c").teamAdjustmentPercentagePoints,
        0
    )
    assert.equal(
        performance(payload, T4, "c").teamAdjustmentPercentagePoints,
        null
    )
})

test("normaliza identidades, nombres y rangos sin inventar precisión faltante", () => {
    const payload = buildTournamentComparisonsPayload(source())
    const tournament = payload.data.tournaments.find(({ id }) => id === T1)
    const incomplete = payload.data.tournaments.find(({ id }) => id === T4)
    const partialRange = payload.data.tournaments.find(({ id }) => id === T5)

    assert.deepEqual(
        payload.data.players.find(({ id }) => id === "a"),
        {
            id: "a",
            name: "Ana",
        }
    )
    assert.deepEqual(tournament, {
        id: T1,
        name: "Copa histórica",
        firstPlayedAt: "2026-01-01T00:00:00.000Z",
        firstPlayedAtPrecision: "day",
        lastPlayedAt: "2026-01-07T00:00:00.000Z",
        lastPlayedAtPrecision: "approx",
    })
    assert.deepEqual(incomplete, {
        id: T4,
        name: null,
        firstPlayedAt: null,
        firstPlayedAtPrecision: null,
        lastPlayedAt: null,
        lastPlayedAtPrecision: null,
    })
    assert.deepEqual(partialRange, {
        id: T5,
        name: "Rango parcial",
        firstPlayedAt: "2026-01-13T00:00:00.000Z",
        firstPlayedAtPrecision: "month",
        lastPlayedAt: "2026-01-13T00:00:00.000Z",
        lastPlayedAtPrecision: "month",
    })
})

test("endpoint hace una única lectura global con historial ampliado", async () => {
    let storedReads = 0
    let liveReads = 0
    let received
    const res = response()

    await createGetRatingsTournaments({
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
    })({ query: {} }, res)

    assert.equal(storedReads, 1)
    assert.equal(liveReads, 0)
    assert.equal(received.allTime, true)
    assert.equal(received.includeHistory, true)
    assert.deepEqual(res.body.data, {
        players: [],
        tournaments: [],
        performances: [],
    })
})

test("endpoint persistido coincide con el cálculo vivo sin leer partidos", async () => {
    const matches = contextHistory()
    const liveResponse = response()
    await createGetRatingsTournaments({
        retrieveAllMatches: async () => matches,
        retrieveAllUsers: async () => [],
    })({ query: {} }, liveResponse)

    let liveReads = 0
    const calls = []
    const storedResponse = response()
    await createGetRatingsTournaments({
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
    })({ query: {} }, storedResponse)

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
]) {
    test(`endpoint cae al cálculo vivo ante ${fallback.name} del read model`, async () => {
        let liveReads = 0
        const logs = []
        const res = response()
        await createGetRatingsTournaments({
            retrieveAllMatches: async () => {
                liveReads += 1
                return contextHistory()
            },
            retrieveAllUsers: async () => [],
            retrieveStoredPeriod: async () => {
                if (fallback.error) throw fallback.error
                return fallback.value
            },
            readModelEnabled: () => true,
            logger: {
                info: (...args) => logs.push(args),
                warn: (...args) => logs.push(args),
            },
        })({ query: {} }, res)

        assert.equal(liveReads, 1)
        assert.equal(res.body.success, true)
        assert.equal(logs[0][1].endpoint, "ratings_tournaments")
        assert.equal(logs[0][1].source, "live")
        assert.equal(logs[0][1].reason, fallback.reason)
    })
}

const ROUTE_MATCHES = [
    {
        _id: "route-1",
        playerP1: A,
        scoreP1: 2,
        playerP2: B,
        scoreP2: 1,
        tournament: { id: T1, name: "Copa histórica" },
        type: "regular",
        playedAt: new Date("2026-01-01T15:00:00Z"),
        playedAtPrecision: "day",
    },
]

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
    t.mock.method(matchesModel, "find", () => ({
        lean: async () => ROUTE_MATCHES,
    }))
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

test("GET /api/ratings/tournaments es público, agregado y no acepta parámetros", async (t) => {
    await withApp(t, async (baseUrl) => {
        const result = await globalThis.fetch(
            `${baseUrl}/api/ratings/tournaments`
        )
        assert.equal(result.status, 200)
        const body = await result.json()
        assert.equal(body.success, true)
        assert.equal(body.data.tournaments[0].id, T1)
        assert.equal(body.data.performances.length, 2)
        assert.equal(body.data.performances[0].matches, 1)
        assert.equal(body.data.performances[0].comparable, false)

        const invalid = await globalThis.fetch(
            `${baseUrl}/api/ratings/tournaments?extra=1`
        )
        assert.equal(invalid.status, 400)
    })
})

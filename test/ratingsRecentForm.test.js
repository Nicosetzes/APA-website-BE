"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
    createGetRatingsRecentForm,
} = require("../controller/getRatingsRecentForm")
const { rankPlayers } = require("../service/playerRatings")
const { buildRatingsTimeline } = require("../service/playerRatings/timeline")
const {
    buildRecentFormPayload,
} = require("../service/playerRatings/recentForm")
const {
    createRetrieveStoredPeriod,
} = require("../service/ratingsReadModel/createRetrieveStoredPeriod")
const { historyDaos } = require("./fixtures/ratingsHistory")
const { storedDocsFrom } = require("./fixtures/ratingsReadModel")

const A = { id: "a", name: "Ana" }
const B = { id: "b", name: "Beto" }
const C = { id: "c", name: "Caro" }

const match = (id, p1, scoreP1, p2, scoreP2, day) => ({
    _id: id,
    playerP1: p1,
    scoreP1,
    playerP2: p2,
    scoreP2,
    playedAt: new Date(`2026-01-${String(day).padStart(2, "0")}T15:00:00Z`),
    type: "regular",
})

const MATCHES = [
    match("m1", A, 2, B, 0, 1),
    match("m2", A, 1, C, 1, 2),
    match("m3", B, 3, C, 0, 3),
    match("m4", C, 1, A, 0, 4),
    match("m5", B, 1, A, 1, 5),
    match("m6", C, 0, B, 2, 6),
]

const MATCHES_WITH_UNDATED = [
    {
        ...match("000000000000000000000001", A, 2, B, 0, 1),
        playedAt: undefined,
    },
    {
        ...match("000000000000000000000002", C, 1, A, 1, 2),
        playedAt: undefined,
    },
    match("000000000000000000000003", B, 0, C, 3, 3),
]

const sourceFrom = (matches = MATCHES) => {
    const timeline = buildRatingsTimeline(matches, { teamStrength: null })
    return {
        previousRanking: rankPlayers(timeline.snapshotAt(0)),
        currentRanking: rankPlayers(
            timeline.snapshotAt(Date.UTC(9999, 11, 31))
        ),
        periodEvents: timeline.events.map((event, index) => ({
            ...event,
            seq: index + 1,
        })),
        config: timeline.config,
        names: new Map(),
    }
}

const response = () => ({
    body: null,
    json(body) {
        this.body = body
        return body
    },
})

const row = (payload, id) =>
    payload.data.players.find((player) => player.player.id === id)

test("forma reciente global usa los últimos partidos propios de cada jugador", () => {
    const payload = buildRecentFormPayload(sourceFrom())

    const ana = row(payload, "a").recentForm
    assert.equal(ana[5].matches, 4)
    assert.deepEqual(ana[5].record, { wins: 1, draws: 2, losses: 1 })
    assert.equal(ana[5].actualPercentage, 50)
    assert.equal(ana[10].matches, 4)
    assert.equal(ana[25].matches, 4)

    const beto = row(payload, "b").recentForm
    assert.equal(beto[5].matches, 4)
    assert.deepEqual(beto[5].record, { wins: 2, draws: 1, losses: 1 })
    assert.notEqual(ana[5].ratingChange, beto[5].ratingChange)
})

test("cada jugador tiene su propia ventana aunque cubra fechas diferentes", () => {
    const matches = [
        ...Array.from({ length: 10 }, (_, index) =>
            match(`ab${index}`, A, index < 5 ? 2 : 0, B, 1, index + 1)
        ),
        ...Array.from({ length: 10 }, (_, index) =>
            match(`bc${index}`, B, 2, C, 0, index + 11)
        ),
    ]
    const payload = buildRecentFormPayload(sourceFrom(matches))

    assert.deepEqual(row(payload, "a").recentForm[5].record, {
        wins: 0,
        draws: 0,
        losses: 5,
    })
    assert.deepEqual(row(payload, "c").recentForm[5].record, {
        wins: 0,
        draws: 0,
        losses: 5,
    })
    assert.deepEqual(row(payload, "b").recentForm[5].record, {
        wins: 5,
        draws: 0,
        losses: 0,
    })
})

test("forma reciente conserva conteo interno y métricas nulas sin partidos", () => {
    const source = sourceFrom()
    source.currentRanking.push({ id: "z", name: "Zoe", matches: 0 })
    const metric = row(buildRecentFormPayload(source), "z").recentForm[25]

    assert.deepEqual(metric, {
        matches: 0,
        record: { wins: 0, draws: 0, losses: 0 },
        actualPercentage: null,
        expectedPercentage: null,
        differencePercentagePoints: null,
        ratingChange: null,
    })
})

test("endpoint incluye partidos sin fecha y mantiene paridad entre read model y cálculo vivo", async () => {
    const liveResponse = response()
    await createGetRatingsRecentForm({
        retrieveAllMatches: async () => MATCHES_WITH_UNDATED,
        retrieveAllUsers: async () => [],
    })({ query: {} }, liveResponse)

    let liveReads = 0
    const storedResponse = response()
    const docs = storedDocsFrom(MATCHES_WITH_UNDATED)
    await createGetRatingsRecentForm({
        retrieveAllMatches: async () => {
            liveReads += 1
            return MATCHES_WITH_UNDATED
        },
        retrieveAllUsers: async () => [],
        retrieveStoredPeriod: createRetrieveStoredPeriod(historyDaos(docs)),
        readModelEnabled: () => true,
        logger: { info() {} },
    })({ query: {} }, storedResponse)

    assert.equal(liveReads, 0)
    assert.deepEqual(storedResponse.body, liveResponse.body)
    assert.equal(row(storedResponse.body, "a").recentForm[5].matches, 2)
    assert.equal(row(storedResponse.body, "b").recentForm[5].matches, 2)
    assert.equal(row(storedResponse.body, "c").recentForm[5].matches, 2)
})

test("endpoint cae al cálculo vivo cuando el read model no está fresco", async () => {
    let liveReads = 0
    const logs = []
    const res = response()
    await createGetRatingsRecentForm({
        retrieveAllMatches: async () => {
            liveReads += 1
            return MATCHES_WITH_UNDATED
        },
        retrieveAllUsers: async () => [],
        retrieveStoredPeriod: async () => ({ stale: "stale_count" }),
        readModelEnabled: () => true,
        logger: { info: (...args) => logs.push(args) },
    })({ query: {} }, res)

    assert.equal(liveReads, 1)
    assert.equal(res.body.success, true)
    assert.equal(row(res.body, "a").recentForm[5].matches, 2)
    assert.equal(row(res.body, "b").recentForm[5].matches, 2)
    assert.equal(row(res.body, "c").recentForm[5].matches, 2)
    assert.equal(logs[0][1].endpoint, "ratings_recent_form")
    assert.equal(logs[0][1].source, "live")
    assert.equal(logs[0][1].reason, "stale_count")
})

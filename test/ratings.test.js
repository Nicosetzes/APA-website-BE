process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const { once } = require("node:events")
const test = require("node:test")

const { createApp } = require("../app")
const matchesModel = require("../dao/models/matches")
const usersModel = require("../dao/models/users")
const { createGetRatings } = require("../controller/getRatings")
const { createGetRatingsPeriod } = require("../controller/getRatingsPeriod")
const {
    invalidate: invalidateRatingMatches,
} = require("../service/retrieveRatingMatches")
const { RATING_CONFIG } = require("../config/ratings")

// Lo que gana el ganador de un partido entre iguales, con los K de la config.
const FIRST_WIN = RATING_CONFIG.initialRating + RATING_CONFIG.kFactor / 2
const FIRST_LOSS = RATING_CONFIG.initialRating - RATING_CONFIG.kFactor / 2

const NICO = { id: "n", name: "Nico (partido)" }
const SANTI = { id: "s", name: "Santi" }
const LEO = { id: "l", name: "Leo" }

const USERS = [
    { id: "n", nickname: "Nico" },
    { id: "s", nickname: "Santi" },
    { id: "l", nickname: "Leo" },
]

let sequence = 0
const match = (playerP1, scoreP1, playerP2, scoreP2, playedAt) => ({
    _id: `r${String((sequence += 1)).padStart(4, "0")}`,
    playerP1,
    scoreP1,
    playerP2,
    scoreP2,
    playedAt: new Date(playedAt),
    tournament: { id: "t1", name: "Liga APA" },
    type: "regular",
})

const MATCHES = [
    // Antes de la semana: Nico gana y queda arriba, Santi abajo.
    match(NICO, 2, SANTI, 0, "2026-10-01T15:00:00Z"),
    // En la semana (5 al 11 de octubre): Leo, sin partidos previos, sorprende.
    match(LEO, 1, NICO, 0, "2026-10-06T15:00:00Z"),
    match(NICO, 1, SANTI, 1, "2026-10-08T15:00:00Z"),
    // 23:00 del domingo 11 en Argentina: todavía es la semana.
    match(LEO, 1, SANTI, 0, "2026-10-12T02:00:00Z"),
    // 01:00 del lunes 12 en Argentina: ya es la semana siguiente.
    match(NICO, 5, LEO, 0, "2026-10-12T04:00:00Z"),
]

const createResponse = () => ({
    body: null,
    json(body) {
        this.body = body
        return this
    },
})

const deps = (matches = MATCHES) => ({
    retrieveAllMatches: async () => matches,
    retrieveAllUsers: async () => USERS,
})

test("ratings ranking uses user nicknames and exposes the parameters", async () => {
    const response = createResponse()

    await createGetRatings(deps())({ query: {} }, response)

    const { success, parameters, data } = response.body
    assert.equal(success, true)
    assert.equal(parameters.version, RATING_CONFIG.version)
    assert.equal(parameters.version, "2.0")
    assert.equal(
        parameters.teamStrengthWeight,
        RATING_CONFIG.teamStrengthWeight
    )
    assert.equal(parameters.teamStrengthWeight, 25)
    assert.equal(parameters.initialRating, 1500)
    assert.deepEqual(
        data.map(({ position }) => position),
        [1, 2, 3]
    )
    assert.ok(
        data.every(
            (row, index) => index === 0 || data[index - 1].rating >= row.rating
        )
    )
    assert.ok(
        data.every(({ player }) =>
            ["Nico", "Santi", "Leo"].includes(player.name)
        )
    )
    assert.ok(data.every((row) => row.provisional === true))

    const nico = data.find(({ player }) => player.id === "n")
    assert.equal(nico.matches, 4)
    assert.deepEqual([nico.wins, nico.draws, nico.losses], [2, 1, 1])
    assert.equal(nico.lastPlayedAt, "2026-10-12T04:00:00.000Z")
    assert.ok(nico.peak >= nico.rating)
})

test("ratings ranking is empty when there are no usable matches", async () => {
    const response = createResponse()

    await createGetRatings(deps([]))({ query: {} }, response)

    assert.deepEqual(response.body.data, [])
})

test("ratings period compares the ranking before the first day and after the last day", async () => {
    const response = createResponse()

    await createGetRatingsPeriod(deps())(
        { query: { dateFrom: "2026-10-05", dateTo: "2026-10-11" } },
        response
    )

    const { data, dateFrom, dateTo } = response.body
    assert.equal(dateFrom, "2026-10-05")
    assert.equal(dateTo, "2026-10-11")
    // Entran los 3 partidos de la semana, incluido el del domingo 23:00 ART.
    assert.equal(data.matchesInPeriod, 3)

    const byName = Object.fromEntries(
        data.players.map((row) => [row.player.name, row])
    )

    // Antes de la semana sólo existían Nico (1°) y Santi (2°).
    assert.equal(byName.Nico.previousPosition, 1)
    assert.equal(byName.Santi.previousPosition, 2)
    assert.equal(byName.Leo.previousPosition, null)
    assert.equal(byName.Leo.previousRating, null)
    assert.equal(byName.Leo.positionChange, null)

    assert.equal(byName.Nico.previousRating, FIRST_WIN)
    assert.equal(byName.Santi.previousRating, FIRST_LOSS)

    // La variación es la diferencia entre el rating final y el inicial.
    for (const row of data.players) {
        assert.equal(
            Math.round((row.rating - (row.previousRating ?? 1500)) * 10) / 10,
            row.ratingChange
        )
    }

    assert.deepEqual(byName.Nico.record, { wins: 0, draws: 1, losses: 1 })
    assert.equal(byName.Nico.matchesInPeriod, 2)
    assert.deepEqual(byName.Leo.record, { wins: 2, draws: 0, losses: 0 })
    assert.equal(byName.Leo.matchesInPeriod, 2)

    // Posiciones consecutivas y variación = previa - actual.
    assert.deepEqual(
        data.players.map(({ position }) => position),
        [1, 2, 3]
    )
    for (const row of data.players) {
        if (row.previousPosition !== null) {
            assert.equal(
                row.positionChange,
                row.previousPosition - row.position
            )
        }
    }
})

test("ratings period reports the biggest upset and ignores draws", async () => {
    const response = createResponse()

    await createGetRatingsPeriod(deps())(
        { query: { dateFrom: "2026-10-05", dateTo: "2026-10-11" } },
        response
    )

    const upset = response.body.data.highlights.biggestUpset
    assert.equal(upset.winner.name, "Leo")
    assert.equal(upset.loser.name, "Nico")
    assert.deepEqual(upset.score, { winner: 1, loser: 0 })
    assert.equal(upset.tournament, "Liga APA")
    // Leo (1500) le ganó a Nico, que venía de ganar: esperaba menos de 0,5.
    assert.ok(
        upset.winnerExpectedScore < 0.5 && upset.winnerExpectedScore > 0.45
    )
    assert.ok(upset.ratingSwing > RATING_CONFIG.kFactor / 2)
})

test("ratings period has no upset when the favorite always wins", async () => {
    const response = createResponse()

    await createGetRatingsPeriod(deps())(
        { query: { dateFrom: "2026-10-01", dateTo: "2026-10-01" } },
        response
    )

    // Un solo partido entre iguales: el ganador esperaba 0,5, no es sorpresa.
    assert.equal(response.body.data.matchesInPeriod, 1)
    assert.equal(response.body.data.highlights.biggestUpset, null)
})

test("ratings period with no matches still returns the standing with zero changes", async () => {
    const response = createResponse()

    await createGetRatingsPeriod(deps())(
        { query: { dateFrom: "2026-11-01", dateTo: "2026-11-07" } },
        response
    )

    assert.equal(response.body.data.matchesInPeriod, 0)
    assert.equal(response.body.data.players.length, 3)
    assert.ok(response.body.data.players.every((row) => row.ratingChange === 0))
    assert.ok(
        response.body.data.players.every((row) => row.positionChange === 0)
    )
})

const withApp = async (t, callback) => {
    // El historial se guarda unos segundos en memoria: cada test parte de cero.
    invalidateRatingMatches()
    t.after(invalidateRatingMatches)
    // Los ratings leen el historial con `find(...).lean()`.
    t.mock.method(matchesModel, "find", () => ({ lean: async () => MATCHES }))
    t.mock.method(usersModel, "find", async () => USERS)

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

test("GET /api/ratings and /api/ratings/period are public and routed", async (t) => {
    await withApp(t, async (baseUrl) => {
        const ranking = await globalThis.fetch(`${baseUrl}/api/ratings`)
        assert.equal(ranking.status, 200)
        assert.equal((await ranking.json()).data.length, 3)

        const period = await globalThis.fetch(
            `${baseUrl}/api/ratings/period?dateFrom=2026-10-05&dateTo=2026-10-11`
        )
        assert.equal(period.status, 200)
        assert.equal((await period.json()).data.matchesInPeriod, 3)
    })
})

test("GET /api/ratings/period validates the dates", async (t) => {
    await withApp(t, async (baseUrl) => {
        for (const query of [
            "",
            "dateFrom=2026-10-05",
            "dateTo=2026-10-11",
            "dateFrom=05-10-2026&dateTo=11-10-2026",
            "dateFrom=10-05-2026&dateTo=10-11-2026",
            "dateFrom=2026-02-30&dateTo=2026-03-01",
            "dateFrom=2026-10-11&dateTo=2026-10-05",
            "dateFrom=2026-10-05&dateTo=2026-10-11&extra=1",
        ]) {
            const response = await globalThis.fetch(
                `${baseUrl}/api/ratings/period?${query}`
            )
            assert.equal(response.status, 400, query)
        }

        const reversed = await globalThis.fetch(
            `${baseUrl}/api/ratings/period?dateFrom=2026-10-11&dateTo=2026-10-05`
        )
        assert.match(
            (await reversed.json()).error.message,
            /no puede ser anterior/
        )

        const withParams = await globalThis.fetch(`${baseUrl}/api/ratings?x=1`)
        assert.equal(withParams.status, 400)
    })
})

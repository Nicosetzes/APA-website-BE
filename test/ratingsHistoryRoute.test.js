"use strict"

process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const { once } = require("node:events")
const test = require("node:test")

const { createApp } = require("../app")
const matchesModel = require("../dao/models/matches")
const tournamentsModel = require("../dao/models/tournaments")
const usersModel = require("../dao/models/users")
const {
    invalidate: invalidateRatingMatches,
} = require("../service/retrieveRatingMatches")

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
    _id: `h${String((sequence += 1)).padStart(4, "0")}`,
    playerP1,
    scoreP1,
    playerP2,
    scoreP2,
    playedAt: new Date(playedAt),
    tournament: { id: "t1", name: "Liga APA" },
    type: "regular",
})

const MATCHES = [
    match(NICO, 2, SANTI, 0, "2026-10-01T15:00:00Z"),
    match(LEO, 1, NICO, 0, "2026-10-06T15:00:00Z"),
    match(NICO, 1, SANTI, 1, "2026-10-08T15:00:00Z"),
    match(LEO, 1, SANTI, 0, "2026-10-12T02:00:00Z"),
    match(NICO, 5, LEO, 0, "2026-10-12T04:00:00Z"),
]

const MONGO_ID = "0123456789abcdef01234567"
const RANGE = "dateFrom=2026-10-05&dateTo=2026-10-11"

const withApp = async (t, callback) => {
    // El historial se guarda unos segundos en memoria: cada test parte de cero.
    invalidateRatingMatches()
    t.after(invalidateRatingMatches)
    // Solo se mockean `matches` y `users`: el ranking se lee en vivo, no de los
    // ratings persistidos (que tocarían la base).
    const previousReadModel = process.env.RATING_READ_MODEL
    process.env.RATING_READ_MODEL = "off"
    t.after(() => {
        if (previousReadModel === undefined)
            delete process.env.RATING_READ_MODEL
        else process.env.RATING_READ_MODEL = previousReadModel
    })
    t.mock.method(matchesModel, "find", () => ({ lean: async () => MATCHES }))
    t.mock.method(tournamentsModel, "find", () => ({ lean: async () => [] }))
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

test("GET /api/ratings/history es público y responde el historial del período", async (t) => {
    await withApp(t, async (baseUrl) => {
        const response = await globalThis.fetch(
            `${baseUrl}/api/ratings/history?${RANGE}`
        )
        assert.equal(response.status, 200)

        const body = await response.json()
        assert.equal(body.success, true)
        assert.deepEqual(body.scope, { type: "period", tournament: null })
        assert.equal(body.data.matchesInPeriod, 3)
        assert.deepEqual(
            body.data.matchesTimeline.map((item) => item.x),
            [1, 2, 3]
        )
        assert.equal(body.data.players.length, 3)
        const nico = body.data.players.find((row) => row.player.id === "n")
        assert.equal(nico.player.name, "Nico")
        assert.equal(nico.points.length, 2)
    })
})

test("GET /api/ratings/history valida los parámetros", async (t) => {
    await withApp(t, async (baseUrl) => {
        const invalid = [
            "",
            "dateFrom=2026-10-05",
            "dateTo=2026-10-11",
            "dateFrom=05-10-2026&dateTo=11-10-2026",
            "dateFrom=2026-02-30&dateTo=2026-03-01",
            "dateFrom=2026-10-11&dateTo=2026-10-05",
            `${RANGE}&extra=1`,
            // Eliminado del contrato: el endpoint siempre da un punto por partido.
            `${RANGE}&granularity=day`,
            // Reservado para la etapa 2: hoy es un parámetro desconocido.
            `${RANGE}&tournamentId=${MONGO_ID}`,
            `${RANGE}&players=n&players=n`,
            `${RANGE}&players=`,
            `${RANGE}${Array.from(
                { length: 51 },
                (_, i) => `&players=p${i}`
            ).join("")}`,
        ]
        for (const query of invalid) {
            const response = await globalThis.fetch(
                `${baseUrl}/api/ratings/history?${query}`
            )
            assert.equal(response.status, 400, query)
        }

        const reversed = await globalThis.fetch(
            `${baseUrl}/api/ratings/history?dateFrom=2026-10-11&dateTo=2026-10-05`
        )
        const period = await globalThis.fetch(
            `${baseUrl}/api/ratings/period?dateFrom=2026-10-11&dateTo=2026-10-05`
        )
        // Mismo mensaje que /api/ratings/period para el rango invertido.
        const { requestId: _history, ...historyError } = (await reversed.json())
            .error
        const { requestId: _period, ...periodError } = (await period.json())
            .error
        assert.deepEqual(historyError, periodError)
    })
})

test("GET /api/ratings/history acepta players con uno o varios ids y filtra la lista", async (t) => {
    await withApp(t, async (baseUrl) => {
        const fetchPlayers = async (query) => {
            const response = await globalThis.fetch(
                `${baseUrl}/api/ratings/history?${RANGE}${query}`
            )
            assert.equal(response.status, 200, query)
            return (await response.json()).data
        }

        const one = await fetchPlayers("&players=n")
        assert.deepEqual(
            one.players.map((row) => row.player.id),
            ["n"]
        )

        const two = await fetchPlayers("&players=n&players=l")
        assert.deepEqual(two.players.map((row) => row.player.id).sort(), [
            "l",
            "n",
        ])
        // El eje X sigue siendo el de todos los partidos del período.
        assert.equal(two.matchesInPeriod, 3)
        assert.equal(two.matchesTimeline.length, 3)

        const unknown = await fetchPlayers("&players=nadie")
        assert.deepEqual(unknown.players, [])
        assert.equal(unknown.matchesTimeline.length, 3)
    })
})

test("GET /api/ratings/period conserva sus validaciones", async (t) => {
    await withApp(t, async (baseUrl) => {
        for (const query of [
            "",
            "dateFrom=2026-10-05",
            "dateFrom=2026-10-11&dateTo=2026-10-05",
            `${RANGE}&players=n`,
            `${RANGE}&granularity=day`,
        ]) {
            const response = await globalThis.fetch(
                `${baseUrl}/api/ratings/period?${query}`
            )
            assert.equal(response.status, 400, query)
        }
        const ok = await globalThis.fetch(
            `${baseUrl}/api/ratings/period?${RANGE}`
        )
        assert.equal(ok.status, 200)
    })
})

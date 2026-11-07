"use strict"
// Equipos, tipo de cruce y tanda de penales en `GET /api/ratings/history`: salen
// del evento (guardado o del motor), con la misma orientación que `score`,
// iguales en el camino guardado y en el vivo, sin leer partidos y sin romper a
// `/api/ratings/period`.
const assert = require("node:assert/strict")
const test = require("node:test")
const { createGetRatingsHistory } = require("../controller/getRatingsHistory")
const findRatingEventsInRange = require("../dao/findRatingEventsInRange")
const {
    createRetrieveStoredPeriod,
} = require("../service/ratingsReadModel/createRetrieveStoredPeriod")
const { computeFingerprint } = require("../service/ratingsStore/fingerprint")
const {
    bothHistoryResponses,
    historyDaos,
} = require("./fixtures/ratingsHistory")
const {
    DEFAULT_USERS,
    bothPeriodResponses,
    createResponse,
    makeLogger,
    periodDaos,
} = require("./fixtures/ratingsPeriod")
const { storedDocsFrom } = require("./fixtures/ratingsReadModel")
const { match, objectId } = require("./fixtures/ratingsStore")

const P = (id) => ({ id, name: id.toUpperCase() })
const A = P("a")
const B = P("b")
const C = P("c")

const BOCA = { id: 1, name: "Boca" }
const RIVER = { id: 2, name: "River" }
const LANUS = { id: 3, name: "Lanús" }

const QUERY = { dateFrom: "2026-03-05", dateTo: "2026-03-06" }

// a le gana a b antes del período. En el período: b (Boca) le gana a a (River)
// de sorpresa, a (Lanús, P1) le gana a c (sin equipo, P2) y a (P1) empata con c
// con equipo en blanco.
const MATCHES = [
    match(1, A, 3, B, 0, "2026-03-01T12:00:00Z"),
    match(2, B, 2, A, 1, "2026-03-05T12:00:00Z", {
        teamP1: BOCA,
        teamP2: RIVER,
    }),
    match(3, A, 1, C, 0, "2026-03-05T15:00:00Z", {
        teamP1: LANUS,
        teamP2: null,
    }),
    match(4, A, 1, C, 1, "2026-03-06T12:00:00Z", {
        teamP1: { id: 9, name: "   " },
        teamP2: { id: 10, name: 7 },
    }),
]

const playerRow = (body, id) =>
    body.data.players.find((item) => item.player.id === id)
const pointOf = (body, id, n) =>
    playerRow(body, id).points.find(
        (point) => point.matchId === String(objectId(n))
    )

// ---------------------------------------------------------------------------
// Contrato: teams en puntos y sorpresas
// ---------------------------------------------------------------------------

test("teams: el punto lleva id y nombre del equipo propio y del rival, del lado del jugador (P1 y P2)", async () => {
    const { live, stored } = await bothHistoryResponses({
        matches: MATCHES,
        ...QUERY,
    })

    for (const body of [live, stored]) {
        // b es P1 (Boca, id 1) y a es P2 (River, id 2).
        assert.deepEqual(pointOf(body, "b", 2).teams, {
            for: { id: 1, name: "Boca" },
            against: { id: 2, name: "River" },
        })
        assert.deepEqual(pointOf(body, "a", 2).teams, {
            for: { id: 2, name: "River" },
            against: { id: 1, name: "Boca" },
        })
        // Misma orientación que el marcador.
        assert.deepEqual(pointOf(body, "b", 2).score, { for: 2, against: 1 })
        assert.deepEqual(pointOf(body, "a", 2).score, { for: 1, against: 2 })
    }
})

test("teams: un equipo faltante queda en null y un nombre en blanco o que no es texto queda con name null", async () => {
    const { live, stored } = await bothHistoryResponses({
        matches: MATCHES,
        ...QUERY,
    })

    for (const body of [live, stored]) {
        assert.equal(body.success, true)
        assert.deepEqual(pointOf(body, "a", 3).teams, {
            for: { id: 3, name: "Lanús" },
            against: null,
        })
        assert.deepEqual(pointOf(body, "c", 3).teams, {
            for: null,
            against: { id: 3, name: "Lanús" },
        })
        // Nombre en blanco o numérico: el nombre se descarta, el id se conserva.
        assert.deepEqual(pointOf(body, "a", 4).teams, {
            for: { id: 9, name: null },
            against: { id: 10, name: null },
        })
        assert.deepEqual(pointOf(body, "c", 4).teams, {
            for: { id: 10, name: null },
            against: { id: 9, name: null },
        })
    }
})

test("teams: un equipo sin id en el partido da id null y conserva el nombre", async () => {
    const matches = [
        MATCHES[0],
        { ...MATCHES[1], teamP1: { name: "Boca" } },
        { ...MATCHES[2], teamP1: { id: "", name: "Lanús" } },
        MATCHES[3],
    ]
    const { live, stored } = await bothHistoryResponses({
        matches,
        ...QUERY,
    })

    for (const body of [live, stored]) {
        assert.deepEqual(pointOf(body, "b", 2).teams, {
            for: { id: null, name: "Boca" },
            against: { id: 2, name: "River" },
        })
        assert.deepEqual(pointOf(body, "a", 3).teams, {
            for: { id: null, name: "Lanús" },
            against: null,
        })
    }
})

test("teams: la sorpresa ganada y la perdida llevan id y nombre con la orientación del dueño", async () => {
    const { live, stored } = await bothHistoryResponses({
        matches: MATCHES,
        ...QUERY,
    })

    for (const body of [live, stored]) {
        const won = playerRow(body, "b").summary.biggestUpsetWon
        assert.equal(won.matchId, String(objectId(2)))
        assert.deepEqual(won.teams, {
            for: { id: 1, name: "Boca" },
            against: { id: 2, name: "River" },
        })
        assert.deepEqual(won.score, { for: 2, against: 1 })

        const lost = playerRow(body, "a").summary.worstUpsetLost
        assert.equal(lost.matchId, String(objectId(2)))
        assert.deepEqual(lost.teams, {
            for: { id: 2, name: "River" },
            against: { id: 1, name: "Boca" },
        })
        assert.deepEqual(lost.score, { for: 1, against: 2 })
    }
})

test("teams: el camino guardado y el vivo dan exactamente el mismo cuerpo", async () => {
    const { live, stored, calls } = await bothHistoryResponses({
        matches: MATCHES,
        ...QUERY,
    })

    assert.deepEqual(stored, live)
    assert.equal(JSON.stringify(stored), JSON.stringify(live))
    // Y el historial pidió los datos del partido a la consulta guardada.
    const read = calls.find((call) => call.dao === "findRatingEventsInRange")
    assert.deepEqual(read.extra, { includeHistory: true })
})

test("teams: eventos guardados sin nombre de equipo dan solo el id, y el resto del cuerpo igual", async () => {
    const docs = storedDocsFrom(MATCHES)
    for (const event of docs.events) {
        delete event.p1.team
        delete event.p2.team
    }
    const { live, stored } = await bothHistoryResponses({
        matches: MATCHES,
        docs,
        ...QUERY,
    })

    assert.equal(stored.success, true)
    const noTeams = (body) =>
        JSON.parse(
            JSON.stringify(body, (key, value) =>
                key === "teams" ? undefined : value
            )
        )
    assert.deepEqual(noTeams(stored), noTeams(live))
    assert.deepEqual(pointOf(stored, "b", 2).teams, {
        for: { id: 1, name: null },
        against: { id: 2, name: null },
    })
    // Partido sin equipo 2: ese lado queda en null.
    assert.deepEqual(pointOf(stored, "a", 3).teams, {
        for: { id: 3, name: null },
        against: null,
    })
})

test("teams: un evento guardado con team y teamId null (como lo persiste el motor sin equipo) da null", async () => {
    const docs = storedDocsFrom(MATCHES)
    for (const event of docs.events) {
        event.p1.team = null
        event.p2.team = null
        event.p1.teamId = null
        event.p2.teamId = null
    }
    const { stored } = await bothHistoryResponses({
        matches: MATCHES,
        docs,
        ...QUERY,
    })

    assert.deepEqual(pointOf(stored, "b", 2).teams, {
        for: null,
        against: null,
    })
})

// ---------------------------------------------------------------------------
// Paridad guardado == vivo: tipo de cruce, penales e ids de equipo
// ---------------------------------------------------------------------------

const KNOCKOUT = { format: "world_cup", playoffMode: "single" }
const CHAMPIONS = { format: "champions_league", playoffMode: null }

const penalties = (winnerId, won, lost) => ({
    penalties: true,
    teamThatWon: { id: winnerId },
    scoreFromTeamThatWon: won,
    scoreFromTeamThatLost: lost,
})

// Cinco partidos del período con todas las combinaciones que importan:
//   2  eliminación directa (advance), tanda ganada por P1, ids numéricos
//   3  playoff de Champions (win), tanda ganada por P2, id 0 y id string
//   4  playoff sin torneo resoluble (kind null), sin equipo en P1
//   5  play-in de Champions (kind null), id vacío en P1 y sin id en P2
//   6  regular con equipos de ids numéricos
const PARITY_MATCHES = [
    match(1, A, 3, B, 0, "2026-03-01T12:00:00Z"),
    match(2, A, 1, B, 1, "2026-03-05T12:00:00Z", {
        type: "playoff",
        tournamentContext: KNOCKOUT,
        outcome: penalties(1, 5, 4),
    }),
    match(3, B, 2, A, 2, "2026-03-05T13:00:00Z", {
        type: "playoff",
        teamP1: { id: 0, name: "Cero" },
        teamP2: { id: "x7", name: "Siete" },
        tournamentContext: CHAMPIONS,
        outcome: penalties("x7", 4, 3),
    }),
    match(4, A, 1, B, 0, "2026-03-05T14:00:00Z", {
        type: "playoff",
        teamP1: null,
        teamP2: { id: 5, name: "Cinco" },
        tournamentContext: null,
    }),
    match(5, B, 0, A, 1, "2026-03-05T15:00:00Z", {
        type: "playin",
        teamP1: { id: "", name: "Vacío" },
        teamP2: { name: "Sin id" },
        tournamentContext: CHAMPIONS,
    }),
    match(6, A, 2, B, 1, "2026-03-05T16:00:00Z"),
]

test("paridad: guardado y vivo dan el mismo cuerpo con win/advance/null, penales de P1 y de P2 e ids 0/número/string/ausente", async () => {
    const { live, stored, liveReads } = await bothHistoryResponses({
        matches: PARITY_MATCHES,
        ...QUERY,
    })

    assert.equal(liveReads, 0)
    assert.deepEqual(stored, live)
    assert.equal(JSON.stringify(stored), JSON.stringify(live))

    for (const body of [live, stored]) {
        // Tipo de cruce.
        assert.equal(pointOf(body, "a", 2).probability.kind, "advance")
        assert.equal(pointOf(body, "a", 3).probability.kind, "win")
        assert.equal(pointOf(body, "a", 4).probability, null)
        assert.equal(pointOf(body, "a", 5).probability, null)
        assert.equal(pointOf(body, "a", 6).probability.kind, "win")

        // Tanda ganada por P1 (a) y por P2 (a, que en el partido 3 es P2).
        assert.deepEqual(pointOf(body, "a", 2).penalties, {
            for: 5,
            against: 4,
        })
        assert.deepEqual(pointOf(body, "b", 2).penalties, {
            for: 4,
            against: 5,
        })
        assert.deepEqual(pointOf(body, "a", 3).penalties, {
            for: 4,
            against: 3,
        })
        assert.deepEqual(pointOf(body, "b", 3).penalties, {
            for: 3,
            against: 4,
        })
        assert.equal(pointOf(body, "a", 4).penalties, null)
        assert.equal(pointOf(body, "a", 6).penalties, null)

        // Ids: número, 0, string, ausente y vacío.
        assert.deepEqual(pointOf(body, "a", 2).teams, {
            for: { id: 1, name: "Boca" },
            against: { id: 2, name: "River" },
        })
        assert.deepEqual(pointOf(body, "b", 3).teams, {
            for: { id: 0, name: "Cero" },
            against: { id: "x7", name: "Siete" },
        })
        assert.deepEqual(pointOf(body, "a", 4).teams, {
            for: null,
            against: { id: 5, name: "Cinco" },
        })
        assert.deepEqual(pointOf(body, "b", 5).teams, {
            for: { id: null, name: "Vacío" },
            against: { id: null, name: "Sin id" },
        })
    }
})

test("paridad: el historial guardado no lee partidos aunque el lector de partidos lance", async () => {
    const logger = makeLogger()
    const response = createResponse()
    await createGetRatingsHistory({
        retrieveAllMatches: async () => {
            throw new Error("no debe leer partidos")
        },
        retrieveAllUsers: async () => DEFAULT_USERS,
        retrieveStoredPeriod: createRetrieveStoredPeriod(
            historyDaos(storedDocsFrom(PARITY_MATCHES))
        ),
        readModelEnabled: () => true,
        logger,
    })({ query: QUERY }, response)

    assert.equal(response.body.success, true)
    assert.equal(logger.logs[0].source, "stored")
    assert.equal(logger.logs[0].reason, "ok")
    assert.deepEqual(pointOf(response.body, "b", 3).teams.for, {
        id: 0,
        name: "Cero",
    })
    assert.deepEqual(pointOf(response.body, "a", 2).penalties, {
        for: 5,
        against: 4,
    })
})

test("paridad: una huella de esquema 1 cae al cálculo en vivo con el mismo cuerpo", async () => {
    const { live, stored, liveReads, logger } = await bothHistoryResponses({
        matches: PARITY_MATCHES,
        ...QUERY,
        docs: storedDocsFrom(PARITY_MATCHES, {
            fingerprint: computeFingerprint({ schemaVersion: 1 }),
        }),
        retrieveOptions: { fingerprint: computeFingerprint() },
    })

    assert.deepEqual(stored, live)
    assert.equal(liveReads, 1)
    assert.equal(logger.logs[0].source, "live")
    assert.equal(logger.logs[0].reason, "fingerprint_mismatch")
})

// ---------------------------------------------------------------------------
// Política tolerante: eventos guardados sin los campos nuevos o con basura
// ---------------------------------------------------------------------------

const shape = (body) =>
    ["a", "b"].map((id) =>
        playerRow(body, id).points.map((point) => ({
            n: point.matchId,
            teams: point.teams,
            penalties: point.penalties,
            probability: point.probability,
        }))
    )

const expectTolerant = (body) => {
    assert.equal(body.success, true)
    for (const id of ["a", "b"]) {
        for (const point of playerRow(body, id).points) {
            assert.equal(point.penalties, null)
            assert.equal(point.teams.for?.id ?? null, null)
            assert.equal(point.teams.against?.id ?? null, null)
            // Solo los regulares conservan la probabilidad.
            if (point.type === "regular") {
                assert.equal(point.probability.kind, "win")
            } else {
                assert.equal(point.probability, null)
            }
        }
    }
    assert.ok(
        playerRow(body, "a").points.some((point) => point.type !== "regular")
    )
}

test("tolerancia: un evento guardado sin los campos nuevos da ids y penales null, probability solo para regular, sin error", async () => {
    const docs = storedDocsFrom(PARITY_MATCHES)
    for (const event of docs.events) {
        delete event.kind
        delete event.shootoutP1
        delete event.shootoutP2
        delete event.p1.teamId
        delete event.p2.teamId
    }
    const { stored, liveReads } = await bothHistoryResponses({
        matches: PARITY_MATCHES,
        docs,
        ...QUERY,
    })

    assert.equal(liveReads, 0)
    expectTolerant(stored)
    // Los nombres siguen saliendo del evento.
    assert.deepEqual(pointOf(stored, "a", 2).teams, {
        for: { id: null, name: "Boca" },
        against: { id: null, name: "River" },
    })
})

test("tolerancia: un evento guardado con basura (kind 'x', teamId {}, shootoutP1 '3') se trata como sin dato", async () => {
    const docs = storedDocsFrom(PARITY_MATCHES)
    for (const event of docs.events) {
        event.kind = "x"
        event.shootoutP1 = "3"
        event.shootoutP2 = -1
        event.p1.teamId = {}
        event.p2.teamId = ["7"]
    }
    const { stored, liveReads } = await bothHistoryResponses({
        matches: PARITY_MATCHES,
        docs,
        ...QUERY,
    })

    assert.equal(liveReads, 0)
    expectTolerant(stored)
    assert.equal(shape(stored).length, 2)
})

// ---------------------------------------------------------------------------
// /api/ratings/period no cambia
// ---------------------------------------------------------------------------

test("period: la consulta A sin includeHistory usa la proyección de siempre y los eventos no traen datos del historial", async () => {
    const { RATING_EVENTS_RANGE_PROJECTION: base } = findRatingEventsInRange
    const history = findRatingEventsInRange.RATING_EVENTS_HISTORY_PROJECTION

    // La del historial es la de siempre más exactamente seis paths.
    assert.equal(
        history,
        `${base} p1.team p1.teamId p2.team p2.teamId kind shootoutP1 shootoutP2`
    )
    assert.deepEqual(
        history.split(" ").filter((field) => !base.split(" ").includes(field)),
        [
            "p1.team",
            "p1.teamId",
            "p2.team",
            "p2.teamId",
            "kind",
            "shootoutP1",
            "shootoutP2",
        ]
    )
    for (const field of base.split(" ")) {
        assert.ok(!/team|kind|shootout/i.test(field), field)
    }

    const docs = storedDocsFrom(MATCHES)
    const received = []
    const spy = (daos) => ({
        ...daos,
        findRatingEventsInRange: (...args) => {
            received.push(args)
            return daos.findRatingEventsInRange(...args)
        },
    })
    const retrieve = createRetrieveStoredPeriod(spy(periodDaos(docs)))
    const start = Date.parse("2026-03-05T03:00:00.000Z")
    const end = Date.parse("2026-03-07T03:00:00.000Z")

    const plain = await retrieve({ start, end })
    assert.equal(plain.periodEvents.length, 3)
    for (const event of plain.periodEvents) {
        assert.ok(!("team" in event.p1))
        assert.ok(!("team" in event.p2))
        assert.ok(!("teamId" in event.p1))
        assert.ok(!("teamId" in event.p2))
        assert.ok(!("kind" in event))
        assert.ok(!("shootoutP1" in event))
        assert.ok(!("shootoutP2" in event))
    }
    // Tres argumentos, como antes: sin opciones.
    assert.equal(received.length, 1)
    assert.equal(received[0].length, 3)

    const withHistory = createRetrieveStoredPeriod(spy(historyDaos(docs)))
    const rich = await withHistory({ start, end, includeHistory: true })
    assert.deepEqual(received[1][3], { includeHistory: true })
    assert.deepEqual(
        rich.periodEvents.map((event) => [event.p1.team, event.p2.team]),
        [
            ["Boca", "River"],
            ["Lanús", undefined],
            [undefined, undefined],
        ]
    )
    assert.deepEqual(
        rich.periodEvents.map((event) => [event.p1.teamId, event.p2.teamId]),
        [
            [1, 2],
            [3, undefined],
            [9, 10],
        ]
    )
    assert.deepEqual(
        rich.periodEvents.map((event) => event.kind),
        ["win", "win", "win"]
    )
})

test("period: el modelo recibe la proyección del historial solo si se pide", async () => {
    const calls = []
    const model = {
        find: (filter, projection) => {
            calls.push(projection)
            return { sort: () => ({ lean: async () => [] }) }
        },
    }
    const start = new Date("2026-03-05T03:00:00.000Z")
    const end = new Date("2026-03-07T03:00:00.000Z")
    await findRatingEventsInRange("2.0", start, end, { model })
    await findRatingEventsInRange("2.0", start, end, {
        model,
        includeHistory: true,
    })

    assert.equal(
        calls[0],
        findRatingEventsInRange.RATING_EVENTS_RANGE_PROJECTION
    )
    assert.equal(
        calls[1],
        findRatingEventsInRange.RATING_EVENTS_HISTORY_PROJECTION
    )
})

test("period: la respuesta de /ratings/period con equipos en los eventos guardados es igual a la de en vivo", async () => {
    const { live, stored } = await bothPeriodResponses({
        matches: MATCHES,
        ...QUERY,
    })

    assert.deepEqual(stored, live)
    assert.ok(!JSON.stringify(stored).includes("Boca"))
    assert.ok(!JSON.stringify(stored).includes("teams"))
})

test("exports: dao y service ya no exponen las lecturas auxiliares borradas", () => {
    const dao = require("../dao")
    const service = require("../service")
    const removed = /^(find|retrieve)(EventKind|MatchShootout|MatchTeamId)/
    // Los seis nombres borrados: tres lectores de DAO y tres servicios.
    assert.deepEqual(
        Object.keys(dao).filter((name) => removed.test(name)),
        []
    )
    assert.deepEqual(
        Object.keys(service).filter((name) => removed.test(name)),
        []
    )
    // Lo que sí queda en los barrels sigue cargando.
    assert.ok(Object.keys(dao).length > 0)
    assert.equal(typeof service.retrieveStoredPeriod, "function")
})

// ---------------------------------------------------------------------------
// Tanda de penales
// ---------------------------------------------------------------------------

const SHOOTOUT_MATCHES = [
    match(1, A, 3, B, 0, "2026-03-01T12:00:00Z"),
    match(2, A, 2, B, 2, "2026-03-05T12:00:00Z", {
        type: "playoff",
        teamP1: BOCA,
        teamP2: RIVER,
        tournamentContext: KNOCKOUT,
        // Ganó el equipo 2 (River): la tanda de P1 es la del perdedor.
        outcome: penalties(2, 5, 4),
    }),
    match(3, A, 1, B, 1, "2026-03-05T14:00:00Z"),
]

test("shootouts: el punto trae penales {for, against} desde el punto de vista del jugador; sin tanda, null", async () => {
    const response = createResponse()
    await createGetRatingsHistory({
        retrieveAllMatches: async () => SHOOTOUT_MATCHES,
        retrieveAllUsers: async () => DEFAULT_USERS,
    })({ query: QUERY }, response)
    const body = response.body

    assert.deepEqual(pointOf(body, "a", 2).penalties, { for: 4, against: 5 })
    assert.deepEqual(pointOf(body, "b", 2).penalties, { for: 5, against: 4 })
    assert.deepEqual(pointOf(body, "a", 2).score, { for: 2, against: 2 })
    assert.equal(pointOf(body, "a", 3).penalties, null)
    // Empate por penales: sigue sin ser sorpresa.
    assert.equal(playerRow(body, "a").summary.biggestUpsetWon, null)
})

test("shootouts: el camino guardado y el vivo son idénticos con la tanda resuelta", async () => {
    const { live, stored } = await bothHistoryResponses({
        matches: SHOOTOUT_MATCHES,
        ...QUERY,
    })

    assert.deepEqual(stored, live)
    assert.deepEqual(pointOf(live, "a", 2).penalties, { for: 4, against: 5 })
})

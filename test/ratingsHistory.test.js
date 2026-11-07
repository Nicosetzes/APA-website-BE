"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const { buildPeriodPayload } = require("../controller/getRatingsPeriod")
const { rankPlayers } = require("../service/playerRatings")
const { outcomeProbabilities } = require("../service/playerRatings/outcomes")
const {
    buildHistoryPayload,
    buildTournamentHistoryPayload,
    buildTournamentMarks,
    findPlayerUpsets,
} = require("../service/playerRatings/history")
const { buildRatingsTimeline } = require("../service/playerRatings/timeline")
const { getArgentinaDayRange } = require("../utils/argentinaDay")
const { match, objectId } = require("./fixtures/ratingsStore")

const P = (id) => ({ id, name: id.toUpperCase() })
const A = P("a")
const B = P("b")
const C = P("c")
const D = P("d")
const E = P("e")

// Los mismos insumos que arma el controller (`periodSource`), a partir de los
// partidos: rankings en `start` y `end`, eventos del período con `seq`.
const inputsFor = (matches, { dateFrom, dateTo }) => {
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

// Los mismos insumos con el `kind` del evento de un partido reemplazado (el
// historial lo lee del evento). `undefined` deja el evento sin esa clave.
const withKind = (inputs, matchId, kind) => ({
    ...inputs,
    periodEvents: inputs.periodEvents.map((event) => {
        if (event.matchId !== String(matchId)) return event
        const { kind: _previous, ...rest } = event
        return kind === undefined ? rest : { ...rest, kind }
    }),
})

const historyFor = (matches, window, extra = {}) =>
    buildHistoryPayload({ ...inputsFor(matches, window), ...extra })

const row = (payload, id) =>
    payload.data.players.find((item) => item.player.id === id)

const near = (actual, expected, message) =>
    assert.ok(
        Math.abs(actual - expected) < 0.11,
        `${message ?? ""}: ${actual} != ${expected}`
    )

// a gana el 03-01 (antes del período); el 03-05 a pierde con b (misma hora que
// el partido de c, que debuta); el 03-06 b y c empatan. d y e solo juegan antes.
const SCENARIO = [
    match(1, A, 1, B, 0, "2026-03-01T12:00:00Z"),
    match(2, D, 1, E, 0, "2026-03-01T13:00:00Z"),
    match(3, A, 0, B, 2, "2026-03-05T15:00:00Z"),
    match(4, C, 2, A, 0, "2026-03-05T15:00:00Z"),
    match(5, B, 1, C, 1, "2026-03-06T15:00:00Z"),
]
const WINDOW = { dateFrom: "2026-03-05", dateTo: "2026-03-06" }

test("historial: forma de la respuesta y orden de las claves", () => {
    const payload = historyFor(SCENARIO, WINDOW)

    assert.deepEqual(Object.keys(payload), [
        "success",
        "dateFrom",
        "dateTo",
        "scope",
        "parameters",
        "data",
    ])
    assert.equal(payload.success, true)
    assert.deepEqual(payload.scope, { type: "period", tournament: null })
    assert.equal(payload.parameters.version, "2.0")
    assert.deepEqual(Object.keys(payload.data), [
        "matchesInPeriod",
        "players",
        "matchesTimeline",
        "highlights",
        "tournaments",
    ])
    assert.equal(payload.data.matchesInPeriod, 3)
    assert.deepEqual(Object.keys(row(payload, "a")), [
        "player",
        "start",
        "end",
        "summary",
        "points",
    ])
    assert.deepEqual(Object.keys(row(payload, "a").summary), [
        "ratingChange",
        "min",
        "max",
        "matchesInPeriod",
        "record",
        "position",
        "previousPosition",
        "positionChange",
        "biggestUpsetWon",
        "worstUpsetLost",
        "provisional",
    ])
    assert.deepEqual(Object.keys(row(payload, "a").points[0]), [
        "seq",
        "x",
        "matchId",
        "t",
        "rating",
        "delta",
        "games",
        "tournament",
        "type",
        "opponent",
        "score",
        "penalties",
        "teams",
        "expectedScore",
        "probability",
    ])
})

test("historial: rating después = before ± delta, delta con signo del jugador y esperado del P2", () => {
    const inputs = inputsFor(SCENARIO, WINDOW)
    const payload = buildHistoryPayload(inputs)

    for (const event of inputs.periodEvents) {
        const p1Point = row(payload, event.p1.id).points.find(
            (point) => point.matchId === event.matchId
        )
        const p2Point = row(payload, event.p2.id).points.find(
            (point) => point.matchId === event.matchId
        )

        near(p1Point.rating, event.p1.before + event.delta)
        near(p2Point.rating, event.p2.before - event.delta)
        near(p1Point.delta, event.delta)
        near(p2Point.delta, -event.delta)
        assert.equal(p1Point.delta + p2Point.delta, 0)
        near(p1Point.expectedScore, event.expectedP1)
        near(p2Point.expectedScore, 1 - event.expectedP1)
        assert.equal(p1Point.opponent.id, event.p2.id)
        assert.equal(p2Point.opponent.id, event.p1.id)
        assert.deepEqual(p1Point.score, {
            for: event.scoreP1,
            against: event.scoreP2,
        })
        assert.deepEqual(p2Point.score, {
            for: event.scoreP2,
            against: event.scoreP1,
        })
        assert.equal(p1Point.games, event.p1.games + 1)
        assert.equal(p2Point.games, event.p2.games + 1)
        assert.equal(p1Point.tournament, "Liga APA")
        assert.equal(p1Point.type, "regular")
        assert.ok(p1Point.t.endsWith("Z"))
    }
})

test("historial: la cadena de puntos empalma con start y end", () => {
    const payload = historyFor(SCENARIO, WINDOW)

    for (const player of payload.data.players) {
        if (player.points.length === 0) continue
        const first = player.points[0]
        const last = player.points[player.points.length - 1]
        near(first.rating - first.delta, player.start?.rating ?? 1500)
        assert.equal(last.rating, player.end.rating)
        assert.equal(last.games, player.end.matches)
        for (let index = 1; index < player.points.length; index += 1) {
            const previous = player.points[index - 1]
            const current = player.points[index]
            near(current.rating - current.delta, previous.rating)
            assert.equal(current.games, previous.games + 1)
        }
    }
})

test("historial: x es común y consecutivo (1..N) y matchesTimeline lista todos los partidos", () => {
    const payload = historyFor(SCENARIO, WINDOW)
    const timeline = payload.data.matchesTimeline

    assert.deepEqual(
        timeline.map((item) => item.x),
        [1, 2, 3]
    )
    assert.deepEqual(
        timeline.map((item) => item.seq),
        [3, 4, 5]
    )
    assert.ok(timeline.every((item) => typeof item.t === "string"))

    // b juega los x 1 y 3; c los x 2 y 3: el x es del período, no del jugador.
    assert.deepEqual(
        row(payload, "b").points.map((point) => point.x),
        [1, 3]
    )
    assert.deepEqual(
        row(payload, "c").points.map((point) => point.x),
        [2, 3]
    )
    for (const player of payload.data.players) {
        for (const point of player.points) {
            assert.equal(timeline[point.x - 1].seq, point.seq)
            assert.equal(timeline[point.x - 1].t, point.t)
        }
    }
})

test("historial: los partidos con el mismo playedAt van en el orden del motor (seq)", () => {
    // Mismo instante, ids cargados fuera de orden: el motor desempata por _id.
    const same = "2026-03-05T15:00:00Z"
    const matches = [
        match(1, A, 1, B, 0, "2026-03-01T12:00:00Z"),
        match(30, A, 2, B, 0, same),
        match(10, B, 3, A, 0, same),
        match(20, A, 0, B, 1, same),
    ]
    const inputs = inputsFor(matches, WINDOW)
    // El orden de llegada de los eventos no importa: se ordena por seq.
    const shuffled = [...inputs.periodEvents].reverse()
    const payload = buildHistoryPayload({ ...inputs, periodEvents: shuffled })

    assert.deepEqual(
        payload.data.matchesTimeline.map((item) => item.seq),
        [2, 3, 4]
    )
    assert.deepEqual(
        row(payload, "a").points.map((point) => point.matchId),
        [objectId(10), objectId(20), objectId(30)].map(String)
    )
    assert.deepEqual(
        payload.data.matchesTimeline.map((item) => item.t),
        Array(3).fill("2026-03-05T15:00:00.000Z")
    )
    assert.deepEqual(
        row(payload, "a").points.map((point) => point.x),
        [1, 2, 3]
    )
})

test("historial: un jugador sin partidos en el período sale con puntos vacíos y start igual a end", () => {
    const payload = historyFor(SCENARIO, WINDOW)
    const d = row(payload, "d")

    assert.deepEqual(d.points, [])
    assert.deepEqual(d.start, d.end)
    assert.equal(d.start.matches, 1)
    assert.equal(d.summary.matchesInPeriod, 0)
    assert.equal(d.summary.ratingChange, 0)
    assert.equal(d.summary.min.rating, d.start.rating)
    assert.equal(d.summary.max.rating, d.start.rating)
    assert.deepEqual(d.summary.record, { wins: 0, draws: 0, losses: 0 })
})

test("historial: quien debuta en el período tiene start null y ningún punto anterior", () => {
    const payload = historyFor(SCENARIO, WINDOW)
    const c = row(payload, "c")

    assert.equal(c.start, null)
    assert.equal(c.summary.previousPosition, null)
    assert.equal(c.summary.positionChange, null)
    assert.equal(c.points.length, 2)
    assert.equal(c.points[0].games, 1)
    near(c.points[0].rating - c.points[0].delta, 1500)
    assert.equal(
        c.summary.ratingChange,
        Math.round((c.end.rating - 1500) * 10) / 10
    )
    assert.deepEqual(c.end, { rating: c.points[1].rating, matches: 2 })
    // Un jugador que todavía no debutó al final del período no aparece.
    assert.equal(
        historyFor(SCENARIO, {
            dateFrom: "2026-03-01",
            dateTo: "2026-03-02",
        }).data.players.some((player) => player.player.id === "c"),
        false
    )
})

test("historial: los empates y los penales (resultP1 0,5) cuentan como punto y empate, no como upset", () => {
    const matches = [
        match(1, A, 3, B, 0, "2026-03-01T12:00:00Z"),
        // b (el de menor rating) empata y empata con penales en un playoff.
        match(2, A, 1, B, 1, "2026-03-05T12:00:00Z"),
        match(3, A, 2, B, 2, "2026-03-05T14:00:00Z", { type: "playoff" }),
    ]
    const payload = historyFor(matches, WINDOW)

    for (const id of ["a", "b"]) {
        const player = row(payload, id)
        assert.equal(player.points.length, 2)
        assert.deepEqual(player.summary.record, {
            wins: 0,
            draws: 2,
            losses: 0,
        })
        assert.equal(player.summary.biggestUpsetWon, null)
        assert.equal(player.summary.worstUpsetLost, null)
    }
    assert.equal(payload.data.highlights.biggestUpset, null)
    assert.equal(row(payload, "b").points[1].type, "playoff")
})

test("historial: mayor upset ganado y peor derrota por jugador", () => {
    // Tras el 03-01, a (1506) es favorito de b (1494).
    const matches = [
        match(1, A, 1, B, 0, "2026-03-01T12:00:00Z"),
        match(2, B, 1, A, 0, "2026-03-05T12:00:00Z"),
    ]
    const inputs = inputsFor(matches, WINDOW)
    const payload = buildHistoryPayload(inputs)
    const a = row(payload, "a")
    const b = row(payload, "b")

    // b ganó siendo el menos esperado; a perdió siendo el favorito.
    const upsetEvent = inputs.periodEvents[0]
    assert.ok(upsetEvent.expectedP1 < 0.5)
    assert.equal(b.summary.biggestUpsetWon.matchId, upsetEvent.matchId)
    assert.equal(b.summary.biggestUpsetWon.opponent.id, "a")
    assert.equal(
        b.summary.biggestUpsetWon.expectedScore,
        Math.round(upsetEvent.expectedP1 * 1000) / 1000
    )
    assert.equal(
        b.summary.biggestUpsetWon.ratingSwing,
        Math.round(Math.abs(upsetEvent.delta) * 10) / 10
    )
    assert.deepEqual(b.summary.biggestUpsetWon.score, { for: 1, against: 0 })
    assert.equal(b.summary.worstUpsetLost, null)

    assert.equal(a.summary.worstUpsetLost.matchId, upsetEvent.matchId)
    assert.equal(a.summary.worstUpsetLost.opponent.id, "b")
    assert.deepEqual(a.summary.worstUpsetLost.score, { for: 0, against: 1 })
    assert.ok(a.summary.worstUpsetLost.expectedScore > 0.5)
    assert.equal(a.summary.biggestUpsetWon, null)

    // El mismo partido es la sorpresa del período de /ratings/period.
    assert.equal(
        payload.data.highlights.biggestUpset.matchId,
        upsetEvent.matchId
    )
})

test("historial: ante igual puntaje esperado gana el partido de menor seq", () => {
    const point = (seq, expected, result, delta = 1) => ({
        raw: { rating: 1500, delta, expected, result },
        point: {
            matchId: `m${seq}`,
            seq,
            t: null,
            opponent: { id: "x", name: "X" },
            expectedScore: expected,
            score: { for: 0, against: 0 },
        },
    })
    const upsets = findPlayerUpsets([
        point(1, 0.4, 1),
        point(2, 0.4, 1),
        point(3, 0.45, 1),
        point(4, 0.7, 0),
        point(5, 0.7, 0),
        point(6, 0.6, 0),
        // Ganar siendo favorito o perder siendo no favorito no es upset.
        point(7, 0.8, 1),
        point(8, 0.2, 0),
        point(9, 0.5, 1),
        point(10, 0.5, 0),
        point(11, 0.1, 0.5),
    ])

    assert.equal(upsets.biggestUpsetWon.matchId, "m1")
    assert.equal(upsets.worstUpsetLost.matchId, "m4")
    assert.deepEqual(findPlayerUpsets([]), {
        biggestUpsetWon: null,
        worstUpsetLost: null,
    })
})

test("historial: mínimo y máximo incluyen el rating inicial del período", () => {
    // b solo pierde en el período: su máximo es el rating con que empezó.
    const matches = [
        match(1, B, 1, A, 0, "2026-03-01T12:00:00Z"),
        match(2, A, 1, B, 0, "2026-03-05T12:00:00Z"),
        match(3, A, 2, B, 0, "2026-03-05T13:00:00Z"),
    ]
    const payload = historyFor(matches, WINDOW)
    const b = row(payload, "b")

    assert.deepEqual(b.summary.max, {
        rating: b.start.rating,
        seq: null,
        t: null,
    })
    assert.equal(b.summary.min.rating, b.end.rating)
    assert.equal(b.summary.min.seq, 3)
    assert.equal(b.summary.min.t, b.points[1].t)
    assert.ok(b.summary.min.rating < b.summary.max.rating)

    // a solo sube: su mínimo es donde empezó.
    const a = row(payload, "a")
    assert.deepEqual(a.summary.min, {
        rating: a.start.rating,
        seq: null,
        t: null,
    })
    assert.equal(a.summary.max.rating, a.end.rating)
    assert.equal(a.summary.max.seq, 3)
})

test("historial: quien debuta tiene el rating inicial como candidato de mínimo y máximo", () => {
    const payload = historyFor(
        [match(1, A, 1, B, 0, "2026-03-05T12:00:00Z")],
        WINDOW
    )

    assert.deepEqual(row(payload, "a").summary.min, {
        rating: 1500,
        seq: null,
        t: null,
    })
    assert.equal(row(payload, "a").summary.max.rating, 1506)
    assert.equal(row(payload, "b").summary.min.rating, 1494)
    assert.equal(row(payload, "b").summary.max.rating, 1500)
})

test("historial: período vacío", () => {
    const payload = historyFor(SCENARIO, {
        dateFrom: "2026-04-01",
        dateTo: "2026-04-02",
    })

    assert.equal(payload.data.matchesInPeriod, 0)
    assert.deepEqual(payload.data.matchesTimeline, [])
    assert.equal(payload.data.highlights.biggestUpset, null)
    assert.equal(payload.data.players.length, 5)
    assert.ok(
        payload.data.players.every(
            (player) =>
                player.points.length === 0 &&
                player.summary.ratingChange === 0 &&
                player.start !== null
        )
    )

    // Antes de todo: nadie había jugado todavía.
    const before = historyFor(SCENARIO, {
        dateFrom: "2026-02-01",
        dateTo: "2026-02-02",
    })
    assert.deepEqual(before.data.players, [])
    assert.equal(before.data.matchesInPeriod, 0)
})

test("historial: ratingChange, posiciones y récord coinciden con /ratings/period", () => {
    const inputs = inputsFor(SCENARIO, WINDOW)
    const history = buildHistoryPayload(inputs)
    const period = buildPeriodPayload(inputs)

    assert.equal(history.data.matchesInPeriod, period.data.matchesInPeriod)
    assert.deepEqual(
        history.data.highlights.biggestUpset,
        period.data.highlights.biggestUpset
    )
    assert.deepEqual(
        history.data.players.map((player) => player.player),
        period.data.players.map((player) => player.player)
    )
    for (const periodRow of period.data.players) {
        const player = row(history, periodRow.player.id)
        assert.equal(player.summary.ratingChange, periodRow.ratingChange)
        assert.equal(player.summary.position, periodRow.position)
        assert.equal(
            player.summary.previousPosition,
            periodRow.previousPosition
        )
        assert.equal(player.summary.positionChange, periodRow.positionChange)
        assert.deepEqual(player.summary.record, periodRow.record)
        assert.equal(player.summary.matchesInPeriod, periodRow.matchesInPeriod)
        assert.equal(player.summary.provisional, periodRow.provisional)
        assert.equal(player.end.rating, periodRow.rating)
        assert.equal(player.start?.rating ?? null, periodRow.previousRating)
    }
})

test("historial: el filtro players no cambia x ni matchesTimeline y descarta ids desconocidos", () => {
    const all = historyFor(SCENARIO, WINDOW)
    const only = historyFor(SCENARIO, WINDOW, { playerIds: ["b", "zzz"] })

    assert.deepEqual(
        only.data.players.map((player) => player.player.id),
        ["b"]
    )
    assert.deepEqual(only.data.players[0], row(all, "b"))
    assert.deepEqual(only.data.matchesTimeline, all.data.matchesTimeline)
    assert.equal(only.data.matchesInPeriod, all.data.matchesInPeriod)
    assert.deepEqual(only.data.highlights, all.data.highlights)

    // Sin ids (o con un arreglo vacío) salen todos.
    assert.equal(
        historyFor(SCENARIO, WINDOW, { playerIds: [] }).data.players.length,
        all.data.players.length
    )
    assert.deepEqual(
        historyFor(SCENARIO, WINDOW, { playerIds: ["zzz"] }).data.players,
        []
    )
})

test("historial: usa el apodo del usuario y el nombre del partido si no hay usuario", () => {
    const names = new Map([["a", "Ana (nick)"]])
    const payload = historyFor(SCENARIO, WINDOW, { names })

    assert.equal(row(payload, "a").player.name, "Ana (nick)")
    assert.equal(row(payload, "b").player.name, "B")
    assert.equal(row(payload, "b").points[0].opponent.name, "Ana (nick)")
})

// ---------------------------------------------------------------------------
// Probabilidad previa (win / advance) y ratingChange con signo en los upsets
// ---------------------------------------------------------------------------

const thousandths = (value) => Math.round(value * 1000) / 1000

test("historial: probability de un partido regular es de victoria y el P2 se invierte", () => {
    const inputs = inputsFor(SCENARIO, WINDOW)
    const payload = buildHistoryPayload(inputs)

    for (const event of inputs.periodEvents) {
        const odds = outcomeProbabilities(event.expectedP1)
        const p1Point = row(payload, event.p1.id).points.find(
            (point) => point.matchId === event.matchId
        )
        const p2Point = row(payload, event.p2.id).points.find(
            (point) => point.matchId === event.matchId
        )

        assert.deepEqual(p1Point.probability, {
            kind: "win",
            for: odds.p1Win,
            against: odds.p2Win,
        })
        assert.deepEqual(p2Point.probability, {
            kind: "win",
            for: odds.p2Win,
            against: odds.p1Win,
        })
        // El empate queda afuera: ganar + perder + empatar = 1.
        assert.ok(
            Math.abs(
                p1Point.probability.for +
                    p1Point.probability.against +
                    odds.draw -
                    1
            ) < 1e-9
        )
    }
})

test("historial: upset ganado y perdido traen ratingChange con signo (P1 y P2) y la probabilidad del resultado ocurrido", () => {
    // Tras el 03-01, a (1506) es favorito de b (1494).
    for (const [label, second] of [
        ["underdog es P1", match(2, B, 1, A, 0, "2026-03-05T12:00:00Z")],
        ["underdog es P2", match(2, A, 0, B, 1, "2026-03-05T12:00:00Z")],
    ]) {
        const inputs = inputsFor(
            [match(1, A, 1, B, 0, "2026-03-01T12:00:00Z"), second],
            WINDOW
        )
        const payload = buildHistoryPayload(inputs)
        const won = row(payload, "b").summary.biggestUpsetWon
        const lost = row(payload, "a").summary.worstUpsetLost
        const bPoint = row(payload, "b").points[0]
        const aPoint = row(payload, "a").points[0]

        assert.ok(won.ratingChange > 0, label)
        assert.ok(lost.ratingChange < 0, label)
        assert.equal(won.ratingChange, bPoint.delta, label)
        assert.equal(lost.ratingChange, aPoint.delta, label)
        assert.equal(Math.abs(won.ratingChange), won.ratingSwing, label)
        assert.equal(Math.abs(lost.ratingChange), lost.ratingSwing, label)
        assert.equal(won.ratingChange + lost.ratingChange, 0, label)

        // La probabilidad es del resultado que ocurrió: el ganado usa `for`
        // (chances de ganar siendo el menos esperado) y el perdido `against`
        // (chances de perder siendo el favorito).
        assert.deepEqual(won.probability, bPoint.probability, label)
        assert.deepEqual(lost.probability, aPoint.probability, label)
        assert.equal(won.probability.kind, "win", label)
        assert.ok(won.probability.for < 0.5, label)
        assert.equal(won.probability.for, lost.probability.against, label)
        assert.ok(lost.probability.against < 0.5, label)
        assert.ok(lost.probability.for > lost.probability.against, label)
    }
})

test("historial: un cruce de eliminación (advance) da probabilidad de avanzar que suma 1", () => {
    const matches = [
        match(1, A, 1, B, 0, "2026-03-01T12:00:00Z"),
        match(2, B, 1, A, 0, "2026-03-05T12:00:00Z", { type: "playoff" }),
    ]
    const inputs = withKind(inputsFor(matches, WINDOW), objectId(2), "advance")
    const payload = buildHistoryPayload(inputs)
    const event = inputs.periodEvents[0]
    const forB = thousandths(event.expectedP1)

    const b = row(payload, "b")
    const a = row(payload, "a")
    assert.deepEqual(b.points[0].probability, {
        kind: "advance",
        for: forB,
        against: thousandths(1 - forB),
    })
    assert.deepEqual(a.points[0].probability, {
        kind: "advance",
        for: thousandths(1 - forB),
        against: forB,
    })
    assert.equal(
        b.points[0].probability.for + b.points[0].probability.against,
        1
    )
    // El upset ganado de b: chances de AVANZAR; el de a: de quedar eliminado.
    assert.equal(b.summary.biggestUpsetWon.probability.kind, "advance")
    assert.equal(b.summary.biggestUpsetWon.probability.for, forB)
    assert.equal(a.summary.worstUpsetLost.probability.kind, "advance")
    assert.equal(a.summary.worstUpsetLost.probability.against, forB)
})

test("historial: un partido no regular sin dato de torneo da probability null y el upset sigue", () => {
    const matches = [
        match(1, A, 1, B, 0, "2026-03-01T12:00:00Z"),
        match(2, B, 1, A, 0, "2026-03-05T12:00:00Z", { type: "playoff" }),
    ]
    const inputs = inputsFor(matches, WINDOW)

    // El evento sin `kind` (clave ausente), con `kind: null` o con un valor
    // inválido no da probabilidad para un partido no regular.
    for (const kind of [undefined, null, "x"]) {
        const payload = buildHistoryPayload(withKind(inputs, objectId(2), kind))
        const b = row(payload, "b")
        assert.equal(b.points[0].probability, null)
        assert.ok(b.summary.biggestUpsetWon)
        assert.equal(b.summary.biggestUpsetWon.probability, null)
        assert.ok(b.summary.biggestUpsetWon.ratingChange > 0)
        assert.ok(row(payload, "a").summary.worstUpsetLost.ratingChange < 0)
    }

    // Los regulares no necesitan `kind`: siempre son de victoria.
    const regular = historyFor(SCENARIO, WINDOW)
    assert.ok(
        regular.data.players.every((player) =>
            player.points.every((point) => point.probability?.kind === "win")
        )
    )
})

test("historial: resultP1 0,5 (empate o penales) sigue sin upset pero el punto trae probability", () => {
    const matches = [
        match(1, A, 3, B, 0, "2026-03-01T12:00:00Z"),
        match(2, A, 1, B, 1, "2026-03-05T12:00:00Z"),
        match(3, A, 2, B, 2, "2026-03-05T14:00:00Z", { type: "playoff" }),
    ]
    const inputs = withKind(inputsFor(matches, WINDOW), objectId(3), "advance")
    const payload = buildHistoryPayload(inputs)

    for (const id of ["a", "b"]) {
        const player = row(payload, id)
        assert.equal(player.summary.biggestUpsetWon, null)
        assert.equal(player.summary.worstUpsetLost, null)
        assert.equal(player.points[0].probability.kind, "win")
        assert.equal(player.points[1].probability.kind, "advance")
    }
})

test("historial: findPlayerUpsets agrega teams, ratingChange (delta con signo) y probability", () => {
    const probability = { kind: "win", for: 0.3, against: 0.5 }
    const entry = (seq, expected, result, delta) => ({
        raw: { rating: 1500, delta, expected, result },
        point: {
            matchId: `m${seq}`,
            seq,
            t: null,
            opponent: { id: "x", name: "X" },
            expectedScore: expected,
            score: { for: 0, against: 0 },
            teams: {
                for: { id: 1, name: "Boca" },
                against: { id: 2, name: "River" },
            },
            probability,
        },
    })
    const { biggestUpsetWon, worstUpsetLost } = findPlayerUpsets([
        entry(1, 0.3, 1, 10.04),
        entry(2, 0.7, 0, -7.46),
    ])

    assert.deepEqual(Object.keys(biggestUpsetWon), [
        "matchId",
        "t",
        "opponent",
        "expectedScore",
        "ratingSwing",
        "score",
        "teams",
        "ratingChange",
        "probability",
    ])
    assert.deepEqual(biggestUpsetWon.teams, {
        for: { id: 1, name: "Boca" },
        against: { id: 2, name: "River" },
    })
    assert.equal(biggestUpsetWon.ratingChange, 10)
    assert.equal(biggestUpsetWon.ratingSwing, 10)
    assert.equal(worstUpsetLost.ratingChange, -7.5)
    assert.equal(worstUpsetLost.ratingSwing, 7.5)
    assert.equal(worstUpsetLost.probability, probability)
})

// ---------------------------------------------------------------------------
// Marcas de torneo (data.tournaments) e historial por torneo
// ---------------------------------------------------------------------------

const T1 = "a".repeat(24)
const T2 = "b".repeat(24)
const T3 = "c".repeat(24)
const inTournament = (id, name) => ({ tournament: { id, name } })

// Dos torneos intercalados (T1 y T2), un torneo de un solo partido (T3) y un
// partido sin torneo. C juega T2 entre sus dos partidos de T1; el último
// partido de T1 es a las 02:00Z (todavía el día anterior en Argentina).
const TOURNAMENTS_SCENARIO = [
    match(1, A, 1, B, 0, "2026-03-01T12:00:00Z", inTournament(T1, "Copa A")),
    match(2, C, 2, D, 0, "2026-03-02T15:00:00Z", inTournament(T2, "Copa B")),
    match(3, A, 0, C, 2, "2026-03-03T15:00:00Z", inTournament(T1, "Copa A")),
    match(4, C, 1, D, 1, "2026-03-04T15:00:00Z", inTournament(T2, "Copa B")),
    match(5, C, 3, B, 0, "2026-03-05T15:00:00Z", inTournament(T1, "Copa A")),
    match(6, B, 3, C, 0, "2026-03-07T02:00:00Z", inTournament(T1, "Copa A")),
    match(7, D, 1, E, 0, "2026-03-08T15:00:00Z", inTournament(T3, "Copa C")),
    match(8, E, 2, A, 1, "2026-03-09T15:00:00Z", { tournament: null }),
]
const ALL = { dateFrom: "2026-03-01", dateTo: "2026-03-31" }

// Eventos del motor con `seq`, como los lee `periodSource` en vivo.
const eventsOf = (matches) =>
    buildRatingsTimeline(matches, { teamStrength: null }).events.map(
        (event, index) => ({ ...event, seq: index + 1 })
    )

const tournamentFor = (
    tournamentId,
    extra = {},
    matches = TOURNAMENTS_SCENARIO
) =>
    buildTournamentHistoryPayload({
        config: buildRatingsTimeline(matches, { teamStrength: null }).config,
        names: new Map(),
        tournamentId,
        tournamentEvents: eventsOf(matches).filter(
            (event) => event.tournamentId === tournamentId
        ),
        ...extra,
    })

test("marcas: agrupa por torneo con fromX/toX/matches/fromT/toT, intercaladas y ordenadas", () => {
    const payload = historyFor(TOURNAMENTS_SCENARIO, ALL)

    assert.equal(Object.keys(payload.data).at(-1), "tournaments")
    assert.deepEqual(payload.data.tournaments, [
        {
            id: T1,
            name: "Copa A",
            fromX: 1,
            toX: 6,
            matches: 4,
            fromT: "2026-03-01T12:00:00.000Z",
            toT: "2026-03-07T02:00:00.000Z",
        },
        {
            id: T2,
            name: "Copa B",
            fromX: 2,
            toX: 4,
            matches: 2,
            fromT: "2026-03-02T15:00:00.000Z",
            toT: "2026-03-04T15:00:00.000Z",
        },
        // Torneo de un solo partido.
        {
            id: T3,
            name: "Copa C",
            fromX: 7,
            toX: 7,
            matches: 1,
            fromT: "2026-03-08T15:00:00.000Z",
            toT: "2026-03-08T15:00:00.000Z",
        },
    ])
})

test("marcas: usan el x del período, omiten eventos sin torneo y no cambian el resto de la respuesta", () => {
    const window = { dateFrom: "2026-03-03", dateTo: "2026-03-31" }
    const inputs = inputsFor(TOURNAMENTS_SCENARIO, window)
    const payload = buildHistoryPayload(inputs)

    // Empieza en el partido 3: x = 1 para él.
    assert.deepEqual(
        payload.data.tournaments.map(({ id, fromX, toX, matches }) => [
            id,
            fromX,
            toX,
            matches,
        ]),
        [
            [T1, 1, 4, 3],
            [T2, 2, 2, 1],
            [T3, 5, 5, 1],
        ]
    )
    assert.equal(payload.data.matchesInPeriod, 6)

    // Sacar el torneo de los eventos solo vacía `tournaments`.
    const stripped = buildHistoryPayload({
        ...inputs,
        periodEvents: inputs.periodEvents.map(
            ({ tournamentId: _id, ...event }) => event
        ),
    })
    assert.deepEqual(stripped.data.tournaments, [])
    const { tournaments: _marks, ...rest } = payload.data
    const { tournaments: _none, ...strippedRest } = stripped.data
    assert.deepEqual(rest, strippedRest)
    assert.deepEqual(
        { ...payload, data: undefined },
        { ...stripped, data: undefined }
    )
})

test("marcas: sin eventos o sin torneos da una lista vacía y el nombre es el primero no nulo", () => {
    assert.deepEqual(buildTournamentMarks([]), [])
    assert.deepEqual(
        buildTournamentMarks([
            { seq: 1, time: 0, tournamentId: null, tournament: "X" },
        ]),
        []
    )
    const [mark] = buildTournamentMarks([
        { seq: 1, time: 0, tournamentId: T1, tournament: null },
        { seq: 2, time: 1000, tournamentId: T1, tournament: "Copa" },
        { seq: 3, time: 2000, tournamentId: T1, tournament: "Otro" },
    ])
    assert.equal(mark.name, "Copa")
    assert.equal(mark.fromT, "1970-01-01T00:00:00.000Z")
    assert.equal(mark.toT, "1970-01-01T00:00:02.000Z")
})

test("torneo: forma de la respuesta, x del torneo y fechas argentinas", () => {
    const payload = tournamentFor(T1)

    assert.deepEqual(Object.keys(payload), [
        "success",
        "dateFrom",
        "dateTo",
        "scope",
        "parameters",
        "data",
    ])
    assert.deepEqual(Object.keys(payload.data), [
        "matchesInPeriod",
        "players",
        "matchesTimeline",
        "highlights",
        "tournaments",
    ])
    assert.deepEqual(payload.scope, {
        type: "tournament",
        tournament: { id: T1, name: "Copa A" },
    })
    // El último partido es el 07/03 a las 02:00Z: el 06/03 en Argentina.
    assert.equal(payload.dateFrom, "2026-03-01")
    assert.equal(payload.dateTo, "2026-03-06")
    assert.equal(payload.data.matchesInPeriod, 4)
    assert.deepEqual(
        payload.data.matchesTimeline.map((item) => item.x),
        [1, 2, 3, 4]
    )
    assert.deepEqual(payload.data.tournaments, [
        {
            id: T1,
            name: "Copa A",
            fromX: 1,
            toX: 4,
            matches: 4,
            fromT: "2026-03-01T12:00:00.000Z",
            toT: "2026-03-07T02:00:00.000Z",
        },
    ])
    for (const player of payload.data.players) {
        assert.ok(player.points.every((point) => point.x >= 1 && point.x <= 4))
        assert.equal(player.summary.matchesInPeriod, player.points.length)
    }
})

test("torneo: solo jugadores con partidos del torneo, ordenados por rating final", () => {
    const payload = tournamentFor(T1)
    const ids = payload.data.players.map((item) => item.player.id)

    // D y E no juegan T1.
    assert.deepEqual([...ids].sort(), ["a", "b", "c"])
    const ratings = payload.data.players.map((item) => item.end.rating)
    assert.deepEqual(
        ratings,
        [...ratings].sort((x, y) => y - x)
    )
})

test("torneo: start null para el debutante y estado previo del primer partido del torneo", () => {
    const inputs = tournamentFor(T1)
    const a = row(inputs, "a")
    const c = row(inputs, "c")

    // A y B debutan en el primer partido de T1.
    assert.equal(a.start, null)
    assert.equal(row(inputs, "b").start, null)
    // C ya había jugado un partido (T2): llega a T1 con 1 partido.
    assert.equal(c.start.matches, 1)
    near(c.start.rating, c.points[0].rating - c.points[0].delta)
    assert.equal(c.end.matches, 5)
    assert.equal(c.end.rating, c.points[c.points.length - 1].rating)
    assert.equal(c.points[0].games, 2)
})

test("torneo: ratingChange es la suma de los deltas del torneo, no end - start", () => {
    const payload = tournamentFor(T1)

    for (const player of payload.data.players) {
        const sum = player.points.reduce((acc, point) => acc + point.delta, 0)
        near(player.summary.ratingChange, sum, player.player.id)
    }
    const c = row(payload, "c")
    // C jugó T2 en el medio: la diferencia entre el final y el inicio incluye
    // ese partido.
    assert.ok(
        Math.abs(c.summary.ratingChange - (c.end.rating - c.start.rating)) > 0.2
    )
    // A debuta: parte del rating inicial.
    const a = row(payload, "a")
    near(a.summary.ratingChange, a.end.rating - 1500)
})

test("torneo: posiciones nulas, récord, extremos, provisional y upsets solo del torneo", () => {
    const payload = tournamentFor(T1)

    for (const player of payload.data.players) {
        assert.equal(player.summary.position, null)
        assert.equal(player.summary.previousPosition, null)
        assert.equal(player.summary.positionChange, null)
    }
    const a = row(payload, "a")
    // A en T1: gana a B (partido 1) y pierde con C (partido 3); el partido
    // contra E (sin torneo) no cuenta.
    assert.deepEqual(a.summary.record, { wins: 1, draws: 0, losses: 1 })
    assert.equal(a.summary.matchesInPeriod, 2)
    assert.equal(a.summary.provisional, true)
    assert.ok(a.summary.min.rating <= a.summary.max.rating)
    assert.ok(
        a.points.every((point) => point.tournament === "Copa A"),
        "todos los puntos son de Copa A"
    )

    const upset = payload.data.highlights.biggestUpset
    assert.ok(upset)
    // B (el más flojo) le gana a C en el partido 6.
    assert.equal(upset.matchId, objectId(6).toHexString())
    assert.equal(upset.winner.id, "b")
    assert.equal(upset.tournament, "Copa A")
    assert.equal(
        row(payload, "b").summary.biggestUpsetWon.matchId,
        upset.matchId
    )
    assert.equal(row(payload, "a").summary.biggestUpsetWon, null)
})

test("torneo: el filtro players recorta la lista pero no el eje", () => {
    const payload = tournamentFor(T1, { playerIds: ["a"] })

    assert.deepEqual(
        payload.data.players.map((item) => item.player.id),
        ["a"]
    )
    assert.equal(payload.data.matchesInPeriod, 4)
    assert.equal(payload.data.matchesTimeline.length, 4)

    const none = tournamentFor(T1, { playerIds: ["nadie"] })
    assert.deepEqual(none.data.players, [])
    assert.equal(none.data.matchesTimeline.length, 4)
})

test("torneo: un torneo sin partidos da una respuesta vacía con name null", () => {
    const empty = tournamentFor("f".repeat(24))

    assert.equal(empty.success, true)
    assert.equal(empty.dateFrom, null)
    assert.equal(empty.dateTo, null)
    assert.deepEqual(empty.scope, {
        type: "tournament",
        tournament: { id: "f".repeat(24), name: null },
    })
    assert.equal(empty.data.matchesInPeriod, 0)
    assert.deepEqual(empty.data.players, [])
    assert.deepEqual(empty.data.matchesTimeline, [])
    assert.deepEqual(empty.data.highlights, { biggestUpset: null })
    assert.deepEqual(empty.data.tournaments, [])
})

test("torneo: un torneo de un solo partido tiene una marca con fromX == toX", () => {
    const payload = tournamentFor(T3)

    assert.equal(payload.data.matchesInPeriod, 1)
    assert.equal(payload.dateFrom, "2026-03-08")
    assert.equal(payload.dateTo, "2026-03-08")
    assert.equal(payload.data.tournaments[0].fromX, 1)
    assert.equal(payload.data.tournaments[0].toX, 1)
    assert.equal(payload.data.players.length, 2)
})

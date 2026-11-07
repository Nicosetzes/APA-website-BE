"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const { createGetRatingsHistory } = require("../controller/getRatingsHistory")
const {
    COMBO_WINDOW,
    RANDOM_DAYS,
    RANDOM_FIRST_DAY,
    allWindows,
    bothPeriodResponses,
    comboHistory,
    createResponse,
    daysFrom,
    makeLogger,
    randomHistory,
} = require("./fixtures/ratingsPeriod")
const { bothHistoryResponses } = require("./fixtures/ratingsHistory")
const {
    SOURCE_STATS,
    storedDocsFrom,
    syntheticHistory,
} = require("./fixtures/ratingsReadModel")
const { match } = require("./fixtures/ratingsStore")

const P = (id) => ({ id, name: id.toUpperCase() })

// Compara las dos respuestas de cada ventana y cuenta qué vio, para que los
// barridos puedan comprobar que no son vacíos.
const assertSameForWindows = async (matches, windows, users) => {
    const docs = storedDocsFrom(matches)
    const seen = { windows: 0, withPoints: 0, empty: 0, withDebut: 0 }
    for (const window of windows) {
        const { live, stored, liveReads } = await bothHistoryResponses({
            matches,
            docs,
            users,
            ...window,
        })
        const label = `${window.dateFrom}..${window.dateTo}`
        assert.deepEqual(stored, live, label)
        assert.equal(JSON.stringify(stored), JSON.stringify(live), label)
        assert.equal(liveReads, 0, label)

        seen.windows += 1
        if (live.data.matchesInPeriod > 0) seen.withPoints += 1
        else seen.empty += 1
        if (live.data.players.some((row) => row.start === null)) {
            seen.withDebut += 1
        }
    }
    return seen
}

// ---------------------------------------------------------------------------
// Dorado: el camino guardado devuelve lo mismo que el camino en vivo
// ---------------------------------------------------------------------------

test("dorado: barrido de todas las ventanas sobre syntheticHistory", async () => {
    const days = daysFrom("2025-12-30", 37)
    const seen = await assertSameForWindows(
        syntheticHistory(),
        allWindows(days)
    )

    assert.equal(seen.windows, (37 * 38) / 2)
    assert.ok(seen.empty > 0)
    assert.ok(seen.withPoints > 0)
    assert.ok(seen.withDebut > 0)
})

test("dorado: seq y x coinciden entre caminos y siguen el orden de carga", async () => {
    const { live, stored } = await bothHistoryResponses({
        matches: syntheticHistory(),
        dateFrom: "2026-01-05",
        dateTo: "2026-01-12",
    })

    const timeline = stored.data.matchesTimeline
    assert.ok(timeline.length > 3)
    assert.deepEqual(stored.data.matchesTimeline, live.data.matchesTimeline)
    assert.deepEqual(
        timeline.map((item) => item.x),
        timeline.map((_, index) => index + 1)
    )
    // El seq es el del motor sobre TODO el historial: crece sin repetirse y no
    // arranca en 1 porque hay partidos anteriores al período.
    assert.ok(timeline[0].seq > 1)
    assert.ok(
        timeline.every((item, i) => i === 0 || item.seq > timeline[i - 1].seq)
    )
    for (const [index, item] of timeline.entries()) {
        if (index > 0) assert.ok(item.t >= timeline[index - 1].t)
    }
    for (const player of stored.data.players) {
        for (const point of player.points) {
            assert.equal(timeline[point.x - 1].seq, point.seq)
        }
    }
})

test("dorado: ventana anterior a todo, un solo día, que cubre todo y posterior al último partido", async () => {
    const matches = syntheticHistory()
    const docs = storedDocsFrom(matches)
    const cases = [
        ["antes de todo", "2025-12-01", "2025-12-05"],
        ["un solo día", "2026-01-07", "2026-01-07"],
        ["cubre todo", "2025-01-01", "2026-12-31"],
        ["después del último partido", "2026-03-01", "2026-03-05"],
    ]
    for (const [label, dateFrom, dateTo] of cases) {
        const { live, stored, liveReads } = await bothHistoryResponses({
            matches,
            docs,
            dateFrom,
            dateTo,
        })
        assert.deepEqual(stored, live, label)
        assert.equal(liveReads, 0, label)
    }

    const before = await bothHistoryResponses({
        matches,
        docs,
        dateFrom: "2025-12-01",
        dateTo: "2025-12-05",
    })
    assert.deepEqual(before.stored.data.players, [])
    assert.deepEqual(before.stored.data.matchesTimeline, [])
    assert.equal(before.stored.data.matchesInPeriod, 0)

    const all = await bothHistoryResponses({
        matches,
        docs,
        dateFrom: "2025-01-01",
        dateTo: "2026-12-31",
    })
    assert.equal(all.stored.data.matchesInPeriod, 20)
    assert.equal(all.stored.data.matchesTimeline.length, 20)
    assert.deepEqual(
        all.stored.data.matchesTimeline.map((item) => item.seq),
        Array.from({ length: 20 }, (_, index) => index + 1)
    )
    assert.ok(all.stored.data.players.every((row) => row.start === null))
    assert.equal(
        all.stored.data.players.reduce(
            (sum, row) => sum + row.points.length,
            0
        ),
        40
    )

    const after = await bothHistoryResponses({
        matches,
        docs,
        dateFrom: "2026-03-01",
        dateTo: "2026-03-05",
    })
    assert.equal(after.stored.data.matchesInPeriod, 0)
    assert.ok(after.stored.data.players.length >= 3)
    assert.ok(
        after.stored.data.players.every(
            (row) => row.points.length === 0 && row.summary.ratingChange === 0
        )
    )
})

test("dorado: comboHistory cubre las siete categorías de jugador respecto de la ventana", async () => {
    const matches = comboHistory()
    const docs = storedDocsFrom(matches)

    const seen = await assertSameForWindows(
        matches,
        allWindows(daysFrom("2026-02-27", 30))
    )
    assert.ok(seen.withPoints > 0 && seen.empty > 0 && seen.withDebut > 0)

    const { live, stored } = await bothHistoryResponses({
        matches,
        docs,
        ...COMBO_WINDOW,
    })
    assert.deepEqual(stored, live)
    const row = (id) =>
        stored.data.players.find((item) => item.player.id === id)

    // Debuta dentro del período.
    assert.equal(row("pi").start, null)
    assert.equal(row("pi").points.length, 1)
    // Antes y después, sin partidos en el período.
    assert.equal(row("pe").points.length, 0)
    assert.deepEqual(row("pe").start, row("pe").end)
    // Debuta después del período: no aparece.
    assert.equal(row("pc"), undefined)
    // Solo partidos sin fecha: aparece, sin puntos.
    assert.equal(row("pm").points.length, 0)
    assert.equal(row("pm").start.matches, 2)
    assert.deepEqual(row("pm").start, row("pm").end)
})

test("dorado: un partido sin playedAt cuenta en start y no entra al período", async () => {
    const matches = [
        match(1, P("a"), 2, P("b"), 0, "2026-03-01T15:00:00Z", {
            playedAt: undefined,
        }),
        match(2, P("a"), 1, P("c"), 0, "2026-03-05T15:00:00Z"),
        match(3, P("b"), 1, P("c"), 3, "2026-03-07T15:00:00Z"),
        match(4, P("a"), 1, P("b"), 1, "2026-03-09T15:00:00Z"),
    ]
    const seen = await assertSameForWindows(
        matches,
        allWindows(daysFrom("2026-03-03", 9))
    )
    assert.ok(seen.withPoints > 0)

    const { stored } = await bothHistoryResponses({
        matches,
        dateFrom: "2026-03-06",
        dateTo: "2026-03-08",
    })
    assert.equal(stored.data.matchesInPeriod, 1)
    // El partido sin fecha va primero en el motor, así que su seq es 1 y el del
    // período es el 3.
    assert.equal(stored.data.matchesTimeline[0].seq, 3)
    const a = stored.data.players.find((row) => row.player.id === "a")
    assert.equal(a.start.matches, 2)
    assert.deepEqual(a.points, [])
})

test("dorado: partidos con el mismo playedAt se ordenan por _id, en el período y en la cola", async () => {
    const same = "2026-03-05T15:00:00Z"
    const later = "2026-03-12T15:00:00Z"
    const matches = [
        match(1, P("a"), 1, P("b"), 0, "2026-03-01T15:00:00Z"),
        match(3, P("b"), 2, P("a"), 0, same),
        match(2, P("a"), 0, P("b"), 3, same),
        match(4, P("c"), 1, P("a"), 0, same),
        match(6, P("a"), 2, P("c"), 0, later),
        match(5, P("b"), 0, P("c"), 1, later),
        match(7, P("a"), 1, P("b"), 1, later),
    ]
    const seen = await assertSameForWindows(
        matches,
        allWindows(daysFrom("2026-02-28", 16))
    )
    assert.ok(seen.withPoints > 0)

    const { stored } = await bothHistoryResponses({
        matches,
        dateFrom: "2026-03-05",
        dateTo: "2026-03-05",
    })
    assert.deepEqual(
        stored.data.matchesTimeline.map((item) => item.seq),
        [2, 3, 4]
    )
    assert.deepEqual(
        stored.data.players
            .find((row) => row.player.id === "a")
            .points.map((point) => point.seq),
        [2, 3, 4]
    )
})

test("dorado: empates y penales quedan como punto y empate, fuera de los upsets", async () => {
    const matches = [
        match(1, P("a"), 3, P("b"), 0, "2026-03-01T10:00:00Z"),
        match(2, P("a"), 1, P("b"), 1, "2026-03-02T10:00:00Z"),
        match(3, P("a"), 2, P("b"), 2, "2026-03-02T12:00:00Z", {
            type: "playoff",
        }),
    ]
    const { live, stored } = await bothHistoryResponses({
        matches,
        dateFrom: "2026-03-02",
        dateTo: "2026-03-02",
    })

    assert.deepEqual(stored, live)
    for (const player of stored.data.players) {
        assert.equal(player.points.length, 2)
        assert.equal(player.summary.record.draws, 2)
        assert.equal(player.summary.biggestUpsetWon, null)
        assert.equal(player.summary.worstUpsetLost, null)
    }
    assert.equal(stored.data.highlights.biggestUpset, null)
})

test("dorado: historias pseudoaleatorias con semilla fija, todas las ventanas", async () => {
    const days = daysFrom("2026-02-28", RANDOM_DAYS + 4)
    assert.ok(days.includes(RANDOM_FIRST_DAY))
    const totals = { windows: 0, withPoints: 0, withDebut: 0 }

    for (const seed of [1, 2, 3, 4, 5]) {
        const seen = await assertSameForWindows(
            randomHistory(seed),
            allWindows(days)
        )
        totals.windows += seen.windows
        totals.withPoints += seen.withPoints
        totals.withDebut += seen.withDebut
    }

    assert.ok(totals.windows > 500)
    assert.ok(totals.withPoints > 0)
    assert.ok(totals.withDebut > 0)
})

test("dorado: el payload tiene el orden de claves del contrato y los apodos de usuario", async () => {
    const { live, stored } = await bothHistoryResponses({
        matches: syntheticHistory(),
        dateFrom: "2026-01-05",
        dateTo: "2026-01-12",
    })

    assert.deepEqual(Object.keys(stored), Object.keys(live))
    assert.deepEqual(Object.keys(stored), [
        "success",
        "dateFrom",
        "dateTo",
        "scope",
        "parameters",
        "data",
    ])
    assert.deepEqual(Object.keys(stored.data), [
        "matchesInPeriod",
        "players",
        "matchesTimeline",
        "highlights",
    ])
    assert.deepEqual(stored.scope, { type: "period", tournament: null })
    assert.deepEqual(stored.parameters, live.parameters)
    assert.equal(stored.dateFrom, "2026-01-05")
    assert.equal(stored.dateTo, "2026-01-12")
    assert.ok(
        stored.data.players.some((row) => row.player.name === "Ana (nick)")
    )
})

// ---------------------------------------------------------------------------
// Consistencia con /api/ratings/period
// ---------------------------------------------------------------------------

test("consistencia: ratingChange, posiciones, récord y sorpresa coinciden con /ratings/period", async () => {
    const matches = syntheticHistory()
    const docs = storedDocsFrom(matches)
    const windows = [
        { dateFrom: "2026-01-05", dateTo: "2026-01-12" },
        { dateFrom: "2026-01-07", dateTo: "2026-01-07" },
        { dateFrom: "2025-12-30", dateTo: "2026-02-04" },
        { dateFrom: "2026-03-01", dateTo: "2026-03-05" },
    ]
    let compared = 0

    for (const window of windows) {
        const history = await bothHistoryResponses({ matches, docs, ...window })
        const period = await bothPeriodResponses({ matches, docs, ...window })

        assert.equal(
            history.stored.data.matchesInPeriod,
            period.stored.data.matchesInPeriod
        )
        assert.deepEqual(
            history.stored.data.highlights.biggestUpset,
            period.stored.data.highlights.biggestUpset
        )
        assert.deepEqual(history.stored.parameters, period.stored.parameters)
        assert.equal(
            history.stored.data.players.length,
            period.stored.data.players.length
        )
        for (const periodRow of period.stored.data.players) {
            const row = history.stored.data.players.find(
                (item) => item.player.id === periodRow.player.id
            )
            assert.equal(row.player.name, periodRow.player.name)
            assert.equal(row.summary.ratingChange, periodRow.ratingChange)
            assert.equal(row.summary.position, periodRow.position)
            assert.equal(
                row.summary.previousPosition,
                periodRow.previousPosition
            )
            assert.equal(row.summary.positionChange, periodRow.positionChange)
            assert.deepEqual(row.summary.record, periodRow.record)
            assert.equal(row.summary.matchesInPeriod, periodRow.matchesInPeriod)
            assert.equal(row.summary.provisional, periodRow.provisional)
            assert.equal(row.end.rating, periodRow.rating)
            assert.equal(row.start?.rating ?? null, periodRow.previousRating)
            compared += 1
        }
    }

    assert.ok(compared > 0)
})

// ---------------------------------------------------------------------------
// Filtro players
// ---------------------------------------------------------------------------

test("players: filtra la lista sin alterar x ni matchesTimeline, y ignora ids inexistentes", async () => {
    const matches = syntheticHistory()
    const window = { dateFrom: "2026-01-05", dateTo: "2026-01-12" }
    const all = await bothHistoryResponses({ matches, ...window })
    const ids = all.stored.data.players.map((row) => row.player.id)
    assert.ok(ids.length >= 3)

    for (const players of [
        [ids[0]],
        [ids[0], ids[2]],
        [ids[1], "no-existe"],
        ["no-existe"],
    ]) {
        const { live, stored, liveReads } = await bothHistoryResponses({
            matches,
            ...window,
            players,
        })
        const expected = all.stored.data.players.filter((row) =>
            players.includes(row.player.id)
        )

        assert.deepEqual(stored, live, players.join())
        assert.equal(liveReads, 0)
        assert.deepEqual(stored.data.players, expected, players.join())
        assert.deepEqual(
            stored.data.matchesTimeline,
            all.stored.data.matchesTimeline
        )
        assert.equal(
            stored.data.matchesInPeriod,
            all.stored.data.matchesInPeriod
        )
        assert.deepEqual(stored.data.highlights, all.stored.data.highlights)
        // Los x de cada punto siguen siendo los del período completo.
        for (const row of stored.data.players) {
            const full = all.stored.data.players.find(
                (item) => item.player.id === row.player.id
            )
            assert.deepEqual(
                row.points.map((point) => point.x),
                full.points.map((point) => point.x)
            )
        }
    }
})

// ---------------------------------------------------------------------------
// Controller: frescura, errores, interruptor y registro
// ---------------------------------------------------------------------------

const WINDOW = { dateFrom: "2026-01-05", dateTo: "2026-01-10" }

test("controller: el historial guardado es idéntico al de en vivo, no lee el historial y loguea ratings_history", async () => {
    const { live, stored, liveReads, logger } = await bothHistoryResponses({
        matches: syntheticHistory(),
        ...WINDOW,
    })

    assert.deepEqual(stored, live)
    assert.equal(liveReads, 0)
    assert.deepEqual(logger.logs, [
        {
            level: "info",
            event: "rating_read_model",
            endpoint: "ratings_history",
            source: "stored",
            reason: "ok",
            players: stored.data.players.length,
            durationMs: logger.logs[0].durationMs,
        },
    ])
    assert.equal(typeof logger.logs[0].durationMs, "number")
})

test("controller: cada razón de frescura cae a vivo con el mismo cuerpo", async () => {
    const other = "1".repeat(64)
    const cases = [
        [
            "stale_count",
            () => ({
                retrieveOptions: {
                    sourceStats: { ...SOURCE_STATS, ratedMatches: 21 },
                },
            }),
        ],
        [
            "stale_updated_at",
            () => ({
                retrieveOptions: {
                    sourceStats: {
                        ...SOURCE_STATS,
                        maxUpdatedAt: new Date("2026-03-01T00:00:00Z"),
                    },
                },
            }),
        ],
        [
            "fingerprint_mismatch",
            () => ({ retrieveOptions: { fingerprint: other } }),
        ],
        [
            "inconsistent_chain",
            (matches) => {
                const docs = storedDocsFrom(matches)
                docs.players.find((player) => player.id === "a").rating += 1
                return { docs }
            },
        ],
    ]
    for (const [reason, prepare] of cases) {
        const matches = syntheticHistory()
        const { live, stored, liveReads, logger } = await bothHistoryResponses({
            matches,
            ...WINDOW,
            ...prepare(matches),
        })

        assert.deepEqual(stored, live, reason)
        assert.equal(liveReads, 1, reason)
        assert.equal(logger.logs[0].level, "info", reason)
        assert.equal(logger.logs[0].endpoint, "ratings_history", reason)
        assert.equal(logger.logs[0].source, "live", reason)
        assert.equal(logger.logs[0].reason, reason)
    }
})

test("controller: si el lector falla o responde mal cae a vivo y registra el error sin mensaje", async () => {
    const readers = [
        async () => {
            throw new Error("falla con detalle-secreto-xyz")
        },
        async () => ({}),
        async () => null,
        async () => ({ previous: new Map() }),
    ]
    for (const retrieveStoredPeriod of readers) {
        const { live, stored, liveReads, logger } = await bothHistoryResponses({
            matches: syntheticHistory(),
            ...WINDOW,
            overrides: { retrieveStoredPeriod },
        })
        assert.deepEqual(stored, live)
        assert.equal(liveReads, 1)
        assert.equal(logger.logs[0].level, "warn")
        assert.equal(logger.logs[0].reason, "error")
        assert.equal(logger.logs[0].source, "live")
        assert.ok(!JSON.stringify(logger.logs).includes("detalle-secreto-xyz"))
    }

    // Con el lector real y un documento malformado: lanza y cae a vivo.
    const matches = syntheticHistory()
    const docs = storedDocsFrom(matches)
    docs.events.find((event) => event.seq === 7).scoreP1 = "x"
    const broken = await bothHistoryResponses({ matches, docs, ...WINDOW })
    assert.deepEqual(broken.stored, broken.live)
    assert.equal(broken.liveReads, 1)
    assert.equal(broken.logger.logs[0].reason, "error")
})

test("controller: con el interruptor apagado no consulta lo guardado", async () => {
    let storedReads = 0
    const { live, stored, liveReads, logger } = await bothHistoryResponses({
        matches: syntheticHistory(),
        ...WINDOW,
        overrides: {
            retrieveStoredPeriod: async () => {
                storedReads += 1
                return { stale: "x" }
            },
            readModelEnabled: () => false,
        },
    })

    assert.deepEqual(stored, live)
    assert.equal(storedReads, 0)
    assert.equal(liveReads, 1)
    assert.equal(logger.logs[0].reason, "disabled")
})

test("controller: sin lector guardado (solo retrieveAllMatches) no loguea ni toca la base", async () => {
    const logger = makeLogger()
    const response = createResponse()

    await createGetRatingsHistory({
        retrieveAllMatches: async () => syntheticHistory(),
        retrieveAllUsers: async () => [],
        logger,
    })({ query: WINDOW }, response)

    assert.equal(response.body.success, true)
    assert.deepEqual(logger.logs, [])
})

test("controller: el lector guardado recibe start y end en milisegundos del día argentino", async () => {
    const received = []
    await bothHistoryResponses({
        matches: syntheticHistory(),
        ...WINDOW,
        overrides: {
            retrieveStoredPeriod: async (args) => {
                received.push(args)
                return { stale: "stale_count" }
            },
        },
    })

    assert.deepEqual(received, [
        {
            start: Date.parse("2026-01-05T03:00:00.000Z"),
            end: Date.parse("2026-01-11T03:00:00.000Z"),
            // El historial pide los datos del partido; /ratings/period no.
            includeHistory: true,
        },
    ])
})

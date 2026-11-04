"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const { RATING_CONFIG } = require("../config/ratings")
const teamRatingsData = require("../data/teamRatings.json")
const {
    buildPeriodPayload,
    createGetRatingsPeriod,
} = require("../controller/getRatingsPeriod")
const { getArgentinaDayRange } = require("../utils/argentinaDay")
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
const {
    SOURCE_STATS,
    realTeamIds,
    storedDocsFrom,
    syntheticHistory,
} = require("./fixtures/ratingsReadModel")
const {
    LEO,
    NICO,
    SANTI,
    ZETA,
    history,
    match,
    objectId,
} = require("./fixtures/ratingsStore")

// Compara las dos respuestas de una ventana y devuelve cuántas cosas distintas
// vio, para que los barridos puedan comprobar que no son vacíos.
const assertSameForWindows = async (matches, windows, users) => {
    const docs = storedDocsFrom(matches)
    const seen = {
        windows: 0,
        withMatches: 0,
        withUpset: 0,
        withMovement: 0,
        withDebut: 0,
        empty: 0,
    }
    for (const window of windows) {
        const { live, stored, liveReads } = await bothPeriodResponses({
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
        if (live.data.matchesInPeriod > 0) seen.withMatches += 1
        else seen.empty += 1
        if (live.data.highlights.biggestUpset) seen.withUpset += 1
        if (live.data.players.some((row) => row.positionChange)) {
            seen.withMovement += 1
        }
        if (live.data.players.some((row) => row.previousPosition === null)) {
            seen.withDebut += 1
        }
    }
    return seen
}

// ---------------------------------------------------------------------------
// Dorado: el camino guardado devuelve lo mismo que el camino en vivo
// ---------------------------------------------------------------------------

test("dorado: barrido de todas las ventanas sobre syntheticHistory", async () => {
    const days = daysFrom("2025-12-30", 37) // hasta el 2026-02-04
    const seen = await assertSameForWindows(
        syntheticHistory(),
        allWindows(days)
    )

    assert.equal(seen.windows, (37 * 38) / 2)
    // El barrido no es vacío: hay ventanas sin partidos, con partidos, con
    // sorpresa, con movimientos de posición y con jugadores que debutan.
    assert.ok(seen.empty > 0)
    assert.ok(seen.withMatches > 0)
    assert.ok(seen.withUpset > 0)
    assert.ok(seen.withMovement > 0)
    assert.ok(seen.withDebut > 0)
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
        const { live, stored, liveReads } = await bothPeriodResponses({
            matches,
            docs,
            dateFrom,
            dateTo,
        })
        assert.deepEqual(stored, live, label)
        assert.equal(liveReads, 0, label)
    }

    const before = await bothPeriodResponses({
        matches,
        docs,
        dateFrom: "2025-12-01",
        dateTo: "2025-12-05",
    })
    assert.deepEqual(before.stored.data.players, [])
    assert.equal(before.stored.data.matchesInPeriod, 0)
    assert.equal(before.stored.data.highlights.biggestUpset, null)

    const all = await bothPeriodResponses({
        matches,
        docs,
        dateFrom: "2025-01-01",
        dateTo: "2026-12-31",
    })
    assert.equal(all.stored.data.matchesInPeriod, 20)
    assert.ok(
        all.stored.data.players.every((row) => row.previousPosition === null)
    )

    const after = await bothPeriodResponses({
        matches,
        docs,
        dateFrom: "2026-03-01",
        dateTo: "2026-03-05",
    })
    assert.equal(after.stored.data.matchesInPeriod, 0)
    assert.ok(after.stored.data.players.length >= 3)
    assert.ok(after.stored.data.players.every((row) => row.ratingChange === 0))
})

test("dorado: el payload tiene las mismas claves en el mismo orden y los mismos parámetros", async () => {
    const { live, stored } = await bothPeriodResponses({
        matches: syntheticHistory(),
        dateFrom: "2026-01-05",
        dateTo: "2026-01-12",
    })

    assert.deepEqual(Object.keys(stored), Object.keys(live))
    assert.deepEqual(Object.keys(stored.data), [
        "matchesInPeriod",
        "players",
        "highlights",
    ])
    assert.deepEqual(stored.parameters, live.parameters)
    assert.equal(stored.dateFrom, "2026-01-05")
    assert.equal(stored.dateTo, "2026-01-12")
    assert.equal(stored.success, true)
    assert.equal(JSON.stringify(stored), JSON.stringify(live))
    // Los apodos de los usuarios se siguen usando.
    assert.ok(
        stored.data.players.some((row) => row.player.name === "Ana (nick)")
    )
})

test("dorado: bordes exactos (time === start, end - 1 ms y time === end)", async () => {
    const start = "2026-03-10T03:00:00.000Z"
    const lastMs = "2026-03-11T02:59:59.999Z"
    const end = "2026-03-11T03:00:00.000Z"
    const matches = [
        match(1, NICO, 2, SANTI, 0, "2026-03-09T12:00:00Z"),
        match(2, NICO, 1, LEO, 3, start),
        match(3, SANTI, 0, LEO, 1, lastMs),
        match(4, NICO, 4, SANTI, 1, end),
        match(5, LEO, 2, NICO, 2, "2026-03-12T15:00:00Z"),
        match(6, LEO, 0, SANTI, 1, "2026-03-12T15:00:00Z"),
    ]
    const days = daysFrom("2026-03-08", 6)

    const seen = await assertSameForWindows(matches, allWindows(days))
    assert.ok(seen.withMatches > 0)

    // Un solo día [03-10]: entran el partido en `start` y el de `end - 1 ms`; el
    // de `end` queda afuera.
    const { stored } = await bothPeriodResponses({
        matches,
        dateFrom: "2026-03-10",
        dateTo: "2026-03-10",
    })
    assert.equal(stored.data.matchesInPeriod, 2)
    // El día anterior [03-09]: el partido en `start` del día siguiente no entra.
    const previousDay = await bothPeriodResponses({
        matches,
        dateFrom: "2026-03-09",
        dateTo: "2026-03-09",
    })
    assert.equal(previousDay.stored.data.matchesInPeriod, 1)
    // El día siguiente [03-11]: el partido exacto en `end` anterior entra.
    const nextDay = await bothPeriodResponses({
        matches,
        dateFrom: "2026-03-11",
        dateTo: "2026-03-11",
    })
    assert.equal(nextDay.stored.data.matchesInPeriod, 1)
})

test("dorado: comboHistory cubre las siete categorías de jugador respecto de la ventana", async () => {
    const matches = comboHistory()
    const docs = storedDocsFrom(matches)
    const start = getArgentinaDayRange(COMBO_WINDOW.dateFrom).start.getTime()
    const end = getArgentinaDayRange(COMBO_WINDOW.dateTo).end.getTime()

    // Categorías a partir de los documentos guardados.
    const byPlayer = new Map()
    for (const event of docs.events) {
        for (const side of [event.p1, event.p2]) {
            const info = byPlayer.get(side.id) ?? {
                before: false,
                period: false,
                after: false,
                undated: false,
                debutInPeriod: false,
            }
            const time = event.time === null ? null : event.time.getTime()
            if (time === null) info.undated = true
            else if (time < start) info.before = true
            else if (time < end) {
                info.period = true
                if (side.games === 0) info.debutInPeriod = true
            } else info.after = true
            byPlayer.set(side.id, info)
        }
    }
    const some = (predicate) =>
        [...byPlayer.values()].some((info) => predicate(info))
    assert.ok(
        some((i) => i.before && !i.period && !i.after),
        "solo antes"
    )
    assert.ok(
        some((i) => i.after && !i.before && !i.period && !i.undated),
        "solo después"
    )
    assert.ok(
        some((i) => i.before && i.after && !i.period),
        "antes y después sin período"
    )
    assert.ok(
        some((i) => i.period && i.after && !i.before),
        "período y después"
    )
    assert.ok(
        some((i) => i.before && i.period && i.after),
        "antes + período + después"
    )
    assert.ok(
        some((i) => i.debutInPeriod),
        "debuta en el período"
    )
    assert.ok(
        some((i) => i.undated && !i.before && !i.period && !i.after),
        "solo partidos sin fecha"
    )

    const seen = await assertSameForWindows(
        matches,
        allWindows(daysFrom("2026-02-27", 30))
    )
    assert.ok(seen.withMatches > 0 && seen.empty > 0 && seen.withDebut > 0)

    // La ventana fija: el que debuta dentro del período no tiene posición previa.
    const { stored } = await bothPeriodResponses({
        matches,
        docs,
        ...COMBO_WINDOW,
    })
    const row = (id) =>
        stored.data.players.find((item) => item.player.id === id)
    assert.equal(row("pi").previousPosition, null)
    assert.equal(row("pi").previousRating, null)
    assert.equal(row("pi").matchesInPeriod, 1)
    // Antes y después, sin partidos en el período: no cambia nada.
    assert.equal(row("pe").ratingChange, 0)
    assert.equal(row("pe").matchesInPeriod, 0)
    // Debuta después del período: no aparece.
    assert.equal(row("pc"), undefined)
    // Solo partidos sin fecha: aparece en el ranking, sin partidos en el período.
    assert.equal(row("pm").matchesInPeriod, 0)
    assert.equal(row("pm").ratingChange, 0)
})

test("dorado: un partido sin playedAt antes del corte cuenta en el estado y no en el período", async () => {
    const matches = [
        match(1, NICO, 2, SANTI, 0, "2026-03-01T15:00:00Z", {
            playedAt: undefined,
        }),
        match(2, NICO, 1, LEO, 0, "2026-03-05T15:00:00Z"),
        match(3, SANTI, 1, LEO, 3, "2026-03-07T15:00:00Z"),
        match(4, NICO, 1, SANTI, 1, "2026-03-09T15:00:00Z"),
        // Solo juega sin fecha.
        match(5, ZETA, 1, LEO, 2, "2026-03-01T15:00:00Z", {
            playedAt: undefined,
        }),
    ]
    assert.equal(matches[0].playedAt, undefined)

    const seen = await assertSameForWindows(
        matches,
        allWindows(daysFrom("2026-03-03", 9))
    )
    assert.ok(seen.withMatches > 0)

    const { stored } = await bothPeriodResponses({
        matches,
        dateFrom: "2026-03-06",
        dateTo: "2026-03-08",
    })
    assert.equal(stored.data.matchesInPeriod, 1)
    const zeta = stored.data.players.find((row) => row.player.id === ZETA.id)
    assert.equal(zeta.matchesInPeriod, 0)
    assert.equal(zeta.ratingChange, 0)
})

test("dorado: dos partidos con el mismo playedAt se ordenan por _id, en el período y en la cola", async () => {
    const same = "2026-03-05T15:00:00Z"
    const later = "2026-03-12T15:00:00Z"
    const matches = [
        match(1, NICO, 1, SANTI, 0, "2026-03-01T15:00:00Z"),
        // Mismo playedAt dentro del período: el orden lo da el _id.
        match(3, SANTI, 2, NICO, 0, same),
        match(2, NICO, 0, SANTI, 3, same),
        match(4, LEO, 1, NICO, 0, same),
        // Y en la cola posterior a `end`.
        match(6, NICO, 2, LEO, 0, later),
        match(5, SANTI, 0, LEO, 1, later),
        match(7, NICO, 1, SANTI, 1, later),
    ]

    const seen = await assertSameForWindows(
        matches,
        allWindows(daysFrom("2026-02-28", 16))
    )
    assert.ok(seen.withMatches > 0)
})

// ---------------------------------------------------------------------------
// Dorado: sorpresa del período
// ---------------------------------------------------------------------------

// Dos equipos de la misma edición con overall distinto (el término de equipo
// solo mueve el esperado si difieren).
const teamsWithDifferentOverall = () => {
    const { tournamentId, edition } = realTeamIds()
    const teams = Object.entries(teamRatingsData.overallByTeamEdition)
        .filter(([key]) => key.endsWith(`|${edition}`))
        .map(([key, overall]) => ({
            id: key.slice(0, key.lastIndexOf("|")),
            overall,
        }))
    const teamA = teams[0]
    const teamB = teams.find((team) => team.overall !== teamA.overall)
    assert.ok(teamB, "no hay dos equipos con overall distinto")
    return {
        tournamentId,
        teamA: { id: teamA.id, name: `Equipo ${teamA.id}` },
        teamB: { id: teamB.id, name: `Equipo ${teamB.id}` },
    }
}

const P = (id) => ({ id, name: id.toUpperCase() })

test("dorado: empate de winnerExpected en la sorpresa gana el primero por seq", async () => {
    // Dos parejas con la misma historia: tras el día 1, A y C quedan en 1506 y B
    // y D en 1494; el día 2 B le gana a A y D le gana a C con el mismo
    // winnerExpected exacto.
    const matches = [
        match(1, P("a"), 1, P("b"), 0, "2026-03-01T10:00:00Z"),
        match(2, P("c"), 1, P("d"), 0, "2026-03-01T11:00:00Z"),
        match(3, P("a"), 0, P("b"), 1, "2026-03-02T10:00:00Z"),
        match(4, P("c"), 0, P("d"), 1, "2026-03-02T11:00:00Z"),
    ]

    const { live, stored } = await bothPeriodResponses({
        matches,
        dateFrom: "2026-03-02",
        dateTo: "2026-03-02",
    })

    assert.deepEqual(stored, live)
    const upset = stored.data.highlights.biggestUpset
    assert.equal(upset.matchId, String(objectId(3)))
    assert.equal(upset.winner.id, "b")
    assert.ok(upset.winnerExpectedScore < 0.5)
})

test("dorado: los empates y los penales (resultP1 === 0.5) no son sorpresa", async () => {
    // El jugador de menor rating empata (también con penales en un playoff) y
    // nunca hay un ganador sorpresivo.
    const matches = [
        match(1, P("a"), 3, P("b"), 0, "2026-03-01T10:00:00Z"),
        match(2, P("a"), 1, P("b"), 1, "2026-03-02T10:00:00Z"),
        match(3, P("a"), 2, P("b"), 2, "2026-03-02T12:00:00Z", {
            type: "playoff",
        }),
    ]
    const { live, stored } = await bothPeriodResponses({
        matches,
        dateFrom: "2026-03-02",
        dateTo: "2026-03-02",
    })

    assert.deepEqual(stored, live)
    assert.equal(stored.data.matchesInPeriod, 2)
    assert.equal(stored.data.highlights.biggestUpset, null)
})

test("dorado: sin sorpresa si el favorito siempre gana, y con el término de equipo real", async () => {
    const favorite = [
        match(1, P("a"), 1, P("b"), 0, "2026-03-01T10:00:00Z"),
        match(2, P("a"), 2, P("b"), 0, "2026-03-02T10:00:00Z"),
    ]
    const none = await bothPeriodResponses({
        matches: favorite,
        dateFrom: "2026-03-02",
        dateTo: "2026-03-02",
    })
    assert.deepEqual(none.stored, none.live)
    assert.equal(none.stored.data.highlights.biggestUpset, null)

    // Con equipos reales el término de equipo mueve el esperado: b gana los dos
    // partidos, uno con cada asignación de equipos, así que en uno es el
    // desfavorecido.
    const real = teamsWithDifferentOverall()
    const withTeams = [
        match(1, P("a"), 1, P("b"), 0, "2026-03-01T10:00:00Z"),
        match(2, P("a"), 0, P("b"), 2, "2026-03-02T10:00:00Z", {
            teamP1: real.teamA,
            teamP2: real.teamB,
            tournament: { id: real.tournamentId, name: "Torneo real" },
        }),
        match(3, P("a"), 0, P("b"), 2, "2026-03-02T12:00:00Z", {
            teamP1: real.teamB,
            teamP2: real.teamA,
            tournament: { id: real.tournamentId, name: "Torneo real" },
        }),
    ]
    const docs = storedDocsFrom(withTeams)
    assert.ok(docs.events.slice(1).every((event) => event.teamAdjustment !== 0))
    const result = await bothPeriodResponses({
        matches: withTeams,
        docs,
        dateFrom: "2026-03-02",
        dateTo: "2026-03-02",
    })
    assert.deepEqual(result.stored, result.live)
    assert.ok(result.stored.data.highlights.biggestUpset)
    assert.equal(
        result.stored.data.highlights.biggestUpset.tournament,
        "Torneo real"
    )
})

test("dorado: partidos que el motor no rate mezclados en la historia", async () => {
    const seen = await assertSameForWindows(
        history(),
        allWindows(daysFrom("2025-12-30", 12))
    )
    assert.ok(seen.withMatches > 0)
})

// ---------------------------------------------------------------------------
// Dorado: nombres
// ---------------------------------------------------------------------------

test("dorado: un cambio de nombre dentro del período sale igual que en vivo", async () => {
    const matches = [
        match(
            1,
            { id: "z", name: "Zeta" },
            1,
            P("y"),
            0,
            "2026-03-01T10:00:00Z"
        ),
        match(
            2,
            { id: "z", name: "Zeta 2" },
            2,
            P("y"),
            0,
            "2026-03-05T10:00:00Z"
        ),
        match(
            3,
            { id: "z", name: "Zeta 3" },
            0,
            P("y"),
            1,
            "2026-03-12T10:00:00Z"
        ),
    ]

    const { live, stored } = await bothPeriodResponses({
        matches,
        users: [],
        dateFrom: "2026-03-04",
        dateTo: "2026-03-06",
    })

    assert.deepEqual(stored, live)
    assert.equal(
        stored.data.players.find((row) => row.player.id === "z").player.name,
        "Zeta 2"
    )
})

test("dorado: límite conocido, jugador sin apodo que cambió de nombre después de end y no jugó en el período", async () => {
    const matches = [
        match(
            1,
            { id: "z", name: "Zeta" },
            1,
            P("y"),
            0,
            "2026-03-01T10:00:00Z"
        ),
        match(2, P("x"), 1, P("y"), 0, "2026-03-05T10:00:00Z"),
        match(
            3,
            { id: "z", name: "Zeta nuevo" },
            2,
            P("y"),
            0,
            "2026-03-10T10:00:00Z"
        ),
    ]
    const window = { dateFrom: "2026-03-04", dateTo: "2026-03-06" }
    const nameOf = (body) =>
        body.data.players.find((row) => row.player.id === "z").player.name

    // Sin apodo de usuario el nombre puede diferir: en vivo es el último anterior
    // a `end`; guardado, el del primer evento posterior.
    const noUser = await bothPeriodResponses({ matches, users: [], ...window })
    assert.equal(nameOf(noUser.live), "Zeta")
    assert.equal(nameOf(noUser.stored), "Zeta nuevo")
    const normalized = structuredClone(noUser.stored)
    normalized.data.players.find((row) => row.player.id === "z").player.name =
        "Zeta"
    assert.deepEqual(normalized, noUser.live)

    // Con apodo de usuario (el caso real) la respuesta es idéntica.
    const withUser = await bothPeriodResponses({
        matches,
        users: [{ id: "z", nickname: "Zeta (usuario)" }],
        ...window,
    })
    assert.deepEqual(withUser.stored, withUser.live)
    assert.equal(nameOf(withUser.stored), "Zeta (usuario)")
})

// ---------------------------------------------------------------------------
// Dorado: propiedad con semillas
// ---------------------------------------------------------------------------

test("dorado: historias pseudoaleatorias con semilla fija, todas las ventanas", async () => {
    const days = daysFrom("2026-02-28", RANDOM_DAYS + 4)
    assert.ok(days.includes(RANDOM_FIRST_DAY))
    const totals = { windows: 0, withUpset: 0, withMovement: 0, withDebut: 0 }
    let hasUndated = false
    let hasUnrated = false

    for (const seed of [1, 2, 3, 4, 5]) {
        const matches = randomHistory(seed)
        hasUndated ||= matches.some((m) => m.playedAt === undefined)
        hasUnrated ||= matches.some((m) => m.played === false)
        const seen = await assertSameForWindows(matches, allWindows(days))
        totals.windows += seen.windows
        totals.withUpset += seen.withUpset
        totals.withMovement += seen.withMovement
        totals.withDebut += seen.withDebut
    }

    // Las historias incluyen partidos sin fecha y no rateables.
    assert.ok(hasUndated && hasUnrated)
    assert.ok(totals.windows > 500)
    assert.ok(totals.withUpset > 0)
    assert.ok(totals.withMovement > 0)
    assert.ok(totals.withDebut > 0)
})

// ---------------------------------------------------------------------------
// Controller: frescura, errores, interruptor y cableado
// ---------------------------------------------------------------------------

const WINDOW = { dateFrom: "2026-01-05", dateTo: "2026-01-10" }

test("controller: el período guardado es idéntico al de en vivo, no lee el historial y loguea", async () => {
    const { live, stored, liveReads, logger } = await bothPeriodResponses({
        matches: syntheticHistory(),
        ...WINDOW,
    })

    assert.deepEqual(stored, live)
    assert.equal(liveReads, 0)
    assert.deepEqual(logger.logs, [
        {
            level: "info",
            event: "rating_read_model",
            endpoint: "ratings_period",
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
            "fingerprint_mismatch",
            (matches) => {
                const docs = storedDocsFrom(matches)
                docs.events.find((event) => event.seq === 7).fingerprint = other
                return { docs }
            },
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
        const { live, stored, liveReads, logger } = await bothPeriodResponses({
            matches,
            ...WINDOW,
            ...prepare(matches),
        })

        assert.deepEqual(stored, live, reason)
        assert.equal(liveReads, 1, reason)
        assert.equal(logger.logs[0].level, "info", reason)
        assert.equal(logger.logs[0].source, "live", reason)
        assert.equal(logger.logs[0].reason, reason)
    }
})

test("controller: si el lector falla, responde mal o lee documentos malformados cae a vivo y registra el error sin mensaje", async () => {
    const readers = [
        async () => {
            throw new Error("falla con mongodb://u:p@h")
        },
        async () => ({}),
        async () => null,
        async () => ({ previous: new Map() }),
        async () => ({
            previous: new Map(),
            current: new Map(),
            periodEvents: "x",
        }),
        async () => ({ previous: [], current: new Map(), periodEvents: [] }),
    ]
    for (const retrieveStoredPeriod of readers) {
        const { live, stored, liveReads, logger } = await bothPeriodResponses({
            matches: syntheticHistory(),
            ...WINDOW,
            overrides: { retrieveStoredPeriod },
        })
        assert.deepEqual(stored, live)
        assert.equal(liveReads, 1)
        assert.equal(logger.logs[0].level, "warn")
        assert.equal(logger.logs[0].reason, "error")
        assert.equal(logger.logs[0].source, "live")
        assert.ok(!JSON.stringify(logger.logs).includes("mongodb://"))
    }

    // Con el lector real y un documento malformado: lanza y cae a vivo.
    const matches = syntheticHistory()
    const docs = storedDocsFrom(matches)
    docs.events.find((event) => event.seq === 7).scoreP1 = "x"
    const broken = await bothPeriodResponses({ matches, docs, ...WINDOW })
    assert.deepEqual(broken.stored, broken.live)
    assert.equal(broken.liveReads, 1)
    assert.equal(broken.logger.logs[0].reason, "error")
    assert.equal(broken.logger.logs[0].errorName, "Error")
})

test("controller: con el interruptor apagado no consulta lo guardado", async () => {
    let storedReads = 0
    const { live, stored, liveReads, logger } = await bothPeriodResponses({
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
    assert.equal(logger.logs[0].source, "live")
})

test("controller: sin lector guardado (solo retrieveAllMatches) no loguea ni toca la base", async () => {
    const logger = makeLogger()
    const response = createResponse()

    await createGetRatingsPeriod({
        retrieveAllMatches: async () => syntheticHistory(),
        retrieveAllUsers: async () => [],
        logger,
    })({ query: WINDOW }, response)

    assert.equal(response.body.success, true)
    assert.deepEqual(logger.logs, [])
})

test("controller: un logger roto no rompe la respuesta", async () => {
    const { live, stored } = await bothPeriodResponses({
        matches: syntheticHistory(),
        ...WINDOW,
        overrides: {
            logger: {
                info: () => {
                    throw new Error("log roto")
                },
            },
        },
    })

    assert.deepEqual(stored, live)
})

test("controller: el lector guardado recibe start y end en milisegundos del día argentino", async () => {
    const received = []
    await bothPeriodResponses({
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
        },
    ])
})

test("controller: los usuarios se leen en paralelo con el lector guardado y sus errores se propagan", async () => {
    let usersStarted
    const started = new Promise((resolve) => {
        usersStarted = resolve
    })
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("lecturas en serie")), 1000).unref()
    )
    const response = createResponse()

    await Promise.race([
        createGetRatingsPeriod({
            retrieveAllMatches: async () => syntheticHistory(),
            retrieveAllUsers: async () => {
                usersStarted()
                return []
            },
            // No termina hasta que arrancó la lectura de usuarios.
            retrieveStoredPeriod: async () => {
                await started
                return { stale: "stale_count" }
            },
            readModelEnabled: () => true,
            logger: makeLogger(),
        })({ query: WINDOW }, response),
        timeout,
    ])
    assert.equal(response.body.success, true)

    const failing = async () => {
        throw new Error("sin usuarios")
    }
    await assert.rejects(
        createGetRatingsPeriod({
            retrieveStoredPeriod: async () => ({
                previous: new Map(),
                current: new Map(),
                periodEvents: [],
            }),
            retrieveAllUsers: failing,
            logger: makeLogger(),
            readModelEnabled: () => true,
        })({ query: WINDOW }, createResponse()),
        /sin usuarios/
    )
    await assert.rejects(
        createGetRatingsPeriod({
            retrieveAllMatches: async () => syntheticHistory(),
            retrieveAllUsers: failing,
        })({ query: WINDOW }, createResponse()),
        /sin usuarios/
    )
})

// ---------------------------------------------------------------------------
// buildPeriodPayload
// ---------------------------------------------------------------------------

test("buildPeriodPayload: récord, cambios de posición y de rating, provisorio y sorpresa", () => {
    const ranked = (id, rating, matches, position) => ({
        id,
        name: id.toUpperCase(),
        rating,
        matches,
        position,
    })
    const event = (seq, p1, p2, resultP1, expectedP1) => ({
        seq,
        matchId: `m${seq}`,
        time: Date.parse("2026-03-05T15:00:00Z") + seq,
        tournament: "Liga APA",
        type: "regular",
        scoreP1: resultP1 === 1 ? 2 : 0,
        scoreP2: resultP1 === 1 ? 0 : 2,
        expectedP1,
        resultP1,
        delta: 6,
        p1: { id: p1, name: p1.toUpperCase() },
        p2: { id: p2, name: p2.toUpperCase() },
    })

    const body = buildPeriodPayload({
        previousRanking: [ranked("a", 1520, 12, 1), ranked("b", 1500, 3, 2)],
        currentRanking: [
            ranked("b", 1530, 4, 1),
            ranked("a", 1510, 13, 2),
            ranked("n", 1505, 1, 3),
        ],
        periodEvents: [
            event(1, "a", "b", 1, 0.5),
            event(2, "b", "a", 0.5, 0.5),
            event(3, "n", "b", 0, 0.7),
        ],
        config: RATING_CONFIG,
        names: new Map([["a", "Ana (nick)"]]),
        dateFrom: "2026-03-01",
        dateTo: "2026-03-07",
    })

    assert.equal(body.success, true)
    assert.equal(body.dateFrom, "2026-03-01")
    assert.equal(body.dateTo, "2026-03-07")
    assert.equal(body.parameters.version, RATING_CONFIG.version)
    assert.equal(body.data.matchesInPeriod, 3)
    const [b, a, n] = body.data.players
    assert.deepEqual(b, {
        position: 1,
        previousPosition: 2,
        positionChange: 1,
        player: { id: "b", name: "B" },
        rating: 1530,
        previousRating: 1500,
        ratingChange: 30,
        matchesInPeriod: 3,
        record: { wins: 1, draws: 1, losses: 1 },
        provisional: true,
    })
    assert.equal(a.player.name, "Ana (nick)")
    assert.equal(a.positionChange, -1)
    assert.deepEqual(a.record, { wins: 1, draws: 1, losses: 0 })
    assert.equal(a.provisional, false)
    // Sin posición previa: el cambio de rating se mide contra el inicial.
    assert.equal(n.previousPosition, null)
    assert.equal(n.positionChange, null)
    assert.equal(n.previousRating, null)
    assert.equal(n.ratingChange, 5)
    assert.deepEqual(n.record, { wins: 0, draws: 0, losses: 1 })
    // El partido 3 fue la sorpresa: ganó b con 0,3 esperado.
    assert.equal(body.data.highlights.biggestUpset.matchId, "m3")
    assert.equal(body.data.highlights.biggestUpset.winner.id, "b")
    assert.equal(body.data.highlights.biggestUpset.winnerExpectedScore, 0.3)
})

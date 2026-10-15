"use strict"
// Test dorado: el índice guardado (adaptador y lector) tiene que dar EXACTAMENTE
// las mismas predicciones que el índice en vivo, usando predictMatch y
// predictOutcomes sin cambios.
const assert = require("node:assert/strict")
const test = require("node:test")
const { DRAW_MODEL } = require("../config/drawModel")
const { isRateable } = require("../service/playerRatings")
const {
    buildPredictionIndex,
    predictMatch,
    predictOutcomes,
} = require("../service/playerRatings/prediction")
const {
    buildStoredPredictionIndex,
    createRetrieveStoredPredictionIndex,
} = require("../service/ratingsReadModel")
const {
    LEO,
    NICO,
    SANTI,
    ZETA,
    history,
    match,
} = require("./fixtures/ratingsStore")
const {
    ANA,
    BETO,
    CARO,
    DANI,
    FINGERPRINT,
    NEWCOMER,
    fakeReadDaos,
    leanEvents,
    leanPlayers,
    realTeamIds,
    storedDocsFrom,
    syntheticHistory,
} = require("./fixtures/ratingsReadModel")

const ALTERNATIVE_DRAW_MODEL = { version: "draw-alt", d0: 0.3, k: 2 }
const DRAW_MODELS = [DRAW_MODEL, ALTERNATIVE_DRAW_MODEL]

// Partidos candidatos: los jugados del historial (con y sin evento), pendientes
// de todos los pares de jugadores en ambos órdenes (con y sin término de equipo)
// y los casos que no tienen predicción.
const buildCandidates = (matches, players) => {
    const real = realTeamIds()
    const candidates = matches.map((played) => ({ ...played }))
    let n = 500
    const next = () => (n += 1)
    const pending = (p1, p2, extra = {}) =>
        match(next(), p1, null, p2, null, "2026-06-01T15:00:00Z", {
            played: false,
            ...extra,
        })
    const variants = [
        {},
        {
            teamP1: real.teamA,
            teamP2: real.teamB,
            tournament: { id: real.tournamentId, name: "Torneo real" },
        },
        {
            teamP1: real.teamA,
            teamP2: real.teamWithoutOverall,
            tournament: { id: real.tournamentId, name: "Torneo real" },
        },
        {
            teamP1: real.teamA,
            teamP2: real.teamB,
            tournament: {
                id: real.tournamentWithoutEdition,
                name: "Sin edición",
            },
        },
    ]
    for (const p1 of [...players, NEWCOMER]) {
        for (const p2 of [...players, NEWCOMER]) {
            if (p1.id === p2.id) continue
            for (const extra of variants) {
                candidates.push(pending(p1, p2, extra))
            }
        }
    }
    const [first] = players
    candidates.push(
        // Mismo jugador de ambos lados, pendiente y jugado.
        pending(first, first),
        match(next(), first, 1, first, 0, "2026-06-02T15:00:00Z"),
        // Lados vacíos (jugador o equipo).
        pending(null, players[1]),
        pending(players[1], undefined),
        pending(first, players[1], { teamP1: null }),
        pending(first, players[1], { teamP2: {} }),
        pending(first, players[1], { teamP2: { id: null } }),
        // Inválidos (SIM o W.O.), pendientes y jugados.
        pending(first, players[1], { valid: false }),
        match(next(), first, 2, players[1], 1, "2026-06-03T15:00:00Z", {
            valid: false,
        }),
        // Jugado sin goles: el motor no lo rateó, no hay evento.
        match(next(), first, null, players[1], null, "2026-06-04T15:00:00Z"),
        // Jugado y rateable pero que no está en el historial guardado.
        match(next(), first, 3, players[1], 1, "2026-06-05T15:00:00Z"),
        // Un id que nadie conoce.
        { ...pending(first, players[1]), _id: "no-es-un-objectid" }
    )
    return candidates
}

// Ids de los partidos que EXIGEN evento guardado: los jugados que el motor
// rateó (lo que va a pedir quien decora).
const requiredIds = (matches) =>
    matches
        .filter(
            (candidate) => candidate.played !== false && isRateable(candidate)
        )
        .map((candidate) => String(candidate._id))

const assertSameResult = (live, stored, label) => {
    assert.deepEqual(stored, live, label)
    assert.deepEqual(
        stored === null ? null : Object.keys(stored),
        live === null ? null : Object.keys(live),
        `${label}: mismas claves y orden`
    )
}

// Compara las dos implementaciones y devuelve cuántas predicciones no nulas hubo
// y qué casos cubrieron (para que el test no pase "en vacío").
const compare = (candidates, liveIndex, storedIndex, label) => {
    const coverage = {
        nonNull: 0,
        nulls: 0,
        preMatch: 0,
        current: 0,
        teamAdjusted: 0,
        notTeamAdjusted: 0,
        provisional: 0,
        notProvisional: 0,
    }
    candidates.forEach((candidate, position) => {
        const where = `${label} #${position}`
        const liveAdvance = predictMatch(candidate, liveIndex)
        assertSameResult(
            liveAdvance,
            predictMatch(candidate, storedIndex),
            where
        )
        for (const drawModel of DRAW_MODELS) {
            assertSameResult(
                predictOutcomes(candidate, liveIndex, drawModel),
                predictOutcomes(candidate, storedIndex, drawModel),
                `${where} ${drawModel.version}`
            )
        }
        // predictOutcomes sin modelo explícito usa DRAW_MODEL en ambos.
        assertSameResult(
            predictOutcomes(candidate, liveIndex),
            predictOutcomes(candidate, storedIndex),
            `${where} default`
        )
        if (liveAdvance === null) {
            coverage.nulls += 1
            return
        }
        coverage.nonNull += 1
        if (liveAdvance.basis === "pre_match") coverage.preMatch += 1
        if (liveAdvance.basis === "current") coverage.current += 1
        if (liveAdvance.teamAdjusted) coverage.teamAdjusted += 1
        else coverage.notTeamAdjusted += 1
        if (liveAdvance.provisional) coverage.provisional += 1
        else coverage.notProvisional += 1
    })
    return coverage
}

const datasets = [
    {
        name: "historial sintético",
        matches: syntheticHistory(),
        players: [ANA, BETO, CARO, DANI],
        full: true,
    },
    {
        name: "history() de la etapa 1",
        matches: history(),
        players: [NICO, SANTI, LEO, ZETA],
        full: false,
    },
]

for (const dataset of datasets) {
    const { name, matches, players, full } = dataset

    test(`paridad (${name}): adaptador directo == índice en vivo`, () => {
        const docs = storedDocsFrom(matches)
        const liveIndex = buildPredictionIndex(matches)
        const storedIndex = buildStoredPredictionIndex({
            players: leanPlayers(docs),
            events: leanEvents(docs),
        })
        const candidates = buildCandidates(matches, players)
        const coverage = compare(candidates, liveIndex, storedIndex, name)
        assert.ok(coverage.nonNull > 20, JSON.stringify(coverage))
        assert.ok(coverage.nulls > 5, JSON.stringify(coverage))
        assert.ok(coverage.preMatch > 3, JSON.stringify(coverage))
        assert.ok(coverage.current > 20, JSON.stringify(coverage))
        assert.ok(coverage.provisional > 0, JSON.stringify(coverage))
        assert.ok(coverage.notTeamAdjusted > 0, JSON.stringify(coverage))
        if (full) {
            assert.ok(coverage.teamAdjusted > 5, JSON.stringify(coverage))
            assert.ok(coverage.notProvisional > 5, JSON.stringify(coverage))
        }
    })

    test(`paridad (${name}): lector con DAOs fake == índice en vivo`, async () => {
        const docs = storedDocsFrom(matches)
        const calls = []
        const retrieve = createRetrieveStoredPredictionIndex({
            ...fakeReadDaos({ docs, calls }),
            getCurrentFingerprint: () => FINGERPRINT,
        })
        const candidates = buildCandidates(matches, players)
        // Los ids exigidos salen del historial: los candidatos "fantasma"
        // (rateables que no están guardados) no se piden.
        const result = await retrieve({ matchIds: requiredIds(matches) })
        assert.deepEqual(Object.keys(result), ["index"])
        const coverage = compare(
            candidates,
            buildPredictionIndex(matches),
            result.index,
            `${name} (lector)`
        )
        assert.ok(coverage.nonNull > 20, JSON.stringify(coverage))
        assert.ok(coverage.preMatch > 3, JSON.stringify(coverage))
        assert.ok(coverage.current > 20, JSON.stringify(coverage))
        // Solo se pidieron los eventos que exige el historial.
        const eventsCall = calls.find(
            (call) => call.dao === "findRatingEventsByMatchIds"
        )
        assert.ok(eventsCall.args[1].length > 3)
    })
}

test("paridad: el rating y los partidos guardados son bit a bit los del snapshot", () => {
    const matches = syntheticHistory()
    const docs = storedDocsFrom(matches)
    const liveSnapshot = buildPredictionIndex(matches).snapshot
    const stored = buildStoredPredictionIndex({
        players: leanPlayers(docs),
        events: leanEvents(docs),
    }).snapshot
    assert.equal(stored.size, liveSnapshot.size)
    for (const [id, state] of liveSnapshot) {
        const entry = stored.get(id)
        assert.ok(Object.is(entry.rating, state.rating), id)
        assert.equal(entry.matches, state.matches, id)
    }
})

test("paridad: el historial sintético cubre todas las ramas esperadas", () => {
    const matches = syntheticHistory()
    assert.ok(matches.length >= 14)
    const liveIndex = buildPredictionIndex(matches)
    const results = matches.map((played) => predictMatch(played, liveIndex))
    assert.ok(results.every((result) => result !== null))
    assert.ok(results.some((result) => result.teamAdjusted))
    assert.ok(results.some((result) => !result.teamAdjusted))
    assert.ok(results.some((result) => result.provisional))
    assert.ok(results.some((result) => !result.provisional))
})

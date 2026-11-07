"use strict"
const assert = require("node:assert/strict")
const test = require("node:test")
const {
    buildEventContext,
    teamIdOf,
    toShootout,
} = require("../service/playerRatings/eventContext")
const { predictionKind } = require("../service/playerRatings/matchKind")
const { eventKind } = require("../service/playerRatings/eventProbability")
const eventKindFromMatchKind =
    require("../service/playerRatings/matchKind").eventKind
const prediction = require("../service/playerRatings/prediction")
const { calculatePlayerRatings } = require("../service/playerRatings")
const { PLAYED_AT_PRECISIONS } = require("../utils/playedAt")

const NICO = { id: "n", name: "Nico" }
const SANTI = { id: "s", name: "Santi" }
const BOCA = { id: 1, name: "Boca" }
const RIVER = { id: 2, name: "River" }

const TOURNAMENT = (format, playoffMode = null) => ({ format, playoffMode })

const base = (extra = {}) => ({
    _id: "m1",
    playerP1: NICO,
    teamP1: BOCA,
    scoreP1: 1,
    playerP2: SANTI,
    teamP2: RIVER,
    scoreP2: 1,
    playedAt: new Date("2026-01-01T15:00:00Z"),
    tournament: { id: "t1", name: "Copa" },
    type: "playoff",
    ...extra,
})

const penalties = (extra = {}) => ({
    outcome: {
        penalties: true,
        teamThatWon: { id: 1 },
        scoreFromTeamThatWon: 5,
        scoreFromTeamThatLost: 4,
        ...extra,
    },
})

test("teamIdOf: número finito (0 incluido) o string no vacío, tal cual", () => {
    assert.equal(teamIdOf({ id: 7 }), 7)
    assert.equal(teamIdOf({ id: 0 }), 0)
    assert.equal(teamIdOf({ id: "abc" }), "abc")
    assert.equal(teamIdOf({ id: "7" }), "7")
})

test("teamIdOf: sin equipo, id nulo, vacío o de otro tipo da null", () => {
    for (const team of [
        undefined,
        null,
        {},
        { id: null },
        { id: undefined },
        { id: "" },
        { id: NaN },
        { id: Infinity },
        { id: {} },
        { id: [] },
        { id: true },
    ]) {
        assert.equal(teamIdOf(team), null, JSON.stringify(team))
    }
})

test("kind: la matriz es la de predictionKind (win/advance/null)", () => {
    const cases = [
        // [type, leg, torneo, esperado]
        ["regular", null, null, "win"],
        ["regular", null, TOURNAMENT("league"), "win"],
        ["playoff", null, TOURNAMENT("world_cup"), "advance"],
        ["playin", null, TOURNAMENT("world_cup"), "advance"],
        ["playoff", null, TOURNAMENT("league_playin_playoff"), "advance"],
        ["playin", null, TOURNAMENT("league_playin_playoff"), "advance"],
        ["playoff", null, TOURNAMENT("american_cup"), "advance"],
        ["playin", null, TOURNAMENT("american_cup"), "advance"],
        ["playoff", null, TOURNAMENT("playoff", "single"), "advance"],
        ["playoff", null, TOURNAMENT("champions_league"), "win"],
        ["playin", null, TOURNAMENT("champions_league"), null],
        ["playoff", 1, TOURNAMENT("playoff", "two_legged"), "win"],
        ["playoff", 2, TOURNAMENT("playoff", "two_legged"), "win"],
        ["playoff", 3, TOURNAMENT("playoff", "two_legged"), null],
        ["playoff", null, TOURNAMENT("playoff", "two_legged"), null],
        ["playin", 1, TOURNAMENT("playoff", "two_legged"), null],
        // Torneo sin format: lo mismo que predictionKind con un torneo vacío.
        ["playoff", null, TOURNAMENT(null), "advance"],
        // Sin torneo resoluble no se adivina "advance".
        ["playoff", null, null, null],
        ["playin", null, null, null],
        // Type nulo o desconocido.
        [null, null, TOURNAMENT("world_cup"), null],
        [undefined, null, TOURNAMENT("world_cup"), null],
        ["friendly", null, TOURNAMENT("world_cup"), null],
    ]
    for (const [type, leg, tournamentContext, expected] of cases) {
        const context = buildEventContext(
            base({ type, leg, tournamentContext })
        )
        assert.equal(
            context.kind,
            expected,
            `${type}/${leg}/${JSON.stringify(tournamentContext)}`
        )
        // Misma respuesta que la lógica de la predicción (kind -> predictionKind).
        if (tournamentContext !== null && type !== undefined) {
            const predicted = predictionKind({
                match: { type, leg },
                tournament: tournamentContext,
            })
            if (type === "regular" || type === "playoff" || type === "playin") {
                const mapped = { outcomes: "win", advance: "advance" }
                assert.equal(context.kind, mapped[predicted] ?? null)
            }
        }
    }
})

test("kind: prediction.js y eventProbability.js siguen exportando las mismas funciones", () => {
    assert.equal(prediction.predictionKind, predictionKind)
    assert.equal(eventKind, eventKindFromMatchKind)
})

test("tournamentId, leg, formato y modo salen del partido y su contexto", () => {
    const context = buildEventContext(
        base({
            leg: 2,
            tournament: { id: 12345, name: "Copa" },
            tournamentContext: TOURNAMENT("playoff", "two_legged"),
        })
    )
    assert.equal(context.tournamentId, "12345")
    assert.equal(context.leg, 2)
    assert.equal(context.tournamentFormat, "playoff")
    assert.equal(context.tournamentPlayoffMode, "two_legged")

    const empty = buildEventContext(
        base({ tournament: undefined, leg: 7, tournamentContext: undefined })
    )
    assert.equal(empty.tournamentId, null)
    assert.equal(empty.leg, null)
    assert.equal(empty.tournamentFormat, null)
    assert.equal(empty.tournamentPlayoffMode, null)
    assert.equal(
        buildEventContext(base({ tournament: { id: "" } })).tournamentId,
        null
    )
})

test("playedAtPrecision: válida tal cual, inválida o ausente null", () => {
    for (const precision of PLAYED_AT_PRECISIONS) {
        assert.equal(
            buildEventContext(base({ playedAtPrecision: precision }))
                .playedAtPrecision,
            precision
        )
    }
    for (const precision of ["hora", "", null, undefined, 3]) {
        assert.equal(
            buildEventContext(base({ playedAtPrecision: precision }))
                .playedAtPrecision,
            null,
            String(precision)
        )
    }
})

test("penales: gana el equipo 1, gana el equipo 2 y comparación como string", () => {
    assert.deepEqual(toShootout(base(penalties())), {
        p1: 5,
        p2: 4,
        winner: "p1",
    })
    assert.deepEqual(toShootout(base(penalties({ teamThatWon: { id: 2 } }))), {
        p1: 4,
        p2: 5,
        winner: "p2",
    })
    // Id numérico en un lado y string en el otro: se compara como string.
    assert.deepEqual(
        toShootout(base(penalties({ teamThatWon: { id: "1" } }))),
        { p1: 5, p2: 4, winner: "p1" }
    )
    // El id 0 es válido.
    assert.deepEqual(
        toShootout(
            base({
                teamP1: { id: 0, name: "Cero" },
                ...penalties({ teamThatWon: { id: 0 } }),
            })
        ),
        { p1: 5, p2: 4, winner: "p1" }
    )
    // Ganador que no es ninguno de los dos equipos: se orienta como P2 (regla
    // histórica del historial).
    assert.deepEqual(toShootout(base(penalties({ teamThatWon: { id: 99 } }))), {
        p1: 4,
        p2: 5,
        winner: "p2",
    })

    const context = buildEventContext(base(penalties()))
    assert.equal(context.shootoutP1, 5)
    assert.equal(context.shootoutP2, 4)
    assert.equal(context.shootoutWinner, "p1")
})

test("penales: sin tanda o con datos insuficientes todo es null", () => {
    const invalid = [
        base(),
        base({ outcome: {} }),
        base({ outcome: null }),
        base({
            ...penalties(),
            outcome: { ...penalties().outcome, penalties: false },
        }),
        // Marcador no empatado.
        base({ ...penalties(), scoreP1: 2 }),
        // Ids faltantes.
        base({ ...penalties(), teamP1: { name: "Boca" } }),
        base({ ...penalties(), teamP1: undefined }),
        base(penalties({ teamThatWon: undefined })),
        base(penalties({ teamThatWon: { id: null } })),
        // Tanda no entera o negativa.
        base(penalties({ scoreFromTeamThatWon: 4.5 })),
        base(penalties({ scoreFromTeamThatLost: "4" })),
        base(penalties({ scoreFromTeamThatLost: -1 })),
        base(penalties({ scoreFromTeamThatWon: undefined })),
    ]
    for (const match of invalid) {
        assert.equal(toShootout(match), null, JSON.stringify(match.outcome))
        const context = buildEventContext(match)
        assert.equal(context.shootoutP1, null)
        assert.equal(context.shootoutP2, null)
        assert.equal(context.shootoutWinner, null)
    }
})

// Quita los campos nuevos del partido: el motor tiene que dar lo mismo.
const stripContext = (match) => {
    const { leg, playedAtPrecision, outcome, tournamentContext, ...rest } =
        match
    return rest
}

test("el motor da el mismo rating con y sin los insumos nuevos y el empate por penales vale 0,5", () => {
    const withContext = [
        base({
            _id: "a",
            leg: 1,
            playedAtPrecision: "exact",
            tournamentContext: TOURNAMENT("world_cup"),
            ...penalties(),
        }),
        base({
            _id: "b",
            playerP1: SANTI,
            playerP2: NICO,
            scoreP1: 3,
            scoreP2: 1,
            playedAt: new Date("2026-01-02T15:00:00Z"),
            playedAtPrecision: "day",
            tournamentContext: TOURNAMENT("world_cup"),
        }),
        base({
            _id: "c",
            type: "regular",
            scoreP1: 0,
            scoreP2: 2,
            playedAt: new Date("2026-01-03T15:00:00Z"),
            tournamentContext: TOURNAMENT("league"),
        }),
    ]
    const options = { teamStrength: null }
    const full = calculatePlayerRatings(withContext, options)
    const plain = calculatePlayerRatings(withContext.map(stripContext), options)

    assert.equal(full.events.length, 3)
    full.events.forEach((event, index) => {
        const other = plain.events[index]
        for (const field of ["matchId", "expectedP1", "resultP1", "delta"]) {
            assert.equal(event[field], other[field], field)
        }
        for (const side of ["p1", "p2"]) {
            assert.equal(event[side].before, other[side].before)
            assert.equal(event[side].games, other[side].games)
        }
    })
    assert.equal(full.events[0].resultP1, 0.5)
    assert.equal(full.events[0].shootoutP1, 5)
    assert.equal(full.events[0].p1.teamId, 1)
    assert.equal(full.events[0].p2.teamId, 2)
    assert.equal(full.events[0].kind, "advance")
    // Sin los insumos nuevos los campos del evento son null (nunca undefined).
    assert.equal(plain.events[0].kind, null)
    assert.equal(plain.events[0].tournamentId, "t1")
    assert.equal(plain.events[0].shootoutP1, null)
    assert.equal(plain.events[0].leg, null)
    assert.equal(plain.events[0].playedAtPrecision, null)
    for (const player of ["n", "s"]) {
        assert.equal(
            full.players.get(player).rating,
            plain.players.get(player).rating
        )
    }
})

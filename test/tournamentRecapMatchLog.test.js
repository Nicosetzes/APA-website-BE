process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
    buildMatchEntries,
    selectMatches,
} = require("../controller/getTournamentRecapContext/matchLog")
const { COMPACT_REGULAR_MATCH_LIMIT } = require("../config/tournamentRecap")
const {
    LEO,
    MAX,
    NICO,
    SANTI,
    mkMatch,
    stubEvent,
    stubTimeline,
    team,
} = require("./fixtures/tournamentRecap")

const T_NICO = team(1, "Liverpool")
const T_MAX = team(2, "Chelsea")
const T_LEO = team(3, "Bayern")
const T_SANTI = team(4, "Milan")

const log = ({
    matches,
    events,
    format = "league",
    playoffMode,
    topTwoByGroup,
}) =>
    buildMatchEntries({
        matches,
        timeline: stubTimeline(events),
        tournament: { format, playoffMode },
        topTwoByGroup,
    })

test("league: seq, stage, winner, V/E/D odds and signed rating deltas", () => {
    const matches = [
        mkMatch({
            n: 1,
            group: "A",
            p1: NICO,
            t1: T_NICO,
            s1: 2,
            p2: MAX,
            t2: T_MAX,
            s2: 1,
        }),
        mkMatch({
            n: 2,
            group: "A",
            p1: LEO,
            t1: T_LEO,
            s1: 1,
            p2: SANTI,
            t2: T_SANTI,
            s2: 1,
        }),
        mkMatch({
            n: 3,
            group: "A",
            p1: NICO,
            t1: T_NICO,
            s1: 0,
            p2: LEO,
            t2: T_LEO,
            s2: 3,
        }),
    ]
    const entries = log({
        matches,
        events: [
            stubEvent(matches[0], { expectedP1: 0.6, delta: 4.84 }),
            stubEvent(matches[1], { expectedP1: 0.5, delta: 0 }),
            stubEvent(matches[2], { expectedP1: 0.75, delta: -8.4 }),
        ],
    })

    assert.deepEqual(
        entries.map(({ seq, stage, winner }) => [seq, stage, winner]),
        [
            [1, "regular", "p1"],
            [2, "regular", "draw"],
            [3, "regular", "p2"],
        ]
    )

    const [first, draw, third] = entries

    assert.deepEqual(first.odds, {
        kind: "expected_points",
        p1Win: 0.494,
        draw: 0.211,
        p2Win: 0.295,
    })
    // Las tres probabilidades suman 1.
    assert.equal(
        Math.round(
            (first.odds.p1Win + first.odds.draw + first.odds.p2Win) * 1000
        ),
        1000
    )
    assert.deepEqual(first.ratingDelta, { p1: 4.8, p2: -4.8 })
    assert.deepEqual(third.ratingDelta, { p1: -8.4, p2: 8.4 })
    // `-0` no se serializa.
    assert.equal(Object.is(draw.ratingDelta.p1, -0), false)
    assert.equal(Object.is(draw.ratingDelta.p2, -0), false)
    assert.deepEqual(first.p1, {
        player: "Nico",
        playerId: NICO.id,
        team: "Liverpool",
        teamId: 1,
        ovr: null,
        ratingBefore: 1500,
        provisional: false,
    })
    // Gana quien tenía 25 % de esperado: sorpresa.
    assert.equal(third.upset, true)
    assert.equal(first.upset, false)
    assert.equal(draw.upset, false)
})

test("a match with valid false and no rating event has no odds or delta", () => {
    const matches = [
        mkMatch({
            n: 1,
            p1: NICO,
            t1: T_NICO,
            s1: 3,
            p2: MAX,
            t2: T_MAX,
            s2: 0,
            valid: false,
        }),
    ]
    const [entry] = log({ matches, events: [] })

    assert.equal(entry.valid, false)
    assert.equal(entry.odds, null)
    assert.equal(entry.ratingDelta, null)
    assert.equal(entry.upset, null)
    assert.equal(entry.rated, false)
    assert.equal(entry.p1.ratingBefore, null)
    assert.equal(entry.p1.provisional, null)
    assert.equal(entry.winner, "p1")
})

test("league_playin_playoff: single-match knockouts use advance odds and penalties", () => {
    const matches = [
        mkMatch({
            n: 1,
            type: "playin",
            playoffId: 1,
            seeds: ["7", "10"],
            p1: NICO,
            t1: T_NICO,
            s1: 2,
            p2: MAX,
            t2: T_MAX,
            s2: 0,
        }),
        mkMatch({
            n: 2,
            type: "playoff",
            playoffId: 15,
            seeds: ["1", "2"],
            p1: LEO,
            t1: T_LEO,
            s1: 1,
            p2: SANTI,
            t2: T_SANTI,
            s2: 1,
            pens: [3, 5],
        }),
    ]
    const entries = log({
        matches,
        format: "league_playin_playoff",
        events: [
            stubEvent(matches[0], { expectedP1: 0.58 }),
            stubEvent(matches[1], { expectedP1: 0.8 }),
        ],
    })

    assert.deepEqual(entries[0].odds, {
        kind: "advance",
        advanceP1: 0.58,
        advanceP2: 0.42,
    })
    assert.equal(entries[0].round, null)

    const final = entries[1]

    assert.equal(final.round, "final")
    assert.deepEqual(final.score, [1, 1])
    // Goles iguales: el ganador sale del `outcome` y los penales van aparte.
    assert.equal(final.winner, "p2")
    assert.deepEqual(final.penalties, { winner: "p2", score: [3, 5] })
    assert.deepEqual(final.odds, {
        kind: "advance",
        advanceP1: 0.8,
        advanceP2: 0.2,
    })
    assert.equal(final.upset, true)
})

test("world_cup: group matches have V/E/D odds and the bracket advance odds", () => {
    const matches = [
        mkMatch({
            n: 1,
            group: "A",
            p1: NICO,
            t1: T_NICO,
            s1: 1,
            p2: MAX,
            t2: T_MAX,
            s2: 0,
        }),
        mkMatch({
            n: 2,
            type: "playoff",
            playoffId: 9,
            seeds: ["1", "2"],
            p1: NICO,
            t1: T_NICO,
            s1: 2,
            p2: LEO,
            t2: T_LEO,
            s2: 1,
        }),
    ]
    const entries = log({
        matches,
        format: "world_cup",
        events: matches.map((match) => stubEvent(match)),
    })

    assert.equal(entries[0].odds.kind, "expected_points")
    assert.equal(entries[1].odds.kind, "advance")
    assert.equal(entries[1].round, "quarterfinal")
})

test("playoff two_legged: legs 1 and 2 have V/E/D odds and leg 3 (golden goal) has none", () => {
    const base = { type: "playoff", playoffId: 31, seeds: ["1", "2"] }
    const matches = [
        mkMatch({
            n: 1,
            ...base,
            leg: 1,
            legDraw: true,
            p1: NICO,
            t1: T_NICO,
            s1: 1,
            p2: MAX,
            t2: T_MAX,
            s2: 1,
        }),
        mkMatch({
            n: 2,
            ...base,
            leg: 2,
            legDraw: true,
            p1: MAX,
            t1: T_MAX,
            s1: 0,
            p2: NICO,
            t2: T_NICO,
            s2: 0,
        }),
        mkMatch({
            n: 3,
            ...base,
            leg: 3,
            p1: NICO,
            t1: T_NICO,
            s1: 1,
            p2: MAX,
            t2: T_MAX,
            s2: 0,
        }),
    ]
    const entries = log({
        matches,
        format: "playoff",
        playoffMode: "two_legged",
        events: matches.map((match) => stubEvent(match)),
    })

    assert.deepEqual(
        entries.map(({ leg, odds }) => [leg, odds?.kind ?? null]),
        [
            [1, "expected_points"],
            [2, "expected_points"],
            [3, null],
        ]
    )
    assert.equal(entries[0].winner, "draw")
    assert.equal(entries[2].round, "final")
    assert.equal(entries[2].winner, "p1")
})

test("champions_league: playoff legs have V/E/D odds, the play-in none, and 29 is the final", () => {
    const matches = [
        mkMatch({
            n: 1,
            type: "playin",
            playoffId: 1,
            seeds: ["1", "2"],
            p1: NICO,
            t1: T_NICO,
            s1: 1,
            p2: MAX,
            t2: T_MAX,
            s2: 0,
        }),
        mkMatch({
            n: 2,
            type: "playoff",
            playoffId: 17,
            legDraw: true,
            seeds: ["1", "2"],
            p1: NICO,
            t1: T_NICO,
            s1: 1,
            p2: LEO,
            t2: T_LEO,
            s2: 1,
        }),
        mkMatch({
            n: 3,
            type: "playoff",
            playoffId: 29,
            seeds: ["1", "2"],
            p1: NICO,
            t1: T_NICO,
            s1: 2,
            p2: SANTI,
            t2: T_SANTI,
            s2: 0,
        }),
    ]
    const entries = log({
        matches,
        format: "champions_league",
        events: matches.map((match) => stubEvent(match)),
    })

    assert.equal(entries[0].odds, null)
    assert.equal(entries[1].odds.kind, "expected_points")
    assert.equal(entries[1].round, "quarterfinal")
    assert.equal(entries[2].round, "final")
})

test("importance: stage base, upset and penalty boosts, capped at 5", () => {
    const knockout = (n, playoffId, extra = {}) =>
        mkMatch({
            n,
            type: "playoff",
            playoffId,
            seeds: ["1", "2"],
            p1: NICO,
            t1: T_NICO,
            s1: 2,
            p2: MAX,
            t2: T_MAX,
            s2: 1,
            ...extra,
        })
    const matches = [
        mkMatch({
            n: 1,
            p1: NICO,
            t1: T_NICO,
            s1: 1,
            p2: MAX,
            t2: T_MAX,
            s2: 0,
        }),
        knockout(2, 1), // octavos
        knockout(3, 9), // cuartos
        knockout(4, 13), // semis
        knockout(5, 15), // final
        knockout(6, 13, { s1: 1, s2: 1, pens: [4, 2] }), // semis por penales
        knockout(7, 15, { s1: 1, s2: 1, pens: [5, 4] }), // final por penales
        mkMatch({
            n: 8,
            p1: NICO,
            t1: T_NICO,
            s1: 5,
            p2: MAX,
            t2: T_MAX,
            s2: 0,
        }), // goleada
    ]
    const entries = log({
        matches,
        format: "league_playin_playoff",
        // Todos favoritos de 60 %: ninguna sorpresa.
        events: matches.map((match) => stubEvent(match, { expectedP1: 0.6 })),
    })

    assert.deepEqual(
        entries.map(({ importance }) => importance),
        [1, 3, 3, 4, 5, 5, 5, 2]
    )
    assert.ok(entries.every(({ importance }) => importance <= 5))

    // Sorpresa en una final: tope de 5.
    const upsetFinal = log({
        matches: [knockout(1, 15)],
        format: "league_playin_playoff",
        events: [stubEvent(knockout(1, 15), { expectedP1: 0.1 })],
    })

    assert.equal(upsetFinal[0].importance, 5)
})

test("importance adds one for a regular match between the final top two of a group", () => {
    const matches = [
        mkMatch({
            n: 1,
            group: "A",
            p1: NICO,
            t1: T_NICO,
            s1: 1,
            p2: MAX,
            t2: T_MAX,
            s2: 0,
        }),
        mkMatch({
            n: 2,
            group: "A",
            p1: NICO,
            t1: T_NICO,
            s1: 1,
            p2: LEO,
            t2: T_LEO,
            s2: 0,
        }),
    ]
    const entries = log({
        matches,
        events: matches.map((match) => stubEvent(match)),
        topTwoByGroup: new Map([["A", new Set(["1", "2"])]]),
    })

    assert.deepEqual(
        entries.map(({ importance }) => importance),
        [2, 1]
    )
})

test("compact keeps every play-in and playoff match plus the best regular ones; full keeps all", () => {
    const regular = Array.from({ length: 40 }, (_, index) =>
        mkMatch({
            n: index + 1,
            group: "A",
            p1: NICO,
            t1: T_NICO,
            // Las goleadas (importancia 2) son las pares.
            s1: index % 2 === 0 ? 5 : 1,
            p2: MAX,
            t2: T_MAX,
            s2: 0,
        })
    )
    const knockout = [
        mkMatch({
            n: 41,
            type: "playin",
            playoffId: 1,
            seeds: ["7", "10"],
            p1: NICO,
            t1: T_NICO,
            s1: 1,
            p2: MAX,
            t2: T_MAX,
            s2: 0,
        }),
        mkMatch({
            n: 42,
            type: "playoff",
            playoffId: 15,
            seeds: ["1", "2"],
            p1: NICO,
            t1: T_NICO,
            s1: 1,
            p2: MAX,
            t2: T_MAX,
            s2: 0,
        }),
    ]
    const matches = [...regular, ...knockout]
    const entries = log({
        matches,
        format: "league_playin_playoff",
        events: matches.map((match) => stubEvent(match)),
    })
    const compact = selectMatches(entries, "compact")
    const full = selectMatches(entries, "full")

    assert.equal(full.matches.length, 42)
    assert.equal(full.matchesOmitted, 0)
    assert.equal(compact.matches.length, COMPACT_REGULAR_MATCH_LIMIT + 2)
    assert.equal(compact.matchesOmitted, 42 - compact.matches.length)
    // Entre iguales, los primeros que se jugaron; en orden cronológico.
    assert.deepEqual(
        compact.matches
            .slice(0, COMPACT_REGULAR_MATCH_LIMIT)
            .map(({ seq }) => seq),
        Array.from({ length: COMPACT_REGULAR_MATCH_LIMIT }, (_, i) => i * 2 + 1)
    )
    assert.deepEqual(
        compact.matches.slice(-2).map(({ stage }) => stage),
        ["playin", "playoff"]
    )
    const seqs = compact.matches.map(({ seq }) => seq)
    assert.deepEqual(
        seqs,
        [...seqs].sort((a, b) => a - b)
    )
})

test("serialized matches expose no internal fields or player ids", () => {
    const matches = [
        mkMatch({
            n: 1,
            p1: NICO,
            t1: T_NICO,
            s1: 1,
            p2: MAX,
            t2: T_MAX,
            s2: 0,
        }),
    ]
    const entries = log({ matches, events: matches.map((m) => stubEvent(m)) })
    const [serialized] = selectMatches(entries, "full").matches

    assert.equal("expectedWinner" in serialized, false)
    assert.equal("rated" in serialized, false)
    assert.equal("playedAtPrecision" in serialized, false)
    assert.equal("playerId" in serialized.p1, false)
    // Pero los builders internos sí lo tienen.
    assert.equal(entries[0].p1.playerId, NICO.id)
})

test("a player with fewer than 10 previous games is provisional", () => {
    const matches = [
        mkMatch({
            n: 1,
            p1: NICO,
            t1: T_NICO,
            s1: 1,
            p2: MAX,
            t2: T_MAX,
            s2: 0,
        }),
    ]
    const [entry] = log({
        matches,
        events: [stubEvent(matches[0], { games1: 9, games2: 10 })],
    })

    assert.equal(entry.p1.provisional, true)
    assert.equal(entry.p2.provisional, false)
})

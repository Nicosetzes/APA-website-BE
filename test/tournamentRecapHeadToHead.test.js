process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
    buildHeadToHead,
} = require("../controller/getTournamentRecapContext/headToHead")
const {
    buildMatchEntries,
} = require("../controller/getTournamentRecapContext/matchLog")
const {
    LEO,
    MAX,
    NICO,
    mkMatch,
    stubEvent,
    stubTimeline,
    team,
} = require("./fixtures/tournamentRecap")

const T = {
    nico: team(1, "Liverpool"),
    max: team(2, "Chelsea"),
    leo: team(3, "Bayern"),
}

const ranked = (tournamentId, n, p1, t1, s1, p2, t2, s2, extra = {}) =>
    mkMatch({ n, tournamentId, p1, t1, s1, p2, t2, s2, ...extra })

// Historial: dos partidos previos Nico-Max (uno ganado por cada lado) y un
// empate a penales Nico-Leo.
const history = () => [
    ranked("previo", 1, NICO, T.nico, 2, MAX, T.max, 0),
    ranked("previo", 2, MAX, T.max, 1, NICO, T.nico, 0),
    ranked("previo", 3, NICO, T.nico, 1, LEO, T.leo, 1, {
        type: "playoff",
        playoffId: 15,
        seeds: ["1", "2"],
        pens: [5, 4],
    }),
]

const tournament = () => [
    ranked("actual", 100, NICO, T.nico, 3, MAX, T.max, 1),
    ranked("actual", 101, MAX, T.max, 2, NICO, T.nico, 2),
    ranked("actual", 102, NICO, T.nico, 1, MAX, T.max, 1, {
        type: "playoff",
        playoffId: 15,
        seeds: ["1", "2"],
        pens: [4, 5],
    }),
]

const run = (overrides = {}) => {
    const matches = tournament()
    const entries = buildMatchEntries({
        matches,
        timeline: stubTimeline(matches.map((match) => stubEvent(match))),
        tournament: { format: "league_playin_playoff" },
    })

    return buildHeadToHead({
        entries,
        ratingMatches: [...history(), ...matches],
        tournamentId: "actual",
        firstMatchTime: matches[0].playedAt.getTime(),
        finalists: { championId: MAX.id, runnerUpId: NICO.id },
        ...overrides,
    })
}

test("the in-tournament record is by outcome and counts goals", () => {
    const [pair] = run()

    assert.equal(pair.players.length, 2)
    // Orden por id: Nico (a) y Max (b).
    assert.deepEqual(
        pair.players.map(({ name }) => name),
        ["Nico", "Max"]
    )
    // 3-1 Nico, 2-2 empate, 1-1 con penales 4-5 que gana Max.
    assert.deepEqual(pair.inTournament, {
        matches: 3,
        aWins: 1,
        draws: 1,
        bWins: 1,
        aGoals: 6,
        bGoals: 4,
    })
    assert.equal(pair.isFinal, true)
})

test("the all-time record before the tournament excludes the tournament's own matches", () => {
    const [pair] = run()

    // Previo Nico-Max: gana Nico (2-0) y gana Max (1-0).
    assert.deepEqual(pair.allTimeBefore, {
        criterion:
            "Historial por marcador: un partido decidido por penales cuenta como empate. Solo partidos anteriores al primer partido del torneo.",
        matches: 2,
        aWins: 1,
        draws: 0,
        bWins: 1,
    })
})

test("a penalty-decided match counts as a draw in the all-time record", () => {
    const matches = tournament()
    const entries = buildMatchEntries({
        matches: [ranked("actual", 100, NICO, T.nico, 1, LEO, T.leo, 0)],
        timeline: stubTimeline(),
        tournament: { format: "league" },
    })
    const [pair] = buildHeadToHead({
        entries,
        ratingMatches: [...history(), ...matches],
        tournamentId: "actual",
        firstMatchTime: matches[0].playedAt.getTime(),
        finalists: null,
    })

    assert.equal(pair.allTimeBefore.matches, 1)
    assert.equal(pair.allTimeBefore.draws, 1)
    assert.equal(pair.isFinal, false)
})

test("matches on or after the first tournament match are not history", () => {
    const [pair] = run({
        ratingMatches: [
            ...history(),
            // Mismo instante que el primer partido del torneo y posterior.
            ranked("otro", 100, NICO, T.nico, 5, MAX, T.max, 0),
            ranked("otro", 150, NICO, T.nico, 5, MAX, T.max, 0),
        ],
    })

    assert.equal(pair.allTimeBefore.matches, 2)
})

test("without a first match date there is no reliable history", () => {
    const [pair] = run({ firstMatchTime: null })

    assert.equal(pair.allTimeBefore, null)
})

test("undated historic matches count as previous", () => {
    const undated = ranked("previo", 4, NICO, T.nico, 4, MAX, T.max, 0)
    delete undated.playedAt
    const [pair] = run({ ratingMatches: [...history(), undated] })

    assert.equal(pair.allTimeBefore.matches, 3)
})

test("only pairs that met in the tournament appear, and matches between teams of one player are ignored", () => {
    const matches = [
        ranked("actual", 100, NICO, T.nico, 1, NICO, team(5, "Ajax"), 0),
        ranked("actual", 101, NICO, T.nico, 1, LEO, T.leo, 0, { valid: false }),
    ]
    const entries = buildMatchEntries({
        matches,
        timeline: stubTimeline(),
        tournament: { format: "league" },
    })

    assert.deepEqual(
        buildHeadToHead({
            entries,
            ratingMatches: [],
            tournamentId: "actual",
            firstMatchTime: 0,
            finalists: null,
        }),
        []
    )
})

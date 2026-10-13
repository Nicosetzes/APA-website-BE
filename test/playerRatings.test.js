const assert = require("node:assert/strict")
const test = require("node:test")

const {
    calculatePlayerRatings,
    expectedScore,
    rankPlayers,
    snapshotBefore,
} = require("../service/playerRatings")
const {
    evaluateEvents,
    tuneRatingParameters,
} = require("../service/playerRatings/evaluation")

const NICO = { id: "n", name: "Nico" }
const SANTI = { id: "s", name: "Santi" }
const LEO = { id: "l", name: "Leo" }

let sequence = 0
const match = (playerP1, scoreP1, playerP2, scoreP2, playedAt, extra = {}) => ({
    _id: `m${String((sequence += 1)).padStart(4, "0")}`,
    playerP1,
    scoreP1,
    playerP2,
    scoreP2,
    playedAt: new Date(playedAt),
    ...extra,
})

const OPTIONS = { initialRating: 1500, kFactor: 20, marginWeight: 0 }

test("expected score is symmetric and 0.5 between equals", () => {
    assert.equal(expectedScore(1500, 1500), 0.5)
    assert.ok(
        Math.abs(expectedScore(1600, 1500) + expectedScore(1500, 1600) - 1) <
            1e-12
    )
    // 400 puntos de ventaja: 10 a 1.
    assert.ok(Math.abs(expectedScore(1900, 1500) - 10 / 11) < 1e-12)
})

test("a win moves the rating by K/2 between equals and is zero-sum", () => {
    const { players, events } = calculatePlayerRatings(
        [match(NICO, 2, SANTI, 0, "2026-01-01")],
        OPTIONS
    )

    assert.equal(players.get("n").rating, 1510)
    assert.equal(players.get("s").rating, 1490)
    assert.equal(events[0].delta, 10)
    assert.equal(players.get("n").rating + players.get("s").rating, 3000)
})

test("a draw between equals changes nothing, and so does a penalty shootout", () => {
    const { players } = calculatePlayerRatings(
        [
            match(NICO, 1, SANTI, 1, "2026-01-01"),
            match(NICO, 2, SANTI, 2, "2026-01-02", {
                outcome: { draw: true, penalties: true },
            }),
        ],
        OPTIONS
    )

    assert.equal(players.get("n").rating, 1500)
    assert.equal(players.get("n").draws, 2)
})

test("beating a stronger player pays more than beating a weaker one", () => {
    const { events } = calculatePlayerRatings(
        [
            match(NICO, 3, SANTI, 0, "2026-01-01"),
            match(NICO, 3, SANTI, 0, "2026-01-02"),
            match(LEO, 1, SANTI, 0, "2026-01-03"),
            match(LEO, 1, NICO, 0, "2026-01-04"),
        ],
        OPTIONS
    )

    const [, , beatsWeaker, beatsStronger] = events
    assert.ok(beatsStronger.delta > beatsWeaker.delta)
})

test("goal difference only matters when marginWeight is positive", () => {
    const run = (marginWeight) =>
        calculatePlayerRatings([match(NICO, 5, SANTI, 0, "2026-01-01")], {
            ...OPTIONS,
            marginWeight,
        }).events[0].delta

    assert.equal(run(0), 10)
    assert.ok(run(0.5) > 10)
})

test("matches are processed chronologically whatever order they arrive in", () => {
    const first = match(NICO, 1, SANTI, 0, "2026-01-01")
    const second = match(SANTI, 1, NICO, 0, "2026-01-02")
    const third = match(NICO, 4, SANTI, 0, "2026-01-03")

    const forward = calculatePlayerRatings([first, second, third], OPTIONS)
    const shuffled = calculatePlayerRatings([third, first, second], OPTIONS)

    assert.equal(
        forward.players.get("n").rating,
        shuffled.players.get("n").rating
    )
    assert.deepEqual(
        shuffled.events.map(({ matchId }) => matchId),
        [first._id, second._id, third._id]
    )
})

test("same timestamp falls back to _id order and undated matches go first", () => {
    const sameTime = "2026-01-01T00:00:00Z"
    const a = match(NICO, 1, SANTI, 0, sameTime)
    const b = match(NICO, 1, SANTI, 0, sameTime)
    const undated = { ...match(LEO, 1, SANTI, 0, sameTime), playedAt: null }

    const { events } = calculatePlayerRatings([b, a, undated], OPTIONS)

    assert.deepEqual(
        events.map(({ matchId }) => matchId),
        [undated._id, a._id, b._id]
    )
})

test("incomplete, invalid, unplayed and self matches are ignored", () => {
    const { events } = calculatePlayerRatings(
        [
            match(NICO, 1, SANTI, 0, "2026-01-01"),
            match(NICO, 1, SANTI, 0, "2026-01-02", { valid: false }),
            match(NICO, 1, SANTI, 0, "2026-01-03", { played: false }),
            match(NICO, 1, NICO, 0, "2026-01-04"),
            match(NICO, undefined, SANTI, 0, "2026-01-05"),
            match(NICO, 1.5, SANTI, 0, "2026-01-06"),
            match({ name: "Sin id" }, 1, SANTI, 0, "2026-01-07"),
        ],
        OPTIONS
    )

    assert.equal(events.length, 1)
})

test("snapshotBefore rebuilds ratings and records at any cutoff", () => {
    const matches = [
        match(NICO, 2, SANTI, 0, "2026-01-01T12:00:00Z"),
        match(NICO, 2, SANTI, 0, "2026-01-05T12:00:00Z"),
        match(LEO, 1, NICO, 1, "2026-01-09T12:00:00Z"),
    ]
    const { events, players } = calculatePlayerRatings(matches, OPTIONS)

    const afterFirstWeek = snapshotBefore(
        events,
        new Date("2026-01-06T00:00:00Z").getTime(),
        1500
    )
    assert.equal(afterFirstWeek.get("n").matches, 2)
    assert.equal(afterFirstWeek.get("n").wins, 2)
    assert.ok(!afterFirstWeek.has("l"))
    assert.equal(
        afterFirstWeek.get("n").rating,
        events[1].p1.before + events[1].delta
    )

    const everything = snapshotBefore(events, null, 1500)
    assert.equal(everything.get("n").rating, players.get("n").rating)
    assert.equal(everything.get("l").rating, players.get("l").rating)
    assert.equal(everything.get("n").draws, 1)

    const nothing = snapshotBefore(
        events,
        new Date("2026-01-01T00:00:00Z").getTime(),
        1500
    )
    assert.equal(nothing.size, 0)
})

test("a cutoff exactly on a match time leaves that match out", () => {
    const { events } = calculatePlayerRatings(
        [match(NICO, 1, SANTI, 0, "2026-01-01T03:00:00Z")],
        OPTIONS
    )

    const at = new Date("2026-01-01T03:00:00Z").getTime()
    assert.equal(snapshotBefore(events, at, 1500).size, 0)
    assert.equal(snapshotBefore(events, at + 1, 1500).size, 2)
})

test("rankPlayers orders by rating, then matches, then name, with sequential positions", () => {
    const snapshot = new Map([
        ["a", { id: "a", name: "Beto", rating: 1500, matches: 4 }],
        ["b", { id: "b", name: "Ana", rating: 1500, matches: 4 }],
        ["c", { id: "c", name: "Cris", rating: 1600, matches: 1 }],
        ["d", { id: "d", name: "Dani", rating: 1500, matches: 9 }],
        ["e", { id: "e", name: "Sin partidos", rating: 1700, matches: 0 }],
    ])

    assert.deepEqual(
        rankPlayers(snapshot).map(({ name, position }) => [name, position]),
        [
            ["Cris", 1],
            ["Dani", 2],
            ["Ana", 3],
            ["Beto", 4],
        ]
    )
})

test("evaluation skips cold-start matches and measures against the 0.5 baseline", () => {
    const matches = []
    for (let day = 1; day <= 30; day += 1) {
        // Nico gana casi siempre: el Elo tiene que aprenderlo y superar al azar.
        const date = `2026-02-${String(day).padStart(2, "0")}`
        matches.push(
            match(
                NICO,
                day % 6 === 0 ? 0 : 2,
                SANTI,
                day % 6 === 0 ? 1 : 0,
                date
            )
        )
    }

    const { events } = calculatePlayerRatings(matches, OPTIONS)
    const metrics = evaluateEvents(events, { minGames: 10 })

    assert.equal(metrics.matches, 20)
    assert.ok(metrics.logLoss < metrics.baselineLogLoss)
    assert.ok(metrics.brier < metrics.baselineBrier)
    assert.ok(metrics.favoriteAccuracy > 0.5)
    assert.ok(metrics.player1AverageScore > 0.5)
    assert.equal(
        metrics.calibration.reduce((total, { matches: n }) => total + n, 0),
        20
    )
})

test("evaluation of no matches reports null metrics instead of NaN", () => {
    const metrics = evaluateEvents([], { minGames: 10 })

    assert.equal(metrics.matches, 0)
    assert.equal(metrics.logLoss, null)
    assert.equal(metrics.favoriteAccuracy, null)
})

test("tuning picks parameters on the early part and reports the later part", () => {
    const matches = []
    for (let day = 1; day <= 60; day += 1) {
        const date = new Date(Date.UTC(2026, 0, day)).toISOString()
        matches.push(match(NICO, 3, SANTI, 1, date))
    }

    const { best, results, totalEvents } = tuneRatingParameters(
        matches,
        { kFactor: [8, 32], marginWeight: [0, 0.5] },
        { splitRatio: 0.5, minGames: 5 }
    )

    assert.equal(results.length, 4)
    assert.equal(totalEvents, 60)
    assert.ok(best.parameters.kFactor)
    assert.ok(best.train.matches > 0)
    assert.ok(best.test.matches > 0)
    assert.equal(
        best.train.logLoss,
        Math.min(...results.map(({ train }) => train.logLoss))
    )
})

test("team effect flags a team that keeps beating the Elo expectation", () => {
    const {
        summarizeTeamEffect,
    } = require("../service/playerRatings/evaluation")
    const matches = []

    for (let day = 1; day <= 60; day += 1) {
        const date = new Date(Date.UTC(2026, 0, day)).toISOString()
        // Con el equipo "Fuerte" Santi le gana siempre a Nico; el Elo, que sólo
        // ve jugadores, lo va a subestimar hasta que el rating lo alcance.
        const withStrong = day % 2 === 0
        matches.push({
            ...match(NICO, withStrong ? 0 : 2, SANTI, withStrong ? 3 : 0, date),
            teamP1: { id: 1, name: "Débil" },
            teamP2: { id: 2, name: withStrong ? "Fuerte" : "Normal" },
        })
    }

    const { events } = calculatePlayerRatings(matches, OPTIONS)
    const summary = summarizeTeamEffect(events, { minGames: 5, minMatches: 10 })

    assert.equal(summary.distinctTeams, 3)
    assert.equal(summary.teamsEvaluated, 3)
    assert.ok(summary.flagged >= 1)
    assert.ok(summary.top[0].z > summary.bottom[0].z)
    assert.equal(summary.expectedByChance, 3 * 0.0455)
})

test("team effect is null with no evaluable matches and ignores unnamed teams", () => {
    const {
        summarizeTeamEffect,
    } = require("../service/playerRatings/evaluation")

    assert.equal(summarizeTeamEffect([], { minGames: 0 }), null)

    const { events } = calculatePlayerRatings(
        [match(NICO, 1, SANTI, 0, "2026-01-01")],
        OPTIONS
    )
    const summary = summarizeTeamEffect(events, { minGames: 0, minMatches: 1 })

    assert.equal(summary.distinctTeams, 0)
    assert.deepEqual(summary.top, [])
})

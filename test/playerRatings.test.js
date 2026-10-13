const assert = require("node:assert/strict")
const test = require("node:test")

const {
    calculatePlayerRatings,
    expectedScore,
    rankPlayers,
    snapshotBefore,
} = require("../service/playerRatings")
const {
    compareTeamStrength,
    evaluateEvents,
    tuneRatingParameters,
} = require("../service/playerRatings/evaluation")
const {
    createTeamStrengthLookup,
} = require("../service/playerRatings/teamStrength")

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

const SINGLE_SIDED = {
    tournament: { id: "x", name: "Torneo" },
    teamP1: { id: 1, name: "Con rating" },
    teamP2: { id: 2, name: "Sin rating" },
}
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

// --- APA Rating 2.0: fuerza de equipo en el puntaje esperado ---

// Lookup sintético: cada partido trae sus overalls en `strength`.
const strengthOf = (m) => m.strength ?? null
const withStrength = (t1, t2) => ({ strength: { t1, t2 } })
const TEAM_OPTIONS = { ...OPTIONS, teamStrengthWeight: 25 }

test("the stronger team raises its side's expected score and lowers the other", () => {
    const run = (extra) =>
        calculatePlayerRatings(
            [match(NICO, 1, SANTI, 0, "2026-01-01", extra)],
            {
                ...TEAM_OPTIONS,
                teamStrength: strengthOf,
            }
        ).events[0]

    const even = run(withStrength(80, 80))
    const p1Stronger = run(withStrength(85, 80))
    const p2Stronger = run(withStrength(80, 85))

    assert.equal(even.expectedP1, 0.5)
    assert.ok(p1Stronger.expectedP1 > 0.5)
    assert.ok(p2Stronger.expectedP1 < 0.5)
    // Intercambiar los lados da el espejo exacto.
    assert.ok(
        Math.abs(p1Stronger.expectedP1 + p2Stronger.expectedP1 - 1) < 1e-12
    )
})

test("equal players with a 10-point overall gap expect about 0.81 at weight 25", () => {
    const { events } = calculatePlayerRatings(
        [match(NICO, 1, SANTI, 0, "2026-01-01", withStrength(90, 80))],
        { ...TEAM_OPTIONS, teamStrength: strengthOf }
    )

    assert.ok(
        Math.abs(events[0].expectedP1 - 1 / (1 + 10 ** (-250 / 400))) < 1e-12
    )
    assert.ok(Math.abs(events[0].expectedP1 - 0.808) < 0.001)
    assert.equal(events[0].teamAdjustment, 250)
})

test("missing team data behaves exactly like 1.0", () => {
    const base = [
        match(NICO, 2, SANTI, 0, "2026-01-01", SINGLE_SIDED),
        match(SANTI, 1, NICO, 1, "2026-01-02", SINGLE_SIDED),
        match(NICO, 0, SANTI, 3, "2026-01-03"),
    ]
    const reference = calculatePlayerRatings(base, {
        ...TEAM_OPTIONS,
        teamStrengthWeight: 0,
        teamStrength: null,
    })

    const variants = {
        "lookup sin datos": { teamStrength: () => null },
        "teamStrength null": { teamStrength: null },
        "partido sin torneo ni equipos": { teamStrength: strengthOf },
        "overall de un solo equipo": {
            teamStrength: createTeamStrengthLookup({
                editionByTournament: { x: "FIFA 19" },
                overallByTeamEdition: { "1|FIFA 19": 90 },
            }),
        },
    }
    for (const [label, extra] of Object.entries(variants)) {
        const result = calculatePlayerRatings(base, {
            ...TEAM_OPTIONS,
            ...extra,
        })
        assert.deepEqual(
            result.events.map(({ delta, expectedP1 }) => [delta, expectedP1]),
            reference.events.map(({ delta, expectedP1 }) => [
                delta,
                expectedP1,
            ]),
            label
        )
        assert.equal(
            result.players.get("n").rating,
            reference.players.get("n").rating,
            label
        )
        assert.ok(
            result.events.every(
                (event) =>
                    event.teamAdjustment === 0 &&
                    event.p1.teamOverall === null &&
                    event.p2.teamOverall === null
            ),
            label
        )
    }
})

test("weight 0 reproduces 1.0 exactly even when the lookup has data", () => {
    const results = [
        [2, 0],
        [1, 1],
        [0, 1],
        [3, 2],
        [0, 0],
        [1, 4],
    ]
    const matches = results.map(([a, b], index) =>
        match(
            index % 2 ? SANTI : NICO,
            a,
            index % 2 ? NICO : SANTI,
            b,
            `2026-02-0${index + 1}`,
            withStrength(70 + index * 3, 90 - index * 2)
        )
    )
    const plain = matches.map(({ strength, ...rest }) => rest)

    const withData = calculatePlayerRatings(matches, {
        ...OPTIONS,
        teamStrengthWeight: 0,
        teamStrength: strengthOf,
    })
    const without = calculatePlayerRatings(plain, {
        ...OPTIONS,
        teamStrengthWeight: 0,
        teamStrength: null,
    })

    assert.equal(withData.events.length, 6)
    for (const [index, event] of withData.events.entries()) {
        assert.equal(event.expectedP1, without.events[index].expectedP1)
        assert.equal(event.delta, without.events[index].delta)
        assert.equal(event.p1.before, without.events[index].p1.before)
    }
    assert.equal(
        withData.players.get("n").rating,
        without.players.get("n").rating
    )
    assert.equal(
        withData.players.get("s").rating,
        without.players.get("s").rating
    )
    // Con peso 0 no se aplicó término: los overalls no se exponen.
    assert.ok(withData.events.every((event) => event.p1.teamOverall === null))
})

test("the team term keeps the exchange zero-sum", () => {
    const matches = [
        match(NICO, 2, SANTI, 0, "2026-01-01", withStrength(88, 75)),
        match(SANTI, 1, LEO, 3, "2026-01-02", withStrength(70, 90)),
        match(LEO, 0, NICO, 0, "2026-01-03", withStrength(80, 80)),
        match(NICO, 1, SANTI, 2, "2026-01-04", withStrength(60, 92)),
    ]
    const { players, events, config } = calculatePlayerRatings(matches, {
        ...TEAM_OPTIONS,
        teamStrength: strengthOf,
    })

    const total = [...players.values()].reduce(
        (sum, player) => sum + player.rating,
        0
    )
    assert.ok(Math.abs(total - players.size * config.initialRating) < 1e-9)
    assert.ok(events.every((event) => event.teamAdjustment !== undefined))
    assert.ok(events.some((event) => event.teamAdjustment !== 0))
})

test("the displayed rating does not include the team term", () => {
    const { players, events } = calculatePlayerRatings(
        [match(NICO, 1, SANTI, 0, "2026-01-01", withStrength(90, 70))],
        { ...TEAM_OPTIONS, teamStrength: strengthOf }
    )
    const [event] = events

    assert.equal(event.p1.before, 1500)
    assert.equal(event.p2.before, 1500)
    assert.equal(
        players.get("n").rating,
        1500 + TEAM_OPTIONS.kFactor * (1 - event.expectedP1)
    )
    // El favorito por equipo que gana sube poco: el esperado ya lo contaba.
    assert.ok(players.get("n").rating - 1500 < TEAM_OPTIONS.kFactor / 2)

    const snapshot = snapshotBefore(events, null, 1500)
    assert.equal(snapshot.get("n").rating, players.get("n").rating)
    assert.equal(snapshot.get("s").rating, players.get("s").rating)
})

test("events expose the team overalls and the adjustment used", () => {
    const { events } = calculatePlayerRatings(
        [
            match(NICO, 1, SANTI, 0, "2026-01-01", withStrength(84, 79)),
            match(NICO, 1, SANTI, 0, "2026-01-02"),
        ],
        { ...TEAM_OPTIONS, teamStrength: strengthOf }
    )

    assert.equal(events[0].p1.teamOverall, 84)
    assert.equal(events[0].p2.teamOverall, 79)
    assert.equal(events[0].teamAdjustment, 125)
    assert.equal(events[1].p1.teamOverall, null)
    assert.equal(events[1].p2.teamOverall, null)
    assert.equal(events[1].teamAdjustment, 0)
})

test("the returned config does not carry the injected lookup", () => {
    const { config } = calculatePlayerRatings([], {
        teamStrength: strengthOf,
        teamStrengthWeight: 10,
    })
    assert.equal(config.teamStrength, undefined)
    assert.equal(config.teamStrengthWeight, 10)
})

test("the default lookup reads real overalls from data/teamRatings.json", () => {
    const data = require("../data/teamRatings.json")
    const [key] = Object.keys(data.overallByTeamEdition)
    const [teamId, edition] = key.split("|")
    const tournamentId = Object.keys(data.editionByTournament).find(
        (id) => data.editionByTournament[id] === edition
    )
    const overall = data.overallByTeamEdition[key]
    const tournament = { id: tournamentId, name: "Real" }

    for (const [id1, id2] of [
        [Number(teamId), Number(teamId)],
        [String(teamId), String(teamId)],
    ]) {
        const { events } = calculatePlayerRatings([
            match(NICO, 1, SANTI, 0, "2026-01-01", {
                tournament,
                teamP1: { id: id1, name: "A" },
                teamP2: { id: id2, name: "B" },
            }),
        ])
        assert.equal(events[0].p1.teamOverall, overall)
        assert.equal(events[0].p2.teamOverall, overall)
        // Mismo overall en ambos lados: el término se cancela.
        assert.equal(events[0].teamAdjustment, 0)
    }
})

// --- Comparación 1.0 vs 2.0 ---

// Nico siempre juega con el equipo fuerte (90 vs 70). El Elo de jugadores solo
// lo explica mal; el término de equipo lo explica bien.
const teamDrivenMatches = (count = 120) =>
    Array.from({ length: count }, (_, index) => {
        const nicoStrong = index % 2 === 0
        const nicoWins = nicoStrong ? index % 10 !== 0 : index % 10 === 1
        return match(
            NICO,
            nicoWins ? 2 : 0,
            SANTI,
            nicoWins ? 0 : 2,
            new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
            withStrength(nicoStrong ? 90 : 70, nicoStrong ? 70 : 90)
        )
    })

test("compareTeamStrength prefers a positive weight when team strength drives results", () => {
    const comparison = compareTeamStrength(teamDrivenMatches(), [0, 10, 25], {
        minGames: 5,
        options: { teamStrength: strengthOf },
    })

    const byWeight = new Map(comparison.results.map((r) => [r.weight, r]))
    assert.ok(byWeight.get(25).all.logLoss < byWeight.get(0).all.logLoss)
    assert.ok(comparison.best.weight > 0)
    assert.ok(byWeight.get(comparison.best.weight).pairedAll.gain > 0)
    assert.equal(byWeight.get(0).pairedAll.gain, 0)
    assert.ok(comparison.trainMatches > 0)
    assert.ok(comparison.testMatches > 0)
    assert.equal(
        comparison.trainMatches + comparison.testMatches,
        comparison.evaluableMatches
    )
    for (const { all, train, test: held } of comparison.results) {
        assert.ok(all.matches > 0 && train.matches > 0 && held.matches > 0)
    }
})

test("compareTeamStrength gives identical results when no team data exists", () => {
    const plain = teamDrivenMatches().map(({ strength, ...rest }) => rest)
    const comparison = compareTeamStrength(plain, [0, 25], {
        minGames: 5,
        options: { teamStrength: strengthOf },
    })
    const [zero, weighted] = comparison.results

    assert.equal(zero.all.logLoss, weighted.all.logLoss)
    assert.equal(weighted.pairedAll.gain, 0)
    assert.equal(weighted.pairedTest.gain, 0)
})

test("compareTeamStrength returns null when nothing is evaluable", () => {
    assert.equal(compareTeamStrength([], [0, 25]), null)
    assert.equal(
        compareTeamStrength([match(NICO, 1, SANTI, 0, "2026-01-01")], [0, 25]),
        null
    )
})

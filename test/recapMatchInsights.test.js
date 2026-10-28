process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
    buildMatchInsights,
    resolveInsightKind,
    resolveWinner,
} = require("../controller/getRecapContext/matchInsights")

const side = (id, overrides) => ({
    id: String(id),
    name: `Jugador ${id}`,
    before: 1000,
    games: 10,
    team: `Equipo ${id}`,
    teamOverall: 80,
    ...overrides,
})

const event = (overrides = {}) => ({
    matchId: "m1",
    time: Date.parse("2026-10-21T18:00:00Z"),
    tournament: "Liga APA",
    type: "regular",
    scoreP1: 2,
    scoreP2: 1,
    expectedP1: 0.62345,
    resultP1: 1,
    delta: 4.26,
    teamAdjustment: 7.04,
    p1: side(1, { before: 1012.34 }),
    p2: side(2, { before: 987.66, teamOverall: 75 }),
    ...overrides,
})

const match = (overrides = {}) => ({
    _id: "m1",
    type: "regular",
    scoreP1: 2,
    scoreP2: 1,
    playerP1: { id: 1, name: "Jugador 1" },
    teamP1: { id: 11, name: "Equipo 1" },
    playerP2: { id: 2, name: "Jugador 2" },
    teamP2: { id: 12, name: "Equipo 2" },
    outcome: { draw: false, playerThatWon: { id: 1 } },
    ...overrides,
})

const leagueTournament = { format: "league" }
const insightsOf = (events, matches, tournament = leagueTournament) =>
    buildMatchInsights({ events, matches, tournament })

test("a rated league match yields every field, rounded", () => {
    const [insight] = insightsOf([event()], [match()])

    assert.deepEqual(insight, {
        matchId: "m1",
        playedAt: "2026-10-21T18:00:00.000Z",
        type: "regular",
        playoffId: null,
        leg: null,
        p1: {
            player: { id: 1, name: "Jugador 1" },
            team: { id: 11, name: "Equipo 1" },
            ratingBefore: 1012.3,
            teamOverall: 80,
        },
        p2: {
            player: { id: 2, name: "Jugador 2" },
            team: { id: 12, name: "Equipo 2" },
            ratingBefore: 987.7,
            teamOverall: 75,
        },
        scoreP1: 2,
        scoreP2: 1,
        expectedP1: 0.623,
        teamAdjustment: 7,
        kind: "expected_points",
        favorite: { side: "p1", label: "levemente favorito" },
        // 1012,3 contra 987,7: 24,6 puntos, justo debajo del primer corte.
        ratingEdge: null,
        overallGap: { side: "p1", points: 5, level: "notable" },
        winner: "p1",
        winnerExpectedScore: 0.623,
        ratingSwing: 4.3,
    })
})

test("favorite uses the assistant labels on the expected score of the favorite", () => {
    const favoriteOf = (expectedP1, kind = "expected_points") => {
        const tournament =
            kind === "advance"
                ? { format: "playoff", playoffMode: "single" }
                : leagueTournament
        const type = kind === "advance" ? "playoff" : "regular"
        const [insight] = insightsOf(
            [event({ expectedP1, type })],
            [match({ type, playoff_id: type === "playoff" ? 5 : undefined })],
            tournament
        )
        return insight.favorite
    }

    // Germany-Norway: Norway ganó siendo el de menos chances.
    assert.deepEqual(favoriteOf(0.79, "advance"), {
        side: "p1",
        label: "favorito",
    })
    assert.deepEqual(favoriteOf(0.21, "advance"), {
        side: "p2",
        label: "favorito",
    })
    assert.deepEqual(favoriteOf(0.2, "advance"), {
        side: "p2",
        label: "gran favorito",
    })
    assert.deepEqual(favoriteOf(0.524), null)
    assert.deepEqual(favoriteOf(0.525), {
        side: "p1",
        label: "levemente favorito",
    })
    assert.deepEqual(favoriteOf(0.475), {
        side: "p2",
        label: "levemente favorito",
    })
    assert.equal(favoriteOf(0.5), null)
})

test("a match without prediction kind has no favorite", () => {
    const [insight] = insightsOf(
        [event({ type: "playoff", expectedP1: 0.9 })],
        [match({ type: "playoff", playoff_id: 9, leg: 3 })],
        { format: "playoff", playoffMode: "two_legged" }
    )

    assert.equal(insight.kind, null)
    assert.equal(insight.favorite, null)
})

test("ratingEdge levels change at 25, 75 and 150 points", () => {
    const edgeOf = (diff, swap = false) => {
        const [first, second] = swap ? [1000, 1000 + diff] : [1000 + diff, 1000]
        const [insight] = insightsOf(
            [
                event({
                    p1: side(1, { before: first }),
                    p2: side(2, { before: second }),
                }),
            ],
            [match()]
        )
        return insight.ratingEdge
    }

    assert.equal(edgeOf(24), null)
    assert.deepEqual(edgeOf(25), { side: "p1", level: "slight" })
    assert.deepEqual(edgeOf(74), { side: "p1", level: "slight" })
    assert.deepEqual(edgeOf(75), { side: "p1", level: "clear" })
    assert.deepEqual(edgeOf(149), { side: "p1", level: "clear" })
    assert.deepEqual(edgeOf(150), { side: "p1", level: "large" })
    assert.deepEqual(edgeOf(150, true), { side: "p2", level: "large" })
    assert.equal(edgeOf(0), null)
})

test("overallGap levels change at 4 and 8 points and need both overalls", () => {
    const gapOf = (overall1, overall2) => {
        const [insight] = insightsOf(
            [
                event({
                    p1: side(1, { teamOverall: overall1 }),
                    p2: side(2, { teamOverall: overall2 }),
                }),
            ],
            [match()]
        )
        return insight.overallGap
    }

    assert.equal(gapOf(80, 77), null)
    assert.deepEqual(gapOf(80, 76), {
        side: "p1",
        points: 4,
        level: "notable",
    })
    assert.equal(gapOf(77, 80), null)
    assert.deepEqual(gapOf(76, 80), {
        side: "p2",
        points: 4,
        level: "notable",
    })
    assert.deepEqual(gapOf(80, 73), {
        side: "p1",
        points: 7,
        level: "notable",
    })
    assert.deepEqual(gapOf(80, 72), { side: "p1", points: 8, level: "large" })
    assert.equal(gapOf(null, 72), null)
    assert.equal(gapOf(80, null), null)
    assert.equal(gapOf(80, 80), null)
})

test("when P2 wins, winnerExpectedScore is 1 - expectedP1 and the swing is absolute", () => {
    const [insight] = insightsOf(
        [event({ scoreP1: 0, scoreP2: 3, delta: -5.56 })],
        [
            match({
                scoreP1: 0,
                scoreP2: 3,
                outcome: { draw: false, playerThatWon: { id: 2 } },
            }),
        ]
    )

    assert.equal(insight.winner, "p2")
    assert.equal(insight.expectedP1, 0.623)
    assert.equal(insight.winnerExpectedScore, 0.377)
    assert.equal(insight.ratingSwing, 5.6)
})

test("a penalty shoot-out winner comes from the outcome, not from the tied score", () => {
    const [insight] = insightsOf(
        [event({ type: "playoff", scoreP1: 1, scoreP2: 1, delta: 1 })],
        [
            match({
                type: "playoff",
                playoff_id: 5,
                scoreP1: 1,
                scoreP2: 1,
                outcome: {
                    draw: true,
                    penalties: true,
                    playerThatWon: { id: 2 },
                    teamThatWon: { id: 12 },
                },
            }),
        ],
        { format: "playoff", playoffMode: "single" }
    )

    assert.equal(insight.winner, "p2")
    assert.equal(insight.winnerExpectedScore, 0.377)
    assert.equal(insight.kind, "advance")
    assert.equal(insight.playoffId, 5)
})

test("a real draw has no winner and no winnerExpectedScore", () => {
    const leagueDraw = match({
        scoreP1: 1,
        scoreP2: 1,
        outcome: { draw: true },
    })
    const legOneDraw = match({
        _id: "m2",
        type: "playoff",
        playoff_id: 3,
        leg: 1,
        scoreP1: 0,
        scoreP2: 0,
        outcome: { draw: true },
    })
    const [league, legOne] = [
        ...insightsOf([event({ scoreP1: 1, scoreP2: 1 })], [leagueDraw]),
        ...insightsOf(
            [event({ matchId: "m2", scoreP1: 0, scoreP2: 0 })],
            [legOneDraw],
            { format: "playoff", playoffMode: "two_legged" }
        ),
    ]

    for (const insight of [league, legOne]) {
        assert.equal(insight.winner, "draw")
        assert.equal(insight.winnerExpectedScore, null)
    }
    assert.equal(legOne.leg, 1)
    assert.equal(legOne.kind, "expected_points")
})

test("kind follows predictionKind for each format and stage", () => {
    const kind = (matchFields, tournament) =>
        resolveInsightKind({ match: matchFields, tournament })

    assert.equal(
        kind({ type: "playoff", leg: 1 }, { format: "playoff" }),
        "advance"
    )
    assert.equal(kind({ type: "playoff" }, { format: "world_cup" }), "advance")
    assert.equal(
        kind(
            { type: "playoff", leg: 1 },
            { format: "playoff", playoffMode: "single" }
        ),
        "advance"
    )

    const twoLegged = { format: "playoff", playoffMode: "two_legged" }
    assert.equal(
        kind({ type: "playoff", leg: 1 }, twoLegged),
        "expected_points"
    )
    assert.equal(
        kind({ type: "playoff", leg: 2 }, twoLegged),
        "expected_points"
    )
    assert.equal(kind({ type: "playoff", leg: 3 }, twoLegged), null)

    assert.equal(kind({ type: "regular" }, leagueTournament), "expected_points")

    const champions = { format: "champions_league" }
    assert.equal(
        kind({ type: "playoff", leg: 1 }, champions),
        "expected_points"
    )
    assert.equal(kind({ type: "playin" }, champions), null)
    assert.equal(
        kind({ type: "playin" }, { format: "league_playin_playoff" }),
        "advance"
    )
})

test("a leg-3 tiebreak has no kind but keeps its winner", () => {
    const [insight] = insightsOf(
        [event({ type: "playoff", scoreP1: 1, scoreP2: 0 })],
        [
            match({
                type: "playoff",
                playoff_id: 9,
                leg: 3,
                scoreP1: 1,
                scoreP2: 0,
            }),
        ],
        { format: "playoff", playoffMode: "two_legged" }
    )

    assert.equal(insight.kind, null)
    assert.equal(insight.leg, 3)
    assert.equal(insight.winner, "p1")
    assert.equal(insight.winnerExpectedScore, 0.623)
})

test("a missing team overall gives teamOverall null and teamAdjustment 0", () => {
    const [insight] = insightsOf(
        [
            event({
                teamAdjustment: 0,
                p1: side(1, { teamOverall: null }),
                p2: side(2, { teamOverall: null }),
            }),
        ],
        [match()]
    )

    assert.equal(insight.p1.teamOverall, null)
    assert.equal(insight.p2.teamOverall, null)
    assert.equal(insight.teamAdjustment, 0)
    assert.equal(insight.winner, "p1")
})

test("events of other tournaments are skipped, input order is kept and -0 is normalized", () => {
    const insights = insightsOf(
        [
            event({ matchId: "b", time: 1 }),
            event({ matchId: "other", time: 2 }),
            event({ matchId: "a", time: 3, teamAdjustment: -0.04 }),
        ],
        [match({ _id: "a" }), match({ _id: "b" })]
    )

    assert.deepEqual(
        insights.map(({ matchId }) => matchId),
        ["b", "a"]
    )
    assert.ok(Object.is(insights[1].teamAdjustment, 0))
    assert.deepEqual(insightsOf([], [match()]), [])
    assert.deepEqual(insightsOf([event()], []), [])
})

test("the winner falls back to the team and then to the score without an outcome", () => {
    const sameMatchPlayer = {
        playerP2: { id: 1, name: "Jugador 1" },
        scoreP1: 2,
        scoreP2: 2,
        outcome: {
            draw: true,
            penalties: true,
            playerThatWon: { id: 1 },
            teamThatWon: { id: 12 },
        },
    }

    assert.equal(resolveWinner(match(sameMatchPlayer)), "p2")
    assert.equal(resolveWinner(match({ outcome: undefined })), "p1")
    assert.equal(
        resolveWinner(match({ outcome: undefined, scoreP1: 0, scoreP2: 4 })),
        "p2"
    )
    assert.equal(
        resolveWinner(match({ outcome: undefined, scoreP1: 1, scoreP2: 1 })),
        "draw"
    )
    // El outcome manda aunque el marcador diga otra cosa.
    assert.equal(
        resolveWinner(
            match({
                scoreP1: 3,
                scoreP2: 1,
                outcome: { draw: false, playerThatWon: { id: 2 } },
            })
        ),
        "p2"
    )
})

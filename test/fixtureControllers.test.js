const assert = require("node:assert/strict")
const test = require("node:test")

const {
    createGetFixtureByTournamentId,
} = require("../controller/getFixtureByTournamentId")
const {
    createPostFixtureByTournamentId,
} = require("../controller/postFixtureByTournamentId")
const {
    ensureGeneratedFixture,
} = require("../service/originateFixtureByTournamentId")

const createResponse = () => ({
    statusCode: null,
    body: null,
    status(code) {
        this.statusCode = code
        return this
    },
    send(body) {
        this.body = body
        return this
    },
    json(body) {
        this.body = body
        return this
    },
})

test("GET fixture passes parsed filters and preserves response", async () => {
    let received
    const fixture = { matches: [], totalPages: 0 }
    const controller = createGetFixtureByTournamentId({
        retrieveFixtureByTournamentId: async (...args) => {
            received = args
            return fixture
        },
    })
    const response = createResponse()

    await controller(
        {
            params: { tournament: "tournament" },
            query: {
                page: 2,
                players: ["one", "two"],
                team: 10,
                group: "A",
            },
        },
        response
    )

    assert.deepEqual(received, ["tournament", 2, ["one", "two"], 10, "A"])
    assert.equal(response.statusCode, 200)
    assert.equal(response.body, fixture)
})

const NICO = { id: "n", name: "Nico" }
const SANTI = { id: "s", name: "Santi" }
const TEAM_A = { id: 1, name: "Equipo A" }
const TEAM_B = { id: 2, name: "Equipo B" }
const RATED_HISTORY = [
    {
        _id: "h1",
        playerP1: NICO,
        scoreP1: 2,
        playerP2: SANTI,
        scoreP2: 0,
        teamP1: TEAM_A,
        teamP2: TEAM_B,
        played: true,
        playedAt: new Date("2026-01-01"),
    },
]
const fixtureMatch = (overrides = {}) => ({
    _id: "pending",
    type: "regular",
    group: "A",
    playerP1: NICO,
    playerP2: SANTI,
    teamP1: TEAM_A,
    teamP2: TEAM_B,
    scoreP1: null,
    scoreP2: null,
    played: false,
    ...overrides,
})
const fixtureOf = (matches) => ({
    matches,
    amountOfNotPlayedMatches: 1,
    amountOfTotalMatches: matches.length,
    totalPages: 1,
    currentPage: 1,
    teamStats: [{ teamId: 1, teamName: "Equipo A", totalMatches: 2 }],
})
const createFixtureController = (fixture, overrides = {}) =>
    createGetFixtureByTournamentId({
        retrieveFixtureByTournamentId: async () => fixture,
        retrieveAllMatches: async () => RATED_HISTORY,
        predictionOptions: { teamStrength: null },
        logger: { warn: () => {} },
        ...overrides,
    })
const getFixture = async (controller) => {
    const response = createResponse()
    await controller(
        { params: { tournament: "tournament" }, query: { page: 1 } },
        response
    )
    assert.equal(response.statusCode, 200)
    return response.body
}

test("GET fixture adds outcomes to played and pending matches", async () => {
    const played = fixtureMatch({
        _id: "h1",
        scoreP1: 2,
        scoreP2: 0,
        played: true,
        playedAt: new Date("2026-01-01"),
    })
    const upcoming = fixtureMatch()
    const fixture = fixtureOf([played, upcoming])

    const body = await getFixture(createFixtureController(fixture))

    const { prediction: playedPrediction, ...playedRest } = body.matches[0]
    const { prediction: upcomingPrediction, ...upcomingRest } = body.matches[1]
    assert.deepEqual(playedRest, played)
    assert.deepEqual(upcomingRest, upcoming)
    assert.equal(playedPrediction.kind, "outcomes")
    assert.equal(playedPrediction.basis, "pre_match")
    assert.equal(playedPrediction.draw, 0.22)
    assert.equal(upcomingPrediction.kind, "outcomes")
    assert.equal(upcomingPrediction.basis, "current")
    assert.ok(upcomingPrediction.p1Win > upcomingPrediction.p2Win)
    assert.equal(
        Math.round(
            (upcomingPrediction.p1Win +
                upcomingPrediction.draw +
                upcomingPrediction.p2Win) *
                1000
        ),
        1000
    )
})

test("GET fixture preserves the pagination metadata", async () => {
    const fixture = fixtureOf([fixtureMatch()])

    const body = await getFixture(createFixtureController(fixture))

    const { matches, ...metadata } = body
    const { matches: originalMatches, ...originalMetadata } = fixture
    assert.equal(matches.length, originalMatches.length)
    assert.deepEqual(metadata, originalMetadata)
})

test("GET fixture returns null prediction for invalid and same-player matches", async () => {
    const fixture = fixtureOf([
        fixtureMatch({ _id: "same", playerP2: NICO }),
        fixtureMatch({
            _id: "sim",
            valid: false,
            played: true,
            scoreP1: 3,
            scoreP2: 0,
        }),
        fixtureMatch({ _id: "empty-team", teamP2: null }),
    ])

    const body = await getFixture(createFixtureController(fixture))

    assert.deepEqual(
        body.matches.map((match) => match.prediction),
        [null, null, null]
    )
})

test("GET fixture stays successful with null predictions when the ratings read fails", async () => {
    const warnings = []
    const fixture = fixtureOf([fixtureMatch(), fixtureMatch({ _id: "other" })])

    const body = await getFixture(
        createFixtureController(fixture, {
            retrieveAllMatches: async () => {
                throw new Error("db caída")
            },
            logger: {
                warn: (event, fields) => warnings.push({ event, fields }),
            },
        })
    )

    assert.deepEqual(
        body.matches.map((match) => match.prediction),
        [null, null]
    )
    assert.deepEqual(
        body.matches.map((match) => match._id),
        ["pending", "other"]
    )
    assert.equal(body.totalPages, 1)
    assert.deepEqual(body.teamStats, fixture.teamStats)
    assert.equal(warnings.length, 1)
    assert.equal(warnings[0].event, "match_predictions_unavailable")
    assert.equal(warnings[0].fields.tournamentId, "tournament")
})

test("GET fixture does not read the history when there are no matches", async () => {
    let reads = 0
    const fixture = fixtureOf([])

    const body = await getFixture(
        createFixtureController(fixture, {
            retrieveAllMatches: async () => {
                reads += 1
                return RATED_HISTORY
            },
        })
    )

    assert.equal(body, fixture)
    assert.equal(reads, 0)
})

test("fixture DAO filters the numeric team id on either side", async (t) => {
    const matchesModel = require("../dao/models/matches")
    const findFixtureByTournamentId = require("../dao/findFixtureByTournamentId")
    const originalAggregate = matchesModel.aggregate
    const pipelines = []
    t.after(() => {
        matchesModel.aggregate = originalAggregate
    })
    matchesModel.aggregate = (received) => {
        pipelines.push(received)
        return { option: async () => [{ data: [], totals: [], teamStats: [] }] }
    }

    await findFixtureByTournamentId("tournament", 1, undefined, 0)
    await findFixtureByTournamentId("tournament", 1)

    assert.deepEqual(pipelines[0][0].$match.$and, [
        { $or: [{ "teamP1.id": 0 }, { "teamP2.id": 0 }] },
    ])
    assert.equal(pipelines[1][0].$match.$and, undefined)
})

test("GET fixture propagates persistence failures", async () => {
    const expectedError = new Error("Mongo failed")
    const controller = createGetFixtureByTournamentId({
        retrieveFixtureByTournamentId: async () => {
            throw expectedError
        },
    })

    await assert.rejects(
        controller(
            { params: { tournament: "tournament" }, query: { page: 1 } },
            createResponse()
        ),
        expectedError
    )
})

test("POST fixture builds grouped generation inputs", async () => {
    let received
    const fixture = [{ _id: "match" }]
    const controller = createPostFixtureByTournamentId({
        retrieveTournamentById: async () => ({
            id: "tournament",
            name: "Tournament",
            format: "world_cup",
            groups: ["A", "B"],
            players: [
                { id: "player-1", name: "Player 1" },
                { id: "player-2", name: "Player 2" },
            ],
            teams: [
                {
                    group: "A",
                    team: { id: 1, name: "Team 1" },
                    player: { id: "player-1", name: "Player 1" },
                },
                {
                    group: "B",
                    team: { id: 2, name: "Team 2" },
                    player: { id: "player-2", name: "Player 2" },
                },
            ],
        }),
        originateFixtureByTournamentId: async (...args) => {
            received = args
            return fixture
        },
    })
    const response = createResponse()

    await controller(
        { params: { tournament: "tournament" }, body: { group: "A" } },
        response
    )

    assert.equal(received[0], "world_cup")
    assert.deepEqual(received[1], {
        id: "tournament",
        name: "Tournament",
    })
    assert.deepEqual(received[2], [{ id: "player-1", name: "Player 1" }])
    assert.equal(received[3].length, 1)
    assert.equal(response.statusCode, 200)
    assert.equal(response.body, fixture)
})

test("POST fixture returns canonical not-found for a disappeared tournament", async () => {
    const controller = createPostFixtureByTournamentId({
        retrieveTournamentById: async () => null,
        originateFixtureByTournamentId: async () => [],
    })

    const error = await controller(
        { params: { tournament: "tournament" }, body: { group: null } },
        createResponse()
    ).catch((caughtError) => caughtError)

    assert.equal(error.status, 404)
    assert.equal(error.code, "TOURNAMENT_NOT_FOUND")
})

test("POST fixture rejects broken player assignments before generation", async () => {
    const controller = createPostFixtureByTournamentId({
        retrieveTournamentById: async () => ({
            id: "tournament",
            name: "Tournament",
            format: "world_cup",
            groups: ["A"],
            players: [],
            teams: [
                {
                    group: "A",
                    team: { id: 3, name: "Team" },
                    player: { id: "missing", name: "Missing" },
                },
            ],
        }),
        originateFixtureByTournamentId: async () => [],
    })

    const error = await controller(
        { params: { tournament: "tournament" }, body: { group: "A" } },
        createResponse()
    ).catch((caughtError) => caughtError)

    assert.equal(error.status, 422)
    assert.equal(error.code, "TOURNAMENT_PARTICIPANTS_INVALID")
})

test("fixture generation failures become canonical 422 errors", () => {
    assert.throws(
        () => ensureGeneratedFixture({ error: "generation failed" }),
        (error) =>
            error.status === 422 && error.code === "FIXTURE_GENERATION_FAILED"
    )
})

test("POST fixture copies the tournament team ids into the generated matches", async () => {
    let received
    const controller = createPostFixtureByTournamentId({
        retrieveTournamentById: async () => ({
            id: "tournament",
            name: "Tournament",
            format: "league",
            players: [{ id: "player-1", name: "Player 1" }],
            teams: [
                {
                    team: { id: 10, name: "Team 10" },
                    player: { id: "player-1", name: "Player 1" },
                },
                {
                    team: { id: 20, name: "Team 20" },
                    player: { id: "player-1", name: "Player 1" },
                },
            ],
        }),
        originateFixtureByTournamentId: async (...args) => {
            received = args
            return []
        },
    })

    await controller(
        { params: { tournament: "tournament" }, body: {} },
        createResponse()
    )

    assert.deepEqual(
        received[3].map(({ team }) => team.id),
        [10, 20]
    )
})

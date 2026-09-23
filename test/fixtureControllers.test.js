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
                team: "team",
                group: "A",
            },
        },
        response
    )

    assert.deepEqual(received, ["tournament", 2, ["one", "two"], "team", "A"])
    assert.equal(response.statusCode, 200)
    assert.equal(response.body, fixture)
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
            { params: { tournament: "tournament" }, query: { page: 0 } },
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
                    team: { id: "team-1", name: "Team 1" },
                    player: { id: "player-1", name: "Player 1" },
                },
                {
                    group: "B",
                    team: { id: "team-2", name: "Team 2" },
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
                    team: { id: "team", name: "Team" },
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

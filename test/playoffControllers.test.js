const assert = require("node:assert/strict")
const test = require("node:test")

const {
    createGetPlayoffMatchesByTournamentId,
} = require("../controller/getPlayoffMatchesByTournamentId")
const {
    createPostPlayoffByTournamentId,
} = require("../controller/postPlayoffByTournamentId")

const createResponse = () => ({
    statusCode: null,
    body: null,
    status(code) {
        this.statusCode = code
        return this
    },
    json(body) {
        this.body = body
        return this
    },
})

const teams = [
    {
        group: "A",
        team: { id: "team-1", name: "Team 1" },
        player: { id: "player-1", name: "Player 1" },
    },
    {
        group: "A",
        team: { id: "team-2", name: "Team 2" },
        player: { id: "player-2", name: "Player 2" },
    },
]

const createDependencies = (overrides = {}) => ({
    retrieveTournamentById: async () => ({
        id: "tournament",
        name: "Tournament",
        format: "world_cup",
        teams,
    }),
    retrievePlayoffMatchesByTournamentId: async () => [],
    orderMatchesFromTournamentById: async () => [],
    retrievePlayinMatchesByTournamentId: async () => [],
    originateChampionsLeaguePlayoffByTournamentId: async () => [],
    originatePlayoffWithPlayinByTournamentId: async () => [],
    originateWorldCupPlayoffByTournamentId: async () => [],
    calculateGroupStagePlayoff: () => ({ playoffMatches: [] }),
    createPlayoffByTournamentId: async () => [],
    ...overrides,
})

test("GET playoff preserves an empty successful response", async () => {
    const controller = createGetPlayoffMatchesByTournamentId({
        retrieveTournamentById: async () => ({ _id: "tournament" }),
        retrievePlayoffMatchesByTournamentId: async () => [],
    })
    const response = createResponse()

    await controller({ params: { tournament: "tournament" } }, response)

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.body, { matches: [] })
})

test("GET playoff returns canonical tournament not-found", async () => {
    const controller = createGetPlayoffMatchesByTournamentId({
        retrieveTournamentById: async () => null,
        retrievePlayoffMatchesByTournamentId: async () => [],
    })

    const error = await controller(
        { params: { tournament: "tournament" } },
        createResponse()
    ).catch((caughtError) => caughtError)

    assert.equal(error.status, 404)
    assert.equal(error.code, "TOURNAMENT_NOT_FOUND")
})

test("POST playoff rejects an existing bracket before generation", async () => {
    let generationCalls = 0
    const controller = createPostPlayoffByTournamentId(
        createDependencies({
            retrievePlayoffMatchesByTournamentId: async () => [
                { playoff_id: 1 },
            ],
            originateWorldCupPlayoffByTournamentId: async () => {
                generationCalls += 1
            },
        })
    )

    const error = await controller(
        { params: { tournament: "tournament" }, body: {} },
        createResponse()
    ).catch((caughtError) => caughtError)

    assert.equal(error.status, 409)
    assert.equal(error.code, "PLAYOFF_ALREADY_EXISTS")
    assert.equal(generationCalls, 0)
})

test("POST playoff rejects formats that are automatic or unsupported", async () => {
    const request = { params: { tournament: "tournament" }, body: {} }
    const createController = (format) =>
        createPostPlayoffByTournamentId(
            createDependencies({
                retrieveTournamentById: async () => ({
                    id: "tournament",
                    name: "Tournament",
                    format,
                    teams,
                }),
            })
        )

    const automatic = await createController("playoff")(
        request,
        createResponse()
    ).catch((error) => error)
    const unsupported = await createController("league")(
        request,
        createResponse()
    ).catch((error) => error)

    assert.equal(automatic.code, "PLAYOFF_UNSUPPORTED_TOURNAMENT")
    assert.equal(unsupported.code, "PLAYOFF_UNSUPPORTED_TOURNAMENT")
    assert.equal(automatic.status, 422)
})

test("league play-in playoff requires all six completed play-in matches", async () => {
    const controller = createPostPlayoffByTournamentId(
        createDependencies({
            retrieveTournamentById: async () => ({
                id: "tournament",
                name: "Tournament",
                format: "league_playin_playoff",
                teams,
            }),
            retrievePlayinMatchesByTournamentId: async () => [
                { playoff_id: 1, played: true, outcome: {} },
            ],
        })
    )

    const error = await controller(
        { params: { tournament: "tournament" }, body: {} },
        createResponse()
    ).catch((caughtError) => caughtError)

    assert.equal(error.status, 409)
    assert.equal(error.code, "PLAYOFF_NOT_READY")
})

test("world cup generation preserves service and response contracts", async () => {
    let received
    const generated = [{ _id: "match" }]
    const controller = createPostPlayoffByTournamentId(
        createDependencies({
            originateWorldCupPlayoffByTournamentId: async (...args) => {
                received = args
                return generated
            },
        })
    )
    const response = createResponse()

    await controller(
        { params: { tournament: "tournament" }, body: {} },
        response
    )

    assert.deepEqual(received[0], {
        id: "tournament",
        name: "Tournament",
    })
    assert.ok(received[1].A)
    assert.deepEqual(received[2], [])
    assert.equal(response.statusCode, 200)
    assert.equal(response.body, generated)
})

test("group-stage calculation must produce a non-empty bracket", async () => {
    const controller = createPostPlayoffByTournamentId(
        createDependencies({
            retrieveTournamentById: async () => ({
                id: "tournament",
                name: "Tournament",
                format: "world_cup_2026",
                teams,
            }),
        })
    )

    const error = await controller(
        { params: { tournament: "tournament" }, body: {} },
        createResponse()
    ).catch((caughtError) => caughtError)

    assert.equal(error.status, 422)
    assert.equal(error.code, "PLAYOFF_DATA_INVALID")
})

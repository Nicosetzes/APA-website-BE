const assert = require("node:assert/strict")
const test = require("node:test")

const validateRequest = require("../middleware/validateRequest")
const schemas = require("../validation/requestSchemas")
const {
    createGetPlayerInfoByTournamentId,
} = require("../controller/getPlayerInfoByTournamentId")

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

const runValidation = (schema, request) =>
    new Promise((resolve) => {
        validateRequest(schema)(request, {}, (error) => {
            resolve(error)
        })
    })

const TOURNAMENT_ID = "aaaaaaaaaaaaaaaaaaaaaaaa"
const NICO_ID = "630abc35b2e0801cf5448429"
const SANTI_ID = "630abc35b2e0801cf544842a"
const LEO_ID = "630abc35b2e0801cf544842b"

const NICO = { id: NICO_ID, name: "Nico" }
const SANTI = { id: SANTI_ID, name: "Santi" }
const LEO = { id: LEO_ID, name: "Leo" }

const RACING = { id: "10", name: "Racing" }
const BOCA = { id: "20", name: "Boca" }
const RIVER = { id: "30", name: "River" }

const createTournament = () => ({
    id: TOURNAMENT_ID,
    name: "Liga",
    teams: [
        { team: RACING, player: NICO },
        { team: BOCA, player: SANTI },
        { team: RIVER, player: LEO },
    ],
})

// Del más nuevo al más viejo, como los entregan los services.
const createMatches = () => [
    {
        playerP1: NICO,
        teamP1: RACING,
        scoreP1: 3,
        playerP2: LEO,
        teamP2: RIVER,
        scoreP2: 0,
        outcome: {
            draw: false,
            playerThatWon: NICO,
            playerThatLost: LEO,
        },
    },
    {
        playerP1: SANTI,
        teamP1: BOCA,
        scoreP1: 1,
        playerP2: NICO,
        teamP2: RACING,
        scoreP2: 1,
        outcome: { draw: true },
    },
]

const createSinglePlayerController = (overrides = {}) =>
    createGetPlayerInfoByTournamentId({
        retrieveTournamentById: async () => createTournament(),
        retrieveTournamentPlayersByTournamentId: async () => [
            { id: NICO_ID, nickname: "Nico" },
            { id: SANTI_ID, name: "Santi" },
        ],
        retrievePlayerMatchesByTournamentId: async () => createMatches(),
        retrieveAllPlayedMatchesByTournamentId: async () => {
            throw new Error("no debe usarse el listado completo con un jugador")
        },
        ...overrides,
    })

test("player info computes single player stats and keeps its contract", async () => {
    let receivedArgs
    const controller = createSinglePlayerController({
        retrievePlayerMatchesByTournamentId: async (...args) => {
            receivedArgs = args
            return createMatches()
        },
    })
    const response = createResponse()

    await controller(
        { params: { tournament: TOURNAMENT_ID }, query: { player: NICO_ID } },
        response
    )

    assert.deepEqual(receivedArgs, [TOURNAMENT_ID, NICO_ID, true])
    assert.equal(response.statusCode, 200)
    assert.deepEqual(Object.keys(response.body), [
        "player",
        "teams",
        "stats",
        "bestTeam",
        "worstTeam",
        "matches",
    ])
    assert.deepEqual(response.body.player, { id: NICO_ID, name: "Nico" })
    assert.deepEqual(response.body.teams, [RACING])

    const { stats } = response.body
    assert.equal(stats.played, 2)
    assert.equal(stats.wins, 1)
    assert.equal(stats.draws, 1)
    assert.equal(stats.losses, 0)
    assert.equal(stats.goalsFor, 4)
    assert.equal(stats.goalsAgainst, 1)
    assert.equal(stats.scoringDifference, 3)
    assert.equal(stats.cleanSheets, 1)
    assert.equal(stats.effectiveness, 66.67)
    assert.equal(stats.winRate, 50)
    assert.equal(stats.goalsPerMatch, 2)
    assert.equal(stats.goalsAgainstPerMatch, 0.5)
    // recentForm va del más viejo al más nuevo.
    assert.deepEqual(stats.recentForm, ["D", "W"])
    assert.deepEqual(stats.currentStreak, { type: "W", count: 1 })

    assert.equal(response.body.bestTeam.team.name, "Racing")
    assert.equal(response.body.bestTeam.played, 2)
    assert.equal(response.body.bestTeam.wins, 1)
    assert.equal(response.body.bestTeam.effectiveness, 66.67)
    assert.equal(response.body.worstTeam.team.name, "Racing")
    assert.equal(response.body.matches.length, 2)
})

test("player info omits matches when the flag is disabled", async () => {
    const controller = createSinglePlayerController()
    const response = createResponse()

    await controller(
        {
            params: { tournament: TOURNAMENT_ID },
            query: { player: NICO_ID, matches: false },
        },
        response
    )

    assert.equal("matches" in response.body, false)
    assert.equal(response.body.stats.played, 2)
})

test("player info returns every tournament player when player is omitted", async () => {
    let receivedTournament
    const controller = createGetPlayerInfoByTournamentId({
        retrieveTournamentById: async () => createTournament(),
        retrieveTournamentPlayersByTournamentId: async () => [
            { id: NICO_ID, nickname: "Nico" },
            { id: SANTI_ID, name: "Santi" },
            { id: LEO_ID, name: "Leo" },
        ],
        retrieveAllPlayedMatchesByTournamentId: async (tournament) => {
            receivedTournament = tournament
            return createMatches()
        },
        retrievePlayerMatchesByTournamentId: async () => {
            throw new Error("no debe usarse la query por jugador en modo all")
        },
    })
    const response = createResponse()

    await controller(
        { params: { tournament: TOURNAMENT_ID }, query: {} },
        response
    )

    assert.equal(receivedTournament, TOURNAMENT_ID)
    assert.deepEqual(Object.keys(response.body), ["players"])

    const byId = new Map(
        response.body.players.map((entry) => [entry.player.id, entry])
    )

    assert.deepEqual([...byId.keys()], [NICO_ID, SANTI_ID, LEO_ID])
    assert.equal(byId.get(NICO_ID).stats.played, 2)
    assert.equal(byId.get(NICO_ID).stats.wins, 1)
    assert.equal(byId.get(SANTI_ID).stats.played, 1)
    assert.equal(byId.get(SANTI_ID).stats.draws, 1)
    assert.equal(byId.get(LEO_ID).stats.played, 1)
    assert.equal(byId.get(LEO_ID).stats.losses, 1)
    assert.deepEqual(byId.get(NICO_ID).teams, [RACING])

    // Los acumuladores internos no se filtran en la respuesta.
    for (const entry of response.body.players) {
        assert.equal("_results" in entry, false)
        assert.equal("_teamStats" in entry, false)
        assert.ok(Array.isArray(entry.matches))
    }
})

test("player info keeps players without matches at zero", async () => {
    const controller = createGetPlayerInfoByTournamentId({
        retrieveTournamentById: async () => createTournament(),
        retrieveTournamentPlayersByTournamentId: async () => [
            { id: SANTI_ID, name: "Santi" },
        ],
        retrieveAllPlayedMatchesByTournamentId: async () => [],
    })
    const response = createResponse()

    await controller(
        { params: { tournament: TOURNAMENT_ID }, query: { player: "all" } },
        response
    )

    const [entry] = response.body.players
    assert.equal(entry.stats.played, 0)
    assert.equal(entry.stats.effectiveness, 0)
    assert.equal(entry.stats.currentStreak, null)
    assert.deepEqual(entry.stats.recentForm, [])
    assert.equal(entry.bestTeam, null)
    assert.equal(entry.worstTeam, null)
})

test("player info answers 404 for a missing tournament", async () => {
    const controller = createGetPlayerInfoByTournamentId({
        retrieveTournamentById: async () => null,
    })
    const response = createResponse()

    await assert.rejects(
        controller(
            { params: { tournament: TOURNAMENT_ID }, query: {} },
            response
        ),
        (error) => {
            assert.equal(error.status, 404)
            assert.equal(error.code, "TOURNAMENT_NOT_FOUND")
            return true
        }
    )
    assert.equal(response.statusCode, null)
})

test("player info propagates persistence failures", async () => {
    const expectedError = new Error("Mongo failed")
    const controller = createGetPlayerInfoByTournamentId({
        retrieveTournamentById: async () => {
            throw expectedError
        },
    })

    await assert.rejects(
        controller(
            { params: { tournament: TOURNAMENT_ID }, query: {} },
            createResponse()
        ),
        expectedError
    )
})

test("player info validation accepts historical ids and normalizes the matches flag", async () => {
    const legacyRequest = {
        params: { tournament: TOURNAMENT_ID },
        query: { player: "42", matches: "off" },
        body: {},
    }

    assert.equal(
        await runValidation(schemas.getPlayerInfo, legacyRequest),
        undefined
    )
    assert.equal(legacyRequest.query.matches, false)

    const allRequest = {
        params: { tournament: TOURNAMENT_ID },
        query: { player: "all", matches: "yes" },
        body: {},
    }

    assert.equal(
        await runValidation(schemas.getPlayerInfo, allRequest),
        undefined
    )
    assert.equal(allRequest.query.matches, true)

    const invalidRequests = [
        { params: { tournament: "not-an-id" }, query: {}, body: {} },
        {
            params: { tournament: TOURNAMENT_ID },
            query: { matches: "banana" },
            body: {},
        },
        {
            params: { tournament: TOURNAMENT_ID },
            query: { player: "x".repeat(101) },
            body: {},
        },
        {
            params: { tournament: TOURNAMENT_ID },
            query: { unexpected: "1" },
            body: {},
        },
    ]

    for (const request of invalidRequests) {
        const error = await runValidation(schemas.getPlayerInfo, request)

        assert.ok(error, `expected rejection for ${JSON.stringify(request)}`)
        assert.equal(error.status, 400)
        assert.equal(error.code, "VALIDATION_ERROR")
    }
})

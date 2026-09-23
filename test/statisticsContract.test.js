const assert = require("node:assert/strict")
const test = require("node:test")

const validateRequest = require("../middleware/validateRequest")
const schemas = require("../validation/requestSchemas")
const { createGetStatistics } = require("../controller/getStatistics")

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

const NICO = { id: "630abc35b2e0801cf5448429", name: "Nico" }
const SANTI = { id: "630abc35b2e0801cf544842a", name: "Santi" }

// Partidos ordenados del más nuevo al más viejo, como los devuelven los services.
const createMatches = () => [
    {
        playerP1: NICO,
        teamP1: { id: "10", name: "Racing" },
        scoreP1: 4,
        playerP2: SANTI,
        teamP2: { id: "20", name: "Boca" },
        scoreP2: 0,
        outcome: { draw: false, penalties: false, playerThatWon: NICO },
        tournament: { id: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "Liga" },
        updatedAt: "2026-09-20T12:00:00.000Z",
    },
    {
        playerP1: SANTI,
        teamP1: { id: "20", name: "Boca" },
        scoreP1: 1,
        playerP2: NICO,
        teamP2: { id: "10", name: "Racing" },
        scoreP2: 1,
        outcome: { draw: true, penalties: true, playerThatWon: SANTI },
        tournament: { id: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "Liga" },
        updatedAt: "2026-09-19T12:00:00.000Z",
    },
]

const createGlobalController = () =>
    createGetStatistics({
        retrieveAllUsers: async () => [NICO, SANTI],
        retrieveAllMatches: async () => createMatches(),
        retrieveTournamentById: async () => {
            throw new Error("no debe consultarse el torneo en modo global")
        },
        orderMatchesFromTournamentById: async () => {
            throw new Error("no debe ordenarse por torneo en modo global")
        },
    })

test("statistics keeps its top level contract in global scope", async () => {
    const response = createResponse()

    await createGlobalController()({ query: {} }, response)

    assert.equal(response.statusCode, 200)
    assert.deepEqual(Object.keys(response.body), [
        "scope",
        "players",
        "decisiveMatchesStats",
        "leaderboards",
        "records",
    ])
    assert.deepEqual(response.body.scope, { tournament: null })
    assert.deepEqual(Object.keys(response.body.leaderboards), [
        "wins",
        "goalsFor",
        "matchesScoring3PlusGoals",
        "cleanSheets",
        "effectiveness",
        "winPercentage",
        "lossPercentage",
        "goalsForPerMatch",
        "goalsAgainstPerMatch",
        "cleanSheetsPercentage",
        "penaltyWins",
        "winsWithUniqueTeams",
    ])
    assert.deepEqual(Object.keys(response.body.records), [
        "highest_scoring_difference_match",
        "highest_total_goals_match",
        "most_clean_sheets_in_a_row",
        "most_consecutive_matches_scoring_1_plus_goals",
        "most_consecutive_matches_scoring_2_plus_goals",
        "most_consecutive_matches_scoring_3_plus_goals",
        "most_wins_in_a_row",
        "most_draws_in_a_row",
        "most_losses_in_a_row",
    ])
})

test("statistics aggregates per player without a tournament scope", async () => {
    const response = createResponse()

    await createGlobalController()({ query: {} }, response)

    const byId = new Map(
        response.body.players.map((entry) => [entry.player.id, entry])
    )
    const nico = byId.get(NICO.id)
    const santi = byId.get(SANTI.id)

    assert.equal(nico.totalMatches, 2)
    assert.equal(nico.wins, 1)
    assert.equal(nico.draws, 1)
    assert.equal(nico.losses, 0)
    assert.equal(nico.goalsFor, 5)
    assert.equal(nico.goalsAgainst, 1)
    assert.equal(nico.scoringDifference, 4)
    assert.equal(nico.cleanSheets, 1)
    assert.equal(nico.effectiveness, 66.67)
    assert.equal(santi.draws, 1)
    assert.equal(santi.losses, 1)
    assert.equal(santi.goalsFor, 1)
    assert.equal(santi.goalsAgainst, 5)

    // El scope global no expone longest_streak; sólo el scope por torneo lo hace.
    assert.equal("longest_streak" in nico, false)

    const penaltyWins = new Map(
        response.body.leaderboards.penaltyWins.map((row) => [
            row.player.id,
            row.penaltyWins,
        ])
    )
    assert.equal(penaltyWins.get(SANTI.id), 1)
    assert.equal(penaltyWins.get(NICO.id), 0)

    assert.equal(response.body.records.highest_scoring_difference_match.diff, 4)
    assert.equal(
        response.body.records.highest_scoring_difference_match.match.score,
        "4-0"
    )
    assert.equal(response.body.records.highest_total_goals_match.total, 4)
})

test("statistics scoped to a tournament only counts its players and adds longest streak", async () => {
    let receivedTournamentId
    let receivedOrderArgs
    const controller = createGetStatistics({
        retrieveAllUsers: async () => {
            throw new Error("no deben consultarse todos los usuarios")
        },
        retrieveAllMatches: async () => {
            throw new Error("no deben consultarse todos los partidos")
        },
        retrieveTournamentById: async (id) => {
            receivedTournamentId = id
            return { players: [{ id: NICO.id, nickname: "Nico" }] }
        },
        orderMatchesFromTournamentById: async (...args) => {
            receivedOrderArgs = args
            return createMatches()
        },
    })
    const response = createResponse()

    await controller(
        { query: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" } },
        response
    )

    assert.equal(receivedTournamentId, "aaaaaaaaaaaaaaaaaaaaaaaa")
    assert.deepEqual(receivedOrderArgs, [
        "aaaaaaaaaaaaaaaaaaaaaaaa",
        undefined,
        true,
    ])
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.body.scope, {
        tournament: "aaaaaaaaaaaaaaaaaaaaaaaa",
    })
    assert.equal(response.body.players.length, 1)
    assert.equal(response.body.players[0].player.id, NICO.id)
    assert.deepEqual(response.body.players[0].longest_streak, {
        type: "W",
        length: 1,
    })
})

test("statistics answers 404 when the scoped tournament does not exist", async () => {
    const controller = createGetStatistics({
        retrieveTournamentById: async () => null,
    })
    const response = createResponse()

    await assert.rejects(
        controller(
            { query: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" } },
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

test("statistics propagates persistence failures", async () => {
    const expectedError = new Error("Mongo failed")
    const controller = createGetStatistics({
        retrieveAllUsers: async () => {
            throw expectedError
        },
    })

    await assert.rejects(
        controller({ query: {} }, createResponse()),
        expectedError
    )
})

test("statistics validation accepts an optional tournament id and rejects the rest", async () => {
    const validRequests = [
        { query: {}, body: {} },
        { query: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" }, body: {} },
    ]

    for (const request of validRequests) {
        assert.equal(
            await runValidation(schemas.getStatistics, request),
            undefined
        )
    }

    const invalidRequests = [
        { query: { tournament: "all" }, body: {} },
        { query: { tournament: "" }, body: {} },
        { query: { tournament: "not-an-id" }, body: {} },
        { query: { player: "aaaaaaaaaaaaaaaaaaaaaaaa" }, body: {} },
    ]

    for (const request of invalidRequests) {
        const error = await runValidation(schemas.getStatistics, request)

        assert.ok(
            error,
            `expected rejection for ${JSON.stringify(request.query)}`
        )
        assert.equal(error.status, 400)
        assert.equal(error.code, "VALIDATION_ERROR")
    }
})

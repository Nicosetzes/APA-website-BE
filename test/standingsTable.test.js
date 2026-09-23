const assert = require("node:assert/strict")
const test = require("node:test")

const validateRequest = require("../middleware/validateRequest")
const schemas = require("../validation/requestSchemas")
const {
    createGetStandingsTableByTournamentId,
} = require("../controller/getStandingsTableByTournamentId")

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
})

const runValidation = (schema, request) =>
    new Promise((resolve) => {
        validateRequest(schema)(request, {}, (error) => {
            resolve(error)
        })
    })

const TOURNAMENT_ID = "aaaaaaaaaaaaaaaaaaaaaaaa"

const NICO = { id: "1", name: "Nico" }
const SANTI = { id: "2", name: "Santi" }
const LEO = { id: "3", name: "Leo" }

const RACING = { id: "10", name: "Racing" }
const BOCA = { id: "20", name: "Boca" }
const RIVER = { id: "30", name: "River" }

const createLeagueTournament = () => ({
    id: TOURNAMENT_ID,
    name: "Liga",
    format: "league",
    groups: [],
    teams: [
        { team: RACING, player: NICO },
        { team: BOCA, player: SANTI },
        { team: RIVER, player: LEO },
    ],
})

// Del más nuevo al más viejo, como los entrega el service.
const createPlayedMatches = () => [
    {
        id: "match-2",
        playerP1: NICO,
        teamP1: RACING,
        scoreP1: 3,
        playerP2: LEO,
        teamP2: RIVER,
        scoreP2: 0,
        outcome: {
            draw: false,
            teamThatWon: RACING,
            playerThatWon: NICO,
            scoreFromTeamThatWon: 3,
            teamThatLost: RIVER,
            playerThatLost: LEO,
            scoreFromTeamThatLost: 0,
        },
        updatedAt: "2026-09-20T12:00:00.000Z",
    },
    {
        id: "match-1",
        playerP1: SANTI,
        teamP1: BOCA,
        scoreP1: 1,
        playerP2: NICO,
        teamP2: RACING,
        scoreP2: 1,
        outcome: { draw: true },
        updatedAt: "2026-09-19T12:00:00.000Z",
    },
]

test("standings table aggregates points, difference and streak order", async () => {
    let receivedOrderArgs
    let receivedNotPlayedArgs
    const controller = createGetStandingsTableByTournamentId({
        retrieveTournamentById: async () => createLeagueTournament(),
        orderMatchesFromTournamentById: async (...args) => {
            receivedOrderArgs = args
            return createPlayedMatches()
        },
        retrieveAllNotPlayedMatchesByTournamentId: async (...args) => {
            receivedNotPlayedArgs = args
            return []
        },
    })
    const response = createResponse()

    await controller(
        { params: { tournament: TOURNAMENT_ID }, query: {} },
        response
    )

    assert.equal(response.statusCode, 200)
    assert.equal(response.body.id, TOURNAMENT_ID)
    assert.equal(response.body.name, "Liga")
    assert.deepEqual(receivedOrderArgs, [TOURNAMENT_ID, undefined])
    assert.deepEqual(receivedNotPlayedArgs, [TOURNAMENT_ID, undefined])
    assert.equal(response.body.standings.length, 1)
    assert.equal(response.body.standings[0].group, undefined)

    const rows = response.body.standings[0].teams

    assert.deepEqual(
        rows.map((row) => row.team.name),
        ["Racing", "Boca", "River"]
    )

    const racing = rows[0]
    assert.equal(racing.played, 2)
    assert.equal(racing.wins, 1)
    assert.equal(racing.draws, 1)
    assert.equal(racing.losses, 0)
    assert.equal(racing.points, 4)
    assert.equal(racing.goalsFor, 4)
    assert.equal(racing.goalsAgainst, 1)
    assert.equal(racing.scoringDifference, 3)

    // La racha se devuelve del más viejo al más nuevo.
    assert.deepEqual(
        racing.streak.map((entry) => entry.outcome),
        ["d", "w"]
    )

    const river = rows[2]
    assert.equal(river.losses, 1)
    assert.equal(river.points, 0)
    assert.equal(river.scoringDifference, -3)
})

test("standings table marks eliminated teams in league format", async () => {
    const controller = createGetStandingsTableByTournamentId({
        retrieveTournamentById: async () => createLeagueTournament(),
        orderMatchesFromTournamentById: async () => createPlayedMatches(),
        retrieveAllNotPlayedMatchesByTournamentId: async () => [
            { teamP1: BOCA, teamP2: RIVER },
        ],
    })
    const response = createResponse()

    await controller(
        { params: { tournament: TOURNAMENT_ID }, query: {} },
        response
    )

    const byTeam = new Map(
        response.body.standings[0].teams.map((row) => [row.team.name, row])
    )

    // Racing lidera con 4. Boca llega justo a 4 ganando su pendiente, River sólo a 3.
    assert.equal(byTeam.get("Racing").eliminated, undefined)
    assert.equal(byTeam.get("Boca").eliminated, undefined)
    assert.equal(byTeam.get("River").eliminated, true)
})

test("standings table returns one entry per group when the tournament has groups", async () => {
    const requestedGroups = []
    const controller = createGetStandingsTableByTournamentId({
        retrieveTournamentById: async () => ({
            id: TOURNAMENT_ID,
            name: "Champions",
            format: "champions_league",
            groups: ["A", "B"],
            teams: [
                { team: RACING, player: NICO, group: "A" },
                { team: BOCA, player: SANTI, group: "B" },
            ],
        }),
        orderMatchesFromTournamentById: async (_tournament, targetGroup) => {
            requestedGroups.push(targetGroup)
            return []
        },
        retrieveAllNotPlayedMatchesByTournamentId: async () => [],
    })
    const response = createResponse()

    await controller(
        { params: { tournament: TOURNAMENT_ID }, query: {} },
        response
    )

    assert.deepEqual(requestedGroups.sort(), ["A", "B"])
    assert.deepEqual(
        response.body.standings.map((entry) => entry.group),
        ["A", "B"]
    )
    assert.equal(response.body.standings[0].teams.length, 1)
    assert.equal(response.body.standings[0].teams[0].team.name, "Racing")
    assert.equal(response.body.standings[0].teams[0].played, 0)
})

test("standings table scopes to the requested group", async () => {
    let receivedGroup
    const controller = createGetStandingsTableByTournamentId({
        retrieveTournamentById: async () => ({
            id: TOURNAMENT_ID,
            name: "Champions",
            format: "champions_league",
            groups: ["A", "B"],
            teams: [
                { team: RACING, player: NICO, group: "A" },
                { team: BOCA, player: SANTI, group: "B" },
            ],
        }),
        orderMatchesFromTournamentById: async (_tournament, targetGroup) => {
            receivedGroup = targetGroup
            return []
        },
        retrieveAllNotPlayedMatchesByTournamentId: async () => [],
    })
    const response = createResponse()

    await controller(
        { params: { tournament: TOURNAMENT_ID }, query: { group: "B" } },
        response
    )

    assert.equal(receivedGroup, "B")
    assert.equal(response.body.standings.length, 1)
    assert.equal(response.body.standings[0].group, "B")
    assert.equal(response.body.standings[0].teams[0].team.name, "Boca")
})

test("standings table answers 404 for a missing tournament", async () => {
    const controller = createGetStandingsTableByTournamentId({
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

test("standings table propagates persistence failures", async () => {
    const expectedError = new Error("Mongo failed")
    const controller = createGetStandingsTableByTournamentId({
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

test("standings table validation accepts an optional group and rejects the rest", async () => {
    const validRequest = {
        params: { tournament: TOURNAMENT_ID },
        query: { group: "a" },
        body: {},
    }

    assert.equal(
        await runValidation(schemas.getStandingsTable, validRequest),
        undefined
    )
    assert.equal(validRequest.query.group, "A")

    const invalidRequests = [
        { params: { tournament: "not-an-id" }, query: {}, body: {} },
        {
            params: { tournament: TOURNAMENT_ID },
            query: { group: "Z" },
            body: {},
        },
        {
            params: { tournament: TOURNAMENT_ID },
            query: { unexpected: "1" },
            body: {},
        },
    ]

    for (const request of invalidRequests) {
        const error = await runValidation(schemas.getStandingsTable, request)

        assert.ok(error, `expected rejection for ${JSON.stringify(request)}`)
        assert.equal(error.status, 400)
        assert.equal(error.code, "VALIDATION_ERROR")
    }
})

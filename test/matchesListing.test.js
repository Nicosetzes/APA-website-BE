const assert = require("node:assert/strict")
const { once } = require("node:events")
const test = require("node:test")

const { createApp } = require("../app")
const matchesModel = require("../dao/models/matches")
const validateRequest = require("../middleware/validateRequest")
const schemas = require("../validation/requestSchemas")
const { createGetMatches } = require("../controller/getMatches")

const withServer = async (app, callback) => {
    const server = app.listen(0)
    await once(server, "listening")

    try {
        const { port } = server.address()
        await callback(`http://127.0.0.1:${port}`)
    } finally {
        server.close()
        await once(server, "close")
    }
}

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

test("matches listing controller forwards every filter and preserves payload", async () => {
    let received
    const payload = {
        matches: [{ _id: "match" }],
        totalMatches: 1,
        totalPages: 1,
        currentPage: 0,
    }
    const controller = createGetMatches({
        retrieveMatches: async (filters) => {
            received = filters
            return payload
        },
    })
    const response = createResponse()
    const filters = {
        page: 2,
        teamName: "Racing",
        player1: "aaaaaaaaaaaaaaaaaaaaaaaa",
        player2: "bbbbbbbbbbbbbbbbbbbbbbbb",
        tournamentId: "cccccccccccccccccccccccc",
        type: "playoff",
        playoffRound: "final",
        outcome: "win",
        goalDiffOp: "lte",
        goalDiffVal: 3,
        totalGoalsOp: "gte",
        totalGoalsVal: 5,
        player1GoalsOp: "eq",
        player1GoalsVal: 2,
        player1ConcededOp: "lte",
        player1ConcededVal: 1,
        player1Team: "Brasil",
        opponentTeam: "Boca",
        dateFrom: "2025-01-01",
        dateTo: "2025-01-31",
        played: true,
    }

    await controller({ query: { ...filters } }, response)

    assert.deepEqual(received, filters)
    assert.equal(response.statusCode, 200)
    assert.equal(response.body, payload)
})

test("matches listing controller propagates persistence failures", async () => {
    const expectedError = new Error("Mongo failed")
    const controller = createGetMatches({
        retrieveMatches: async () => {
            throw expectedError
        },
    })

    await assert.rejects(
        controller({ query: {} }, createResponse()),
        expectedError
    )
})

test("matches listing validation applies page and goalDiffOp defaults", async () => {
    const request = { query: {}, body: {} }

    const error = await runValidation(schemas.getMatches, request)

    assert.equal(error, undefined)
    assert.equal(request.query.page, 1)
    assert.equal(request.query.goalDiffOp, "gte")
    assert.equal(request.query.totalGoalsOp, "gte")
    assert.equal(request.query.player1GoalsOp, "gte")
    assert.equal(request.query.player1ConcededOp, "gte")
})

test("matches listing validation converts goal, team and round filters", async () => {
    const request = {
        query: {
            player1GoalsOp: "eq",
            player1GoalsVal: "3",
            player1ConcededVal: "0",
            totalGoalsVal: "30",
            player1Team: "  Brasil ",
            opponentTeam: "",
            playoffRound: "quarterfinal",
        },
        body: {},
    }

    const error = await runValidation(schemas.getMatches, request)

    assert.equal(error, undefined)
    assert.equal(request.query.player1GoalsVal, 3)
    assert.equal(request.query.player1ConcededVal, 0)
    assert.equal(request.query.totalGoalsVal, 30)
    assert.equal(request.query.player1Team, "Brasil")
    assert.equal(request.query.opponentTeam, "")
    assert.equal(request.query.playoffRound, "quarterfinal")
})

test("matches listing validation converts page, goal difference and played", async () => {
    const request = {
        query: { page: "3", goalDiffVal: "2", played: "false" },
        body: {},
    }

    const error = await runValidation(schemas.getMatches, request)

    assert.equal(error, undefined)
    assert.equal(request.query.page, 3)
    assert.equal(request.query.goalDiffVal, 2)
    assert.equal(request.query.played, false)
})

test("matches listing validation keeps historical all/empty filters", async () => {
    const request = {
        query: {
            player1: "all",
            player2: "",
            tournamentId: "all",
            type: "all",
            outcome: "all",
            teamName: "",
            goalDiffVal: "",
        },
        body: {},
    }

    const error = await runValidation(schemas.getMatches, request)

    assert.equal(error, undefined)
    assert.equal(request.query.player1, "all")
    assert.equal(request.query.goalDiffVal, "")
})

test("matches listing validation rejects invalid filters with canonical error", async () => {
    const invalidRequests = [
        // La paginación es base 1: page 0 dejó de ser válida.
        { query: { page: 0 }, body: {} },
        { query: { page: -1 }, body: {} },
        { query: { page: 99999 }, body: {} },
        { query: { type: "friendly" }, body: {} },
        { query: { outcome: "victory" }, body: {} },
        { query: { goalDiffOp: "gt" }, body: {} },
        { query: { goalDiffVal: 500 }, body: {} },
        { query: { player1GoalsOp: "gt" }, body: {} },
        { query: { player1GoalsVal: -1 }, body: {} },
        { query: { player1GoalsVal: 25 }, body: {} },
        { query: { player1GoalsVal: "1.5" }, body: {} },
        // Retirado por redundante con player1ConcededVal.
        { query: { player2GoalsVal: 1 }, body: {} },
        { query: { player1ConcededVal: 25 }, body: {} },
        { query: { totalGoalsVal: 49 }, body: {} },
        { query: { totalGoalsOp: "neq" }, body: {} },
        { query: { player1Team: "x".repeat(101) }, body: {} },
        { query: { playoffRound: "octavos" }, body: {} },
        { query: { dateFrom: "2025-02-30" }, body: {} },
        { query: { dateTo: "31-01-2025" }, body: {} },
        { query: { player1: "not-an-id" }, body: {} },
        { query: { unexpected: "1" }, body: {} },
    ]

    for (const request of invalidRequests) {
        const error = await runValidation(schemas.getMatches, request)

        assert.ok(
            error,
            `expected rejection for ${JSON.stringify(request.query)}`
        )
        assert.equal(error.status, 400)
        assert.equal(error.code, "VALIDATION_ERROR")
        assert.ok(Array.isArray(error.details))
    }
})

test("matches route accepts a real FE query string and rejects unknown filters", async (t) => {
    const originalFind = matchesModel.find
    const originalCountDocuments = matchesModel.countDocuments
    let receivedFilter

    t.after(() => {
        matchesModel.find = originalFind
        matchesModel.countDocuments = originalCountDocuments
    })

    matchesModel.find = (filter) => {
        receivedFilter = filter
        return {
            limit: () => ({
                skip: () => ({
                    sort: async () => [],
                }),
            }),
        }
    }
    matchesModel.countDocuments = async () => 0

    const app = createApp({
        ensureDatabase: async () => {},
        getDatabaseStatus: () => ({ state: "connected" }),
    })

    await withServer(app, async (baseUrl) => {
        const validResponse = await globalThis.fetch(
            `${baseUrl}/api/matches?page=1&type=knockout&goalDiffOp=lte&goalDiffVal=2&dateFrom=2025-01-01&tournamentId=all`
        )

        assert.equal(validResponse.status, 200)
        assert.deepEqual(await validResponse.json(), {
            matches: [],
            totalMatches: 0,
            totalPages: 0,
            currentPage: 1,
        })
        assert.ok(Array.isArray(receivedFilter.$and))

        const invalidResponse = await globalThis.fetch(
            `${baseUrl}/api/matches?unexpected=1`
        )

        assert.equal(invalidResponse.status, 400)
        assert.equal(
            (await invalidResponse.json()).error.code,
            "VALIDATION_ERROR"
        )
    })
})

const { isDeepStrictEqual } = require("node:util")
const tournamentsModel = require("../dao/models/tournaments")

// Ejecuta el DAO real con los modelos mockeados y devuelve las condiciones del
// $and que arma para Mongo.
const captureFindMatchesFilter = async (filters, tournaments = []) => {
    const findMatches = require("../dao/findMatches")
    const originalFind = matchesModel.find
    const originalCountDocuments = matchesModel.countDocuments
    const originalTournamentsFind = tournamentsModel.find
    let receivedFilter

    matchesModel.find = (filter) => {
        receivedFilter = filter
        return {
            limit: () => ({
                skip: () => ({
                    sort: async () => [],
                }),
            }),
        }
    }
    matchesModel.countDocuments = async () => 0
    tournamentsModel.find = () => ({ lean: async () => tournaments })

    try {
        await findMatches(filters)
    } finally {
        matchesModel.find = originalFind
        matchesModel.countDocuments = originalCountDocuments
        tournamentsModel.find = originalTournamentsFind
    }

    return receivedFilter.$and
}

const assertHasCondition = (conditions, expected) => {
    assert.ok(
        conditions.some((condition) => isDeepStrictEqual(condition, expected)),
        `expected condition ${JSON.stringify(expected)}`
    )
}

const PLAYER_A = "aaaaaaaaaaaaaaaaaaaaaaaa"
const PLAYER_B = "bbbbbbbbbbbbbbbbbbbbbbbb"
const NUMERIC_SCORES = {
    scoreP1: { $type: "number" },
    scoreP2: { $type: "number" },
}

test("findMatches filters goals of player1 by the side they played", async () => {
    const conditions = await captureFindMatchesFilter({
        player1: PLAYER_A,
        player2: PLAYER_B,
        player1GoalsOp: "eq",
        player1GoalsVal: 3,
    })

    assertHasCondition(conditions, {
        $or: [
            { "playerP1.id": PLAYER_A, scoreP1: { $eq: 3 } },
            { "playerP2.id": PLAYER_A, scoreP2: { $eq: 3 } },
        ],
    })
})

test("findMatches escapes the text of the general team search", async () => {
    const conditions = await captureFindMatchesFilter({ teamName: "Real (M.)" })

    assertHasCondition(conditions, {
        $or: [
            { "teamP1.name": { $regex: "Real \\(M\\.\\)", $options: "i" } },
            { "teamP2.name": { $regex: "Real \\(M\\.\\)", $options: "i" } },
        ],
    })
})

test("findMatches computes goal difference from the scores so draws count as 0", async () => {
    const conditions = await captureFindMatchesFilter({
        goalDiffOp: "eq",
        goalDiffVal: 0,
    })

    assertHasCondition(conditions, {
        ...NUMERIC_SCORES,
        $expr: {
            $eq: [{ $abs: { $subtract: ["$scoreP1", "$scoreP2"] } }, 0],
        },
    })
    assert.equal(
        JSON.stringify(conditions).includes("scoringDifference"),
        false
    )
})

test("findMatches filters total goals of the match", async () => {
    const conditions = await captureFindMatchesFilter({
        totalGoalsOp: "gte",
        totalGoalsVal: 8,
    })

    assertHasCondition(conditions, {
        ...NUMERIC_SCORES,
        $expr: { $gte: [{ $add: ["$scoreP1", "$scoreP2"] }, 8] },
    })
})

test("findMatches filters goals conceded and teams from player1's perspective", async () => {
    const conditions = await captureFindMatchesFilter({
        player1: PLAYER_A,
        player1ConcededOp: "eq",
        player1ConcededVal: 0,
        player1Team: "Brasil",
        opponentTeam: "Real (Madrid)",
    })

    assertHasCondition(conditions, {
        $or: [
            { "playerP1.id": PLAYER_A, scoreP2: { $eq: 0 } },
            { "playerP2.id": PLAYER_A, scoreP1: { $eq: 0 } },
        ],
    })
    assertHasCondition(conditions, {
        $or: [
            {
                "playerP1.id": PLAYER_A,
                "teamP1.name": { $regex: "Brasil", $options: "i" },
            },
            {
                "playerP2.id": PLAYER_A,
                "teamP2.name": { $regex: "Brasil", $options: "i" },
            },
        ],
    })
    // El texto se escapa: los paréntesis no se interpretan como regex.
    assertHasCondition(conditions, {
        $or: [
            {
                "playerP1.id": PLAYER_A,
                "teamP2.name": { $regex: "Real \\(Madrid\\)", $options: "i" },
            },
            {
                "playerP2.id": PLAYER_A,
                "teamP1.name": { $regex: "Real \\(Madrid\\)", $options: "i" },
            },
        ],
    })
})

test("findMatches ignores player-dependent filters when their player is not selected", async () => {
    const withoutPlayers = await captureFindMatchesFilter({
        player1: "all",
        player2: PLAYER_B,
        player1GoalsVal: 2,
        player1ConcededVal: 1,
        player1Team: "Brasil",
        opponentTeam: "Boca",
    })

    const serialized = JSON.stringify(withoutPlayers)
    assert.equal(serialized.includes("scoreP"), false)
    assert.equal(serialized.includes("team"), false)
    assert.equal(serialized.includes(PLAYER_B), false)
})

test("findMatches maps the playoff round to playoff_id ranges per tournament format", async () => {
    const tournaments = [
        { _id: "t-playoff", format: "playoff" },
        { _id: "t-world-cup-2026", format: "world_cup_2026" },
        { _id: "t-league", format: "league_playin_playoff" },
        { _id: "t-champions", format: "champions_league" },
    ]

    const conditions = await captureFindMatchesFilter(
        { type: "playoff", playoffRound: "semifinal" },
        tournaments
    )

    assertHasCondition(conditions, {
        type: "playoff",
        $or: [
            {
                "tournament.id": { $in: ["t-playoff", "t-world-cup-2026"] },
                playoff_id: { $in: [29, 30, "29", "30"] },
            },
            {
                "tournament.id": { $in: ["t-league"] },
                playoff_id: { $in: [13, 14, "13", "14"] },
            },
            {
                "tournament.id": { $in: ["t-champions"] },
                playoff_id: { $in: [25, 26, 27, 28, "25", "26", "27", "28"] },
            },
        ],
    })
})

test("findMatches returns nothing for a round no bracket has, and ignores the round outside playoff", async () => {
    const tournaments = [{ _id: "t-league", format: "league_playin_playoff" }]

    const noBracket = await captureFindMatchesFilter(
        { type: "playoff", playoffRound: "round_of_32" },
        tournaments
    )
    const notPlayoff = await captureFindMatchesFilter(
        { type: "knockout", playoffRound: "final" },
        tournaments
    )

    assertHasCondition(noBracket, { _id: { $exists: false } })
    assert.equal(JSON.stringify(notPlayoff).includes("playoff_id"), false)
})

test("the final round range agrees with the final playoff_id of every format", () => {
    const {
        getFinalPlayoffId,
        getPlayoffRoundIdRange,
    } = require("../config/playoffFormats")
    const formats = [
        "champions_league",
        "league_playin_playoff",
        "playoff",
        "super_cup",
        "world_cup",
        "world_cup_2026",
        "club_world_cup",
    ]

    for (const format of formats) {
        const finalId = getFinalPlayoffId(format)
        assert.deepEqual(
            getPlayoffRoundIdRange(format, "final"),
            [finalId, finalId],
            format
        )
    }
})

test("match teams returns unique, trimmed and sorted teams with their logo id", async () => {
    const { createGetMatchTeams } = require("../controller/getMatchTeams")
    const controller = createGetMatchTeams({
        retrieveMatchTeams: async () => [
            { id: 1, name: "Racing" },
            { id: 2, name: "Boca" },
            // Mismo nombre con espacios: se queda el primero.
            { id: 99, name: " Racing " },
            // Sin id primero y con id después: gana el que tiene escudo.
            { id: null, name: "Ávila" },
            { id: 3, name: "Ávila" },
            { name: "atlético" },
            { id: 4, name: "" },
            { id: 5, name: null },
            null,
        ],
    })
    const response = createResponse()

    await controller({}, response)

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.body, [
        { id: null, name: "atlético" },
        { id: 3, name: "Ávila" },
        { id: 2, name: "Boca" },
        { id: 1, name: "Racing" },
    ])
})

test("match teams are grouped by name in Mongo over listed matches", async () => {
    const findMatchTeams = require("../dao/findMatchTeams")
    const originalAggregate = matchesModel.aggregate
    let pipeline

    matchesModel.aggregate = async (received) => {
        pipeline = received
        return [{ id: 1, name: "Racing" }]
    }

    try {
        assert.deepEqual(await findMatchTeams(), [{ id: 1, name: "Racing" }])
    } finally {
        matchesModel.aggregate = originalAggregate
    }

    assert.deepEqual(pipeline[0], {
        $match: { valid: { $ne: false }, played: { $ne: false } },
    })
    assert.deepEqual(pipeline.at(-2), {
        $group: { _id: "$teams.name", id: { $max: "$teams.id" } },
    })
})

test("match teams route rejects unexpected query params", async () => {
    const request = { params: {}, query: { q: "bra" }, body: {} }

    const error = await runValidation(schemas.getMatchTeams, request)

    assert.equal(error?.code, "VALIDATION_ERROR")
})

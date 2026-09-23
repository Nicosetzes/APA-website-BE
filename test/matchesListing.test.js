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

    await controller(
        {
            query: {
                page: 2,
                teamName: "Racing",
                player1: "aaaaaaaaaaaaaaaaaaaaaaaa",
                player2: "bbbbbbbbbbbbbbbbbbbbbbbb",
                tournamentId: "cccccccccccccccccccccccc",
                type: "knockout",
                outcome: "win",
                goalDiffOp: "lte",
                goalDiffVal: 3,
                dateFrom: "2025-01-01",
                dateTo: "2025-01-31",
                played: true,
            },
        },
        response
    )

    assert.deepEqual(received, {
        page: 2,
        teamName: "Racing",
        player1: "aaaaaaaaaaaaaaaaaaaaaaaa",
        player2: "bbbbbbbbbbbbbbbbbbbbbbbb",
        tournamentId: "cccccccccccccccccccccccc",
        type: "knockout",
        outcome: "win",
        goalDiffOp: "lte",
        goalDiffVal: 3,
        dateFrom: "2025-01-01",
        dateTo: "2025-01-31",
        played: true,
    })
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
    assert.equal(request.query.page, 0)
    assert.equal(request.query.goalDiffOp, "gte")
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
        { query: { page: -1 }, body: {} },
        { query: { page: 99999 }, body: {} },
        { query: { type: "friendly" }, body: {} },
        { query: { outcome: "victory" }, body: {} },
        { query: { goalDiffOp: "gt" }, body: {} },
        { query: { goalDiffVal: 500 }, body: {} },
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

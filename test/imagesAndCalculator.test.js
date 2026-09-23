const assert = require("node:assert/strict")
const test = require("node:test")

const validateRequest = require("../middleware/validateRequest")
const schemas = require("../validation/requestSchemas")
const {
    createGetTournamentImages,
} = require("../controller/getTournamentImages")
const {
    createGetCalculatorByTournamentId,
} = require("../controller/getCalculatorByTournamentId")

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

test("tournament images keep the success/data/total contract", async () => {
    const controller = createGetTournamentImages({
        listImages: async () => ({
            total_count: 1,
            resources: [
                {
                    public_id: "tournaments/liga",
                    secure_url: "https://cdn.test/liga.png",
                    format: "png",
                    width: 800,
                    height: 600,
                    extra: "ignored",
                },
            ],
        }),
    })
    const response = createResponse()

    await controller({}, response)

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.body, {
        success: true,
        data: [
            {
                cloudinary_id: "tournaments/liga",
                url: "https://cdn.test/liga.png",
                format: "png",
                width: 800,
                height: 600,
            },
        ],
        total: 1,
    })
})

test("tournament images redact the provider error", async () => {
    const providerError = new Error("Invalid api_key abc123 for cloud_name apa")
    providerError.http_code = 401
    const controller = createGetTournamentImages({
        listImages: async () => {
            throw providerError
        },
    })
    const response = createResponse()
    const originalLogLevel = process.env.LOG_LEVEL
    process.env.LOG_LEVEL = "silent"

    try {
        await assert.rejects(controller({}, response), (error) => {
            assert.equal(error.status, 502)
            assert.equal(error.code, "IMAGE_PROVIDER_ERROR")
            assert.equal(
                error.message,
                "No se pudieron obtener las imágenes de torneos"
            )
            assert.ok(!error.message.includes("api_key"))
            assert.equal(error.cause, providerError)
            return true
        })
    } finally {
        process.env.LOG_LEVEL = originalLogLevel
    }

    assert.equal(response.statusCode, null)
})

test("calculator forwards parsed team ids and preserves the response", async () => {
    let receivedTeamsArgs
    let receivedStandingsTournament
    const controller = createGetCalculatorByTournamentId({
        retrieveTeamRemainingMatchesByTournamentId: async (...args) => {
            receivedTeamsArgs = args
            return [{ team: { id: "10" }, matches: [] }]
        },
        retrieveStandingsForCalculatorByTournamentId: async (tournament) => {
            receivedStandingsTournament = tournament
            return [{ team: { id: "10" }, points: 3 }]
        },
    })
    const response = createResponse()

    await controller(
        {
            params: { tournament: TOURNAMENT_ID },
            query: { teams: ["10", "20"] },
        },
        response
    )

    assert.deepEqual(receivedTeamsArgs, [TOURNAMENT_ID, ["10", "20"]])
    assert.equal(receivedStandingsTournament, TOURNAMENT_ID)
    assert.equal(response.statusCode, 200)
    assert.deepEqual(Object.keys(response.body), ["teams", "standings"])
    assert.equal(response.body.teams[0].team.id, "10")
    assert.equal(response.body.standings[0].points, 3)
})

test("calculator propagates persistence failures", async () => {
    const expectedError = new Error("Mongo failed")
    const controller = createGetCalculatorByTournamentId({
        retrieveTeamRemainingMatchesByTournamentId: async () => {
            throw expectedError
        },
        retrieveStandingsForCalculatorByTournamentId: async () => [],
    })

    await assert.rejects(
        controller(
            { params: { tournament: TOURNAMENT_ID }, query: { teams: ["10"] } },
            createResponse()
        ),
        expectedError
    )
})

test("images validation rejects any query or body", async () => {
    assert.equal(
        await runValidation(schemas.getTournamentImages, {
            params: {},
            query: {},
            body: {},
        }),
        undefined
    )

    const error = await runValidation(schemas.getTournamentImages, {
        params: {},
        query: { prefix: "otros/" },
        body: {},
    })

    assert.ok(error)
    assert.equal(error.status, 400)
    assert.equal(error.code, "VALIDATION_ERROR")
})

test("calculator validation parses bounded JSON team ids", async () => {
    const request = {
        params: { tournament: TOURNAMENT_ID },
        query: { teams: '["10","20"]' },
        body: {},
    }

    assert.equal(await runValidation(schemas.getCalculator, request), undefined)
    assert.deepEqual(request.query.teams, ["10", "20"])

    const invalidRequests = [
        // Antes cada uno de estos casos terminaba en un 500.
        { params: { tournament: TOURNAMENT_ID }, query: {}, body: {} },
        {
            params: { tournament: TOURNAMENT_ID },
            query: { teams: "null" },
            body: {},
        },
        {
            params: { tournament: TOURNAMENT_ID },
            query: { teams: "[" },
            body: {},
        },
        {
            params: { tournament: TOURNAMENT_ID },
            query: { teams: "[]" },
            body: {},
        },
        {
            params: { tournament: TOURNAMENT_ID },
            query: { teams: '["10","10"]' },
            body: {},
        },
        {
            params: { tournament: TOURNAMENT_ID },
            query: {
                teams: JSON.stringify(
                    Array.from({ length: 41 }, (_, index) => String(index))
                ),
            },
            body: {},
        },
        {
            params: { tournament: TOURNAMENT_ID },
            query: { teams: `["${"x".repeat(1200)}"]` },
            body: {},
        },
        {
            params: { tournament: "not-an-id" },
            query: { teams: "[1]" },
            body: {},
        },
    ]

    for (const invalidRequest of invalidRequests) {
        const error = await runValidation(schemas.getCalculator, invalidRequest)

        assert.ok(
            error,
            `expected rejection for ${JSON.stringify(invalidRequest.query)}`
        )
        assert.equal(error.status, 400)
        assert.equal(error.code, "VALIDATION_ERROR")
    }
})

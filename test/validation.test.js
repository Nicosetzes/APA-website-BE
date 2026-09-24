const assert = require("node:assert/strict")
const test = require("node:test")

const validateRequest = require("../middleware/validateRequest")
const schemas = require("../validation/requestSchemas")

const runValidation = (schema, request) =>
    new Promise((resolve) => {
        validateRequest(schema)(request, {}, (error) => {
            resolve(error)
        })
    })

test("update match validation converts scores and accepts current payload", async () => {
    const request = {
        params: {
            tournament: "aaaaaaaaaaaaaaaaaaaaaaaa",
            match: "bbbbbbbbbbbbbbbbbbbbbbbb",
        },
        query: {},
        body: {
            playerP1: { id: "1", name: "Nico" },
            teamP1: { id: "10", name: "Team A" },
            scoreP1: "2",
            playerP2: { id: "2", name: "Santi" },
            teamP2: { id: "20", name: "Team B" },
            scoreP2: "1",
        },
    }

    const error = await runValidation(schemas.updateMatch, request)

    assert.equal(error, undefined)
    assert.equal(request.body.scoreP1, 2)
    assert.equal(request.body.scoreP2, 1)
})

test("knockout draws require two distinct penalty scores", async () => {
    const baseRequest = {
        params: {
            tournament: "aaaaaaaaaaaaaaaaaaaaaaaa",
            match: "bbbbbbbbbbbbbbbbbbbbbbbb",
        },
        query: {},
        body: {
            playerP1: { id: "1", name: "Nico" },
            teamP1: { id: "10", name: "Team A" },
            seedP1: "1",
            scoreP1: 1,
            playerP2: { id: "2", name: "Santi" },
            teamP2: { id: "20", name: "Team B" },
            seedP2: "2",
            scoreP2: 1,
        },
    }

    const missingPenalties = await runValidation(schemas.updateMatch, {
        ...baseRequest,
        body: { ...baseRequest.body },
    })
    const tiedPenalties = await runValidation(schemas.updateMatch, {
        ...baseRequest,
        body: {
            ...baseRequest.body,
            penaltyScoreP1: 4,
            penaltyScoreP2: 4,
        },
    })
    const validPenalties = await runValidation(schemas.updateMatch, {
        ...baseRequest,
        body: {
            ...baseRequest.body,
            penaltyScoreP1: 5,
            penaltyScoreP2: 4,
        },
    })

    assert.equal(missingPenalties.code, "VALIDATION_ERROR")
    assert.equal(tiedPenalties.code, "VALIDATION_ERROR")
    assert.equal(validPenalties, undefined)
})

test("validation rejects malformed IDs, missing fields and unknown fields", async () => {
    const request = {
        params: {
            tournament: "not-an-object-id",
            match: "bbbbbbbbbbbbbbbbbbbbbbbb",
        },
        query: {},
        body: { unexpected: "value" },
    }

    const error = await runValidation(schemas.updateMatch, request)

    assert.equal(error.code, "VALIDATION_ERROR")
    assert.equal(error.status, 400)
    assert.ok(error.details.length > 1)
    assert.ok(
        error.details.every(
            (detail) =>
                Object.hasOwn(detail, "source") &&
                Object.hasOwn(detail, "path") &&
                Object.hasOwn(detail, "code") &&
                !Object.hasOwn(detail, "value")
        )
    )
})

test("edits pagination applies defaults, converts values and rejects invalid pages", async () => {
    const defaultRequest = { query: {} }
    const convertedRequest = { query: { page: "2" } }
    const invalidRequest = { query: { page: "0", unexpected: "value" } }

    const defaultError = await runValidation(schemas.getEdits, defaultRequest)
    const convertedError = await runValidation(
        schemas.getEdits,
        convertedRequest
    )
    const invalidError = await runValidation(schemas.getEdits, invalidRequest)

    assert.equal(defaultError, undefined)
    assert.equal(defaultRequest.query.page, 1)
    assert.equal(convertedError, undefined)
    assert.equal(convertedRequest.query.page, 2)
    assert.equal(invalidError.code, "VALIDATION_ERROR")
})

test("fixture GET parses active FE filters and rejects malformed players/page", async () => {
    const validRequest = {
        params: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        query: {
            page: "2",
            team: "10",
            group: "a",
            players: ["player-1", "player-2"],
        },
        body: {},
    }
    const singlePlayerRequest = {
        params: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        query: { players: "player-1" },
        body: {},
    }
    const invalidRequest = {
        params: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        query: { page: "0", players: ["1", "2"] },
        body: {},
    }
    const tooManyPlayersRequest = {
        params: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        query: { players: ["1", "2", "3"] },
        body: {},
    }
    const duplicatedPlayersRequest = {
        params: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        query: { players: ["1", "1"] },
        body: {},
    }

    assert.equal(
        await runValidation(schemas.getFixture, validRequest),
        undefined
    )
    assert.equal(validRequest.query.page, 2)
    assert.equal(validRequest.query.group, "A")
    assert.deepEqual(validRequest.query.players, ["player-1", "player-2"])

    assert.equal(
        await runValidation(schemas.getFixture, singlePlayerRequest),
        undefined
    )
    assert.deepEqual(singlePlayerRequest.query.players, ["player-1"])

    assert.equal(
        (await runValidation(schemas.getFixture, invalidRequest)).code,
        "VALIDATION_ERROR"
    )
    assert.equal(
        (await runValidation(schemas.getFixture, tooManyPlayersRequest)).code,
        "VALIDATION_ERROR"
    )
    assert.equal(
        (await runValidation(schemas.getFixture, duplicatedPlayersRequest))
            .code,
        "VALIDATION_ERROR"
    )
})

test("serialized JSON arrays still work while the deployed FE catches up", async () => {
    const legacyFixtureRequest = {
        params: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        query: { players: '["player-1","player-2"]' },
        body: {},
    }
    const legacyCalculatorRequest = {
        params: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        query: { teams: '["team-1","team-2"]' },
        body: {},
    }
    const legacyTooManyPlayersRequest = {
        params: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        query: { players: '["1","2","3"]' },
        body: {},
    }

    assert.equal(
        await runValidation(schemas.getFixture, legacyFixtureRequest),
        undefined
    )
    assert.deepEqual(legacyFixtureRequest.query.players, [
        "player-1",
        "player-2",
    ])

    assert.equal(
        await runValidation(schemas.getCalculator, legacyCalculatorRequest),
        undefined
    )
    assert.deepEqual(legacyCalculatorRequest.query.teams, ["team-1", "team-2"])

    assert.equal(
        (await runValidation(schemas.getFixture, legacyTooManyPlayersRequest))
            .code,
        "VALIDATION_ERROR"
    )
})

test("play-in GET validates tournament and rejects extra query fields", async () => {
    const validRequest = {
        params: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        query: {},
        body: {},
    }
    const invalidRequest = {
        params: { tournament: "invalid" },
        query: { unexpected: "value" },
        body: {},
    }

    assert.equal(
        await runValidation(schemas.getPlayin, validRequest),
        undefined
    )
    assert.equal(
        (await runValidation(schemas.getPlayin, invalidRequest)).code,
        "VALIDATION_ERROR"
    )
})

test("playoff GET validates tournament and rejects extra input", async () => {
    const validRequest = {
        params: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        query: {},
        body: {},
    }
    const invalidRequest = {
        params: { tournament: "invalid" },
        query: { unexpected: "value" },
        body: {},
    }

    assert.equal(
        await runValidation(schemas.getPlayoff, validRequest),
        undefined
    )
    assert.equal(
        (await runValidation(schemas.getPlayoff, invalidRequest)).code,
        "VALIDATION_ERROR"
    )
})

test("tournament listing validates status and converts legacy boolean", async () => {
    const validRequest = {
        query: { status: "active", legacy: "false" },
        body: {},
    }
    const invalidRequest = {
        query: { status: "unknown", extra: "value" },
        body: {},
    }

    assert.equal(
        await runValidation(schemas.getTournaments, validRequest),
        undefined
    )
    assert.equal(validRequest.query.legacy, false)
    assert.equal(validRequest.query.status, "active")
    assert.equal(
        (await runValidation(schemas.getTournaments, invalidRequest)).code,
        "VALIDATION_ERROR"
    )
})

test("tournament resource schema validates detail and summary inputs", async () => {
    const validRequest = {
        params: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        query: {},
        body: {},
    }
    const invalidRequest = {
        params: { tournament: "invalid" },
        query: { unexpected: "value" },
        body: {},
    }

    assert.equal(
        await runValidation(schemas.getTournamentResource, validRequest),
        undefined
    )
    assert.equal(
        (await runValidation(schemas.getTournamentResource, invalidRequest))
            .code,
        "VALIDATION_ERROR"
    )
})

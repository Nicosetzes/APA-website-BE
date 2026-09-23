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

test("daily recap rejects impossible calendar dates", async () => {
    const error = await runValidation(schemas.dailyRecap, {
        params: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        query: {},
        body: { date: "2026-99-99", content: "recap" },
    })

    assert.equal(error.code, "VALIDATION_ERROR")
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

const assert = require("node:assert/strict")
const test = require("node:test")

const {
    createGetDailyRecapByTournamentId,
} = require("../controller/getDailyRecapByTournamentId")
const {
    createPostDailyRecapByTournamentId,
} = require("../controller/postDailyRecapByTournamentId")

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

test("POST daily recap delegates validated data and preserves response shape", async () => {
    let received
    const updatedTournament = { _id: "tournament" }
    const controller = createPostDailyRecapByTournamentId({
        upsertDailyRecapByTournamentId: async (...args) => {
            received = args
            return updatedTournament
        },
    })
    const response = createResponse()

    await controller(
        {
            params: { tournament: "tournament" },
            body: { date: "2026-09-22", content: { summary: "content" } },
        },
        response
    )

    assert.deepEqual(received, [
        "tournament",
        "2026-09-22",
        { summary: "content" },
    ])
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.body, {
        ok: true,
        tournament: updatedTournament,
    })
})

test("POST daily recap reports a disappeared tournament as 404", async () => {
    const controller = createPostDailyRecapByTournamentId({
        upsertDailyRecapByTournamentId: async () => null,
    })

    const error = await controller(
        {
            params: { tournament: "tournament" },
            body: { date: "2026-09-22", content: "content" },
        },
        createResponse()
    ).catch((caughtError) => caughtError)

    assert.equal(error.status, 404)
    assert.equal(error.code, "TOURNAMENT_NOT_FOUND")
})

test("GET daily recap delegates optional date and returns recap", async () => {
    let received
    const recap = { date: "2026-09-22", content: "content" }
    const controller = createGetDailyRecapByTournamentId({
        getDailyRecapByTournamentId: async (...args) => {
            received = args
            return recap
        },
    })
    const response = createResponse()

    await controller(
        {
            params: { tournament: "tournament" },
            query: { date: "2026-09-22" },
        },
        response
    )

    assert.deepEqual(received, ["tournament", "2026-09-22"])
    assert.equal(response.statusCode, 200)
    assert.equal(response.body, recap)
})

test("GET daily recap reports missing entries as canonical 404", async () => {
    const controller = createGetDailyRecapByTournamentId({
        getDailyRecapByTournamentId: async () => null,
    })

    const error = await controller(
        { params: { tournament: "tournament" }, query: {} },
        createResponse()
    ).catch((caughtError) => caughtError)

    assert.equal(error.status, 404)
    assert.equal(error.code, "DAILY_RECAP_NOT_FOUND")
})

test("daily recap persistence failures propagate to the central handler", async () => {
    const expectedError = new Error("Mongo failed")
    const controller = createPostDailyRecapByTournamentId({
        upsertDailyRecapByTournamentId: async () => {
            throw expectedError
        },
    })

    await assert.rejects(
        controller(
            {
                params: { tournament: "tournament" },
                body: { date: "2026-09-22", content: "content" },
            },
            createResponse()
        ),
        expectedError
    )
})

const assert = require("node:assert/strict")
const test = require("node:test")

const tournamentsModel = require("../dao/models/tournaments")
const findTournaments = require("../dao/findTournaments")
const { createGetTournaments } = require("../controller/getTournaments")

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

test("tournament list controller preserves filters and array response", async () => {
    let received
    const tournaments = [{ _id: "tournament" }]
    const controller = createGetTournaments({
        retrieveTournaments: async (...args) => {
            received = args
            return tournaments
        },
    })
    const response = createResponse()

    await controller(
        { query: { legacy: false, status: "active" } },
        response
    )

    assert.deepEqual(received, [false, "active"])
    assert.equal(response.statusCode, 200)
    assert.equal(response.body, tournaments)
})

test("tournament list controller propagates persistence failures", async () => {
    const expectedError = new Error("Mongo failed")
    const controller = createGetTournaments({
        retrieveTournaments: async () => {
            throw expectedError
        },
    })

    await assert.rejects(
        controller({ query: {} }, createResponse()),
        expectedError
    )
})

test("legacy=false boolean keeps precedence over status in DAO", async (t) => {
    const originalFind = tournamentsModel.find
    let receivedFilter
    let receivedProjection
    let receivedSort

    t.after(() => {
        tournamentsModel.find = originalFind
    })

    tournamentsModel.find = (filter, projection) => {
        receivedFilter = filter
        receivedProjection = projection
        return {
            sort: async (sort) => {
                receivedSort = sort
                return []
            },
        }
    }

    await findTournaments(false, "finalized")

    assert.deepEqual(receivedFilter, {
        legacy: { $ne: true },
        valid: { $ne: false },
    })
    assert.equal(
        receivedProjection,
        "cloudinary_id name ongoing outcome updatedAt"
    )
    assert.deepEqual(receivedSort, { createdAt: -1, id: -1 })
})

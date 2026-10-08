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

    await controller({ query: { legacy: false, status: "active" } }, response)

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

    tournamentsModel.find = async (filter, projection) => {
        receivedFilter = filter
        receivedProjection = projection
        return []
    }

    await findTournaments(false, "finalized")

    assert.deepEqual(receivedFilter, {
        legacy: { $ne: true },
        valid: { $ne: false },
    })
    assert.equal(
        receivedProjection,
        "cloudinary_id name ongoing outcome format playoffMode startedAt startedAtPrecision closedAt closedAtPrecision"
    )
})

const datedTournaments = () => [
    // No empezado con createdAt viejo: createdAt ya no influye.
    { _id: "a1", createdAt: new Date("2019-01-01T00:00:00Z") },
    {
        _id: "b2",
        // createdAt más nuevo que startedAt tampoco influye.
        createdAt: new Date("2027-06-01T00:00:00Z"),
        startedAt: new Date("2019-03-01T00:00:00Z"),
        startedAtPrecision: "year",
    },
    {
        _id: "c3",
        startedAt: new Date("2025-01-01T00:00:00Z"),
        startedAtPrecision: "exact",
    },
    // Mismo inicio que c3: desempate por _id desc.
    {
        _id: "c4",
        startedAt: new Date("2025-01-01T00:00:00Z"),
        startedAtPrecision: "exact",
    },
    { _id: "d5", startedAt: new Date("2023-07-01T00:00:00Z") },
    // Otro no empezado: entre ellos, _id desc.
    { _id: "z9", createdAt: new Date("2026-01-01T00:00:00Z") },
]

const withDatedTournaments = (t) => {
    const originalFind = tournamentsModel.find
    const projections = []
    t.after(() => {
        tournamentsModel.find = originalFind
    })
    tournamentsModel.find = async (filter, projection) => {
        projections.push(projection)
        return datedTournaments()
    }
    return projections
}

const ids = (list) => list.map(({ _id }) => _id)

test("desc lists put not-started tournaments first, then startedAt desc", async (t) => {
    const projections = withDatedTournaments(t)
    const expected = ["z9", "a1", "c4", "c3", "d5", "b2"]

    assert.deepEqual(ids(await findTournaments(false)), expected)
    assert.deepEqual(ids(await findTournaments(undefined, "active")), expected)
    assert.deepEqual(ids(await findTournaments(undefined)), expected)

    for (const projection of projections) {
        const fields = projection.split(" ")
        for (const field of [
            "startedAt",
            "startedAtPrecision",
            "closedAt",
            "closedAtPrecision",
        ]) {
            assert.ok(fields.includes(field), field)
        }
        assert.equal(fields.includes("createdAt"), false)
        assert.equal(fields.includes("updatedAt"), false)
    }
})

test("finalized lists go by startedAt asc, ties by _id desc, not-started last", async (t) => {
    const projections = withDatedTournaments(t)

    assert.deepEqual(ids(await findTournaments(undefined, "finalized")), [
        "b2",
        "d5",
        "c4",
        "c3",
        "z9",
        "a1",
    ])
    assert.equal(
        projections[0],
        "name cloudinary_id outcome startedAt startedAtPrecision closedAt closedAtPrecision"
    )
})

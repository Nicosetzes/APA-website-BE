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
        "cloudinary_id name ongoing outcome updatedAt format playoffMode createdAt startedAt startedAtPrecision closedAt closedAtPrecision"
    )
})

const datedTournaments = () => [
    // Sólo createdAt (sin backfill).
    { _id: "a1", createdAt: new Date("2023-01-01T00:00:00Z") },
    // startedAt manda sobre createdAt (legacy con createdAt inventado).
    {
        _id: "b2",
        createdAt: new Date("2024-06-01T00:00:00Z"),
        startedAt: new Date("2019-03-01T00:00:00Z"),
        startedAtPrecision: "year",
    },
    { _id: "c3", createdAt: new Date("2025-01-01T00:00:00Z") },
    // Mismo instante que c3: desempate por _id desc.
    { _id: "c4", createdAt: new Date("2025-01-01T00:00:00Z") },
    // Sin ninguna fecha: al final.
    { _id: "z9" },
]

test("tournament lists are ordered by startedAt ?? createdAt in JS", async (t) => {
    const originalFind = tournamentsModel.find
    t.after(() => {
        tournamentsModel.find = originalFind
    })
    const projections = []
    tournamentsModel.find = async (filter, projection) => {
        projections.push(projection)
        return datedTournaments()
    }

    const ids = (list) => list.map(({ _id }) => _id)

    assert.deepEqual(ids(await findTournaments(false)), [
        "c4",
        "c3",
        "a1",
        "b2",
        "z9",
    ])
    assert.deepEqual(ids(await findTournaments(undefined, "active")), [
        "c4",
        "c3",
        "a1",
        "b2",
        "z9",
    ])
    assert.deepEqual(ids(await findTournaments(undefined)), [
        "c4",
        "c3",
        "a1",
        "b2",
        "z9",
    ])
    // Finalizados: del más viejo al más nuevo.
    assert.deepEqual(ids(await findTournaments(undefined, "finalized")), [
        "b2",
        "a1",
        "c4",
        "c3",
        "z9",
    ])

    for (const projection of projections) {
        for (const field of [
            "createdAt",
            "startedAt",
            "startedAtPrecision",
            "closedAt",
            "closedAtPrecision",
        ]) {
            assert.ok(projection.split(" ").includes(field), field)
        }
    }
})

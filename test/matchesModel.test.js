const assert = require("node:assert/strict")
const test = require("node:test")

const matchesModel = require("../dao/models/matches")

test("new v1 matches require routing fields", async () => {
    const match = new matchesModel({})

    const error = await match
        .validate()
        .catch((validationError) => validationError)

    assert.ok(error.errors.type)
    assert.ok(error.errors.tournament)
    assert.ok(error.errors.played)
    assert.equal(match.schemaVersion, 1)
})

test("new v1 matches reject invalid type and tournament reference", async () => {
    const match = new matchesModel({
        type: "friendly",
        tournament: { id: "tournament-id" },
        played: false,
    })

    const error = await match
        .validate()
        .catch((validationError) => validationError)

    assert.ok(error.errors.type)
    assert.ok(error.errors.tournament)
})

test("new v1 matches accept canonical routing fields", async () => {
    const match = new matchesModel({
        type: "regular",
        tournament: { id: "tournament-id", name: "Tournament" },
        played: false,
    })

    await match.validate()

    assert.equal(match.schemaVersion, 1)
    assert.equal(match.type, "regular")
    assert.equal(match.played, false)
})

test("unversioned legacy matches are not retroactively rejected", async () => {
    const match = matchesModel.hydrate({ type: "historical-format" })

    await match.validate()

    assert.equal(match.schemaVersion, undefined)
    assert.equal(match.type, "historical-format")
    assert.equal(match.tournament, undefined)
    assert.equal(match.played, undefined)
})

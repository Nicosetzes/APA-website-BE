const assert = require("node:assert/strict")
const test = require("node:test")

const tournamentsModel = require("../dao/models/tournaments")

const validTournament = {
    name: "League",
    format: "league",
    players: [{ id: "player-id", name: "Player" }],
    teams: [
        {
            team: { id: "team-id", name: "Team" },
            player: { id: "player-id", name: "Player" },
        },
    ],
}

test("new v1 tournaments require core fields", async () => {
    const tournament = new tournamentsModel({})

    const error = await tournament
        .validate()
        .catch((validationError) => validationError)

    assert.ok(error.errors.name)
    assert.ok(error.errors.format)
    assert.ok(error.errors.players)
    assert.ok(error.errors.teams)
    assert.equal(tournament.schemaVersion, 1)
})

test("new v1 tournaments reject malformed participants and formats", async () => {
    const tournament = new tournamentsModel({
        name: "Tournament",
        format: "historical-format",
        players: [{ id: "player-id" }],
        teams: [{ team: { id: "team-id", name: "Team" } }],
    })

    const error = await tournament
        .validate()
        .catch((validationError) => validationError)

    assert.ok(error.errors.format)
    assert.ok(error.errors.players)
    assert.ok(error.errors.teams)
})

test("new v1 tournaments accept the current creation contract", async () => {
    const tournament = new tournamentsModel(validTournament)

    await tournament.validate()

    assert.equal(tournament.schemaVersion, 1)
    assert.equal(tournament.name, "League")
    assert.equal(tournament.format, "league")
})

test("unversioned legacy tournaments are not retroactively rejected", async () => {
    const tournament = tournamentsModel.hydrate({
        name: "Historical tournament",
        format: "historical-format",
        players: [],
        teams: [],
    })

    await tournament.validate()

    assert.equal(tournament.schemaVersion, undefined)
    assert.equal(tournament.format, "historical-format")
})

test("new tournaments receive isolated daily recap containers", () => {
    const first = new tournamentsModel(validTournament)
    const second = new tournamentsModel(validTournament)

    first.daily_recap["2026-09-22"] = { content: "recap" }

    assert.notEqual(first.daily_recap, second.daily_recap)
    assert.equal(second.daily_recap["2026-09-22"], undefined)
})

test("daily recap container validation applies only to v1 tournaments", async () => {
    const current = new tournamentsModel({
        ...validTournament,
        daily_recap: [],
    })
    const currentError = await current
        .validate()
        .catch((validationError) => validationError)

    assert.ok(currentError.errors.daily_recap)

    const legacy = tournamentsModel.hydrate({
        name: "Historical tournament",
        daily_recap: [],
    })
    await legacy.validate()

    assert.equal(legacy.schemaVersion, undefined)
    assert.deepEqual(legacy.daily_recap, [])
})

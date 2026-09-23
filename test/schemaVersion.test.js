const assert = require("node:assert/strict")
const test = require("node:test")

const matchesModel = require("../dao/models/matches")
const tournamentsModel = require("../dao/models/tournaments")
const {
    CURRENT_SCHEMA_VERSION,
    stampSchemaVersion,
} = require("../dao/models/plugins/schemaVersion")

test("new tournaments and matches receive the current schema version", async () => {
    const tournament = new tournamentsModel({
        schemaVersion: 99,
        name: "Tournament",
        format: "league",
        players: [{ id: "player-id", name: "Player" }],
        teams: [
            {
                team: { id: "team-id", name: "Team" },
                player: { id: "player-id", name: "Player" },
            },
        ],
    })
    const match = new matchesModel({
        schemaVersion: 99,
        type: "regular",
        tournament: { id: "tournament-id", name: "Tournament" },
        played: false,
    })

    await tournament.validate()
    await match.validate()

    assert.equal(tournament.schemaVersion, CURRENT_SCHEMA_VERSION)
    assert.equal(match.schemaVersion, CURRENT_SCHEMA_VERSION)
})

test("hydrated legacy documents remain unversioned", async () => {
    const tournament = tournamentsModel.hydrate({ name: "Legacy" })
    const match = matchesModel.hydrate({ type: "regular" })

    await tournament.validate()
    await match.validate()

    assert.equal(tournament.isNew, false)
    assert.equal(match.isNew, false)
    assert.equal(tournament.schemaVersion, undefined)
    assert.equal(match.schemaVersion, undefined)
})

test("insertMany stamping versions every new input without changing other fields", () => {
    const documents = [
        { type: "regular", played: false },
        { type: "playoff", played: false, schemaVersion: 99 },
    ]

    stampSchemaVersion(documents)

    assert.deepEqual(documents, [
        {
            type: "regular",
            played: false,
            schemaVersion: CURRENT_SCHEMA_VERSION,
        },
        {
            type: "playoff",
            played: false,
            schemaVersion: CURRENT_SCHEMA_VERSION,
        },
    ])
})

test("both models register insertMany version middleware", () => {
    const tournamentHooks =
        tournamentsModel.schema.s.hooks._pres.get("insertMany") || []
    const matchHooks = matchesModel.schema.s.hooks._pres.get("insertMany") || []

    assert.ok(
        tournamentHooks.some(({ fn }) => fn.name === "stampInsertedDocuments")
    )
    assert.ok(matchHooks.some(({ fn }) => fn.name === "stampInsertedDocuments"))
})

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const matchesModel = require("../dao/models/matches")
const findPlayoffSeriesByTie = require("../dao/findPlayoffSeriesByTie")
const claimPlayoffSeriesRevision = require("../dao/claimPlayoffSeriesRevision")
const updatePlayoffSeriesSlots = require("../dao/updatePlayoffSeriesSlots")
const updatePlayoffMatchTeams = require("../dao/updatePlayoffMatchTeams")
const updatePlayinMatchTeams = require("../dao/updatePlayinMatchTeams")

const ROOT = path.join(__dirname, "..")

const stubMatchesModel = (t, method, result) => {
    const original = matchesModel[method]
    const calls = []
    t.after(() => {
        matchesModel[method] = original
    })
    matchesModel[method] = async (...args) => {
        calls.push(args)
        return result
    }
    return calls
}

test("series revision claim does not touch the first leg timestamps", async (t) => {
    const calls = stubMatchesModel(t, "findOneAndUpdate", { _id: "leg-1" })
    const session = { id: "session" }

    await claimPlayoffSeriesRevision("tournament", 7, 3, { session })

    const [[filter, update, options]] = calls
    assert.deepEqual(filter, {
        "tournament.id": "tournament",
        type: "playoff",
        playoff_id: 7,
        leg: 1,
        seriesRevision: 3,
    })
    assert.deepEqual(update, { $inc: { seriesRevision: 1 } })
    assert.deepEqual(options, { new: true, session, timestamps: false })
})

test("series slot filling does not touch destination timestamps", async (t) => {
    const calls = stubMatchesModel(t, "updateOne", { modifiedCount: 1 })
    const session = { id: "session" }

    await updatePlayoffSeriesSlots(
        "tournament",
        17,
        [
            { leg: 1, emptyTeamField: "teamP2", fields: { teamP2: "team" } },
            { leg: 2, emptyTeamField: "teamP1", fields: { teamP1: "team" } },
        ],
        { session }
    )

    assert.equal(calls.length, 2)
    for (const [, , options] of calls)
        assert.deepEqual(options, { session, timestamps: false })
})

test("playoff and playin slot filling do not touch match timestamps", async (t) => {
    const calls = stubMatchesModel(t, "findOneAndUpdate", { _id: "slot" })
    const session = { id: "session" }

    await updatePlayoffMatchTeams(
        "tournament",
        5,
        { teamP1: "team" },
        { session }
    )
    await updatePlayinMatchTeams(
        "tournament",
        3,
        { teamP2: "team" },
        { session }
    )

    assert.equal(calls.length, 2)
    for (const [, , options] of calls)
        assert.deepEqual(options, { session, new: true, timestamps: false })
})

test("hot tie query includes the partial-index predicate", async (t) => {
    const originalFind = matchesModel.find
    let filter
    t.after(() => {
        matchesModel.find = originalFind
    })
    matchesModel.find = (received) => {
        filter = received
        return {
            sort: () => ({ session: async () => [] }),
        }
    }

    await findPlayoffSeriesByTie("tournament", 7, { session: {} })

    assert.deepEqual(filter, {
        "tournament.id": "tournament",
        type: "playoff",
        playoff_id: 7,
        leg: { $in: [1, 2, 3] },
    })
})

test("match schema covers tournament listings and unique managed legs", () => {
    const indexes = matchesModel.schema.indexes()
    assert.ok(
        indexes.some(
            ([key, options]) =>
                key["tournament.id"] === 1 &&
                key.type === 1 &&
                key.playoff_id === 1 &&
                options.name === "playoff_tournament_listing_v1"
        )
    )

    // Debe coincidir exactamente (incluido el orden de claves) con el índice
    // que ya existe en producción; si cambia, Mongoose intentaría recrearlo.
    const uniqueLeg = indexes.find(
        ([, options]) => options.name === "uniq_playoff_tournament_tie_leg_v1"
    )
    assert.ok(uniqueLeg, "uniq_playoff_tournament_tie_leg_v1 is declared")
    const [key, options] = uniqueLeg
    assert.equal(
        JSON.stringify(key),
        JSON.stringify({ "tournament.id": 1, playoff_id: 1, leg: 1 })
    )
    assert.equal(options.unique, true)
    assert.equal(
        JSON.stringify(options.partialFilterExpression),
        JSON.stringify({
            type: "playoff",
            leg: { $type: "number" },
            playoff_id: { $type: "number" },
            "tournament.id": { $type: "string" },
        })
    )
})

test("OpenAPI types series metadata, conflicts and fail-closed final corrections", () => {
    const openapi = fs.readFileSync(
        path.join(ROOT, "docs", "openapi.yaml"),
        "utf8"
    )
    for (const expected of [
        "PlayoffSeriesMetadata:",
        "PlayoffMutationMetadata:",
        "PLAYOFF_STATE_CONFLICT",
        "PLAYOFF_LATER_LEG_PLAYED",
        "PLAYOFF_SERIES_ADVANCED",
        "PLAYOFF_DUPLICATE_LEG",
        "fail-closed",
    ]) {
        assert.ok(openapi.includes(expected), expected)
    }
})

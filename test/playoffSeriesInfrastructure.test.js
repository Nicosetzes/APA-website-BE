const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const matchesModel = require("../dao/models/matches")
const findPlayoffSeriesByTie = require("../dao/findPlayoffSeriesByTie")

const ROOT = path.join(__dirname, "..")

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

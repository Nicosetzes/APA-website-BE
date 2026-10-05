const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const mongoose = require("mongoose")
const matchesModel = require("../dao/models/matches")
const findPlayoffSeriesByTie = require("../dao/findPlayoffSeriesByTie")
const {
    PLAYOFF_LEG_INDEX_KEY: INDEX_KEY,
    PLAYOFF_LEG_INDEX_NAME: INDEX_NAME,
    PLAYOFF_LEG_INDEX_FILTER: PARTIAL_FILTER,
} = require("../config/playoffLegIndex")
const {
    createPlayoffLegIndexReadinessGate,
    verifyPlayoffLegIndex,
} = require("../service/playoffLegIndexReadiness")

const ROOT = path.join(__dirname, "..")

test("index management imports have no mongoose or verification side effects", () => {
    const originalAutoIndex = mongoose.get("autoIndex")
    const originalAutoCreate = mongoose.get("autoCreate")
    let verificationCalls = 0
    mongoose.set("autoIndex", true)
    mongoose.set("autoCreate", true)
    delete require.cache[require.resolve("../scripts/managePlayoffLegIndex")]
    delete require.cache[require.resolve("../service/playoffLegIndexReadiness")]

    require("../scripts/managePlayoffLegIndex")
    const {
        createPlayoffLegIndexReadinessGate: createGate,
    } = require("../service/playoffLegIndexReadiness")
    createGate({ verify: async () => verificationCalls++ })

    assert.equal(mongoose.get("autoIndex"), true)
    assert.equal(mongoose.get("autoCreate"), true)
    assert.equal(verificationCalls, 0)
    mongoose.set("autoIndex", originalAutoIndex)
    mongoose.set("autoCreate", originalAutoCreate)
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
    assert.ok(
        indexes.some(
            ([key, options]) =>
                key["tournament.id"] === 1 &&
                key.playoff_id === 1 &&
                key.leg === 1 &&
                options.unique === true &&
                options.partialFilterExpression.type === "playoff"
        )
    )
})

test("index verifier accepts present definition and rejects missing or mismatched", async () => {
    const connectionWith = (indexes) => ({
        collection: () => ({
            listIndexes: () => ({ toArray: async () => indexes }),
        }),
    })
    const expected = {
        name: INDEX_NAME,
        key: INDEX_KEY,
        unique: true,
        partialFilterExpression: PARTIAL_FILTER,
    }

    await assert.doesNotReject(
        verifyPlayoffLegIndex(connectionWith([{ name: "_id_" }, expected]))
    )
    await assert.rejects(
        verifyPlayoffLegIndex(connectionWith([{ name: "_id_" }])),
        /missing or has a different definition/
    )
    await assert.rejects(
        verifyPlayoffLegIndex(connectionWith([{ ...expected, unique: false }])),
        /missing or has a different definition/
    )
})

test("readiness gate caches success and sanitizes missing or mismatched index errors", async () => {
    let now = 100
    let verificationCalls = 0
    const readyGate = createPlayoffLegIndexReadinessGate({
        verify: async () => {
            verificationCalls += 1
        },
        cacheMs: 50,
        now: () => now,
    })

    await readyGate()
    await readyGate()
    assert.equal(verificationCalls, 1)
    now = 151
    await readyGate()
    assert.equal(verificationCalls, 2)

    for (const reason of ["missing", "mismatched"]) {
        const blockedGate = createPlayoffLegIndexReadinessGate({
            verify: async () => {
                throw new Error(`${reason} internal index details`)
            },
        })
        await assert.rejects(blockedGate(), (error) => {
            assert.equal(error.status, 503)
            assert.equal(error.code, "PLAYOFF_INDEX_NOT_READY")
            assert.equal(
                error.message,
                "Las escrituras de playoffs no están disponibles temporalmente"
            )
            assert.equal(error.message.includes(reason), false)
            return true
        })
    }
})

test("production connection no longer globally blocks startup on index preflight", () => {
    const databaseSource = fs.readFileSync(
        path.join(ROOT, "database.js"),
        "utf8"
    )
    const connectBody = databaseSource.slice(
        databaseSource.indexOf("const connectMongo"),
        databaseSource.indexOf("const disconnectMongo")
    )
    assert.equal(connectBody.includes("verifyPlayoffLegIndex"), false)
    assert.equal(databaseSource.includes("verifyPlayoffLegIndex"), true)
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
        "PLAYOFF_INDEX_NOT_READY",
        "fail-closed",
    ]) {
        assert.ok(openapi.includes(expected), expected)
    }
})

"use strict"
process.env.LOG_LEVEL = "silent"
const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")
const path = require("node:path")
const test = require("node:test")
const applyRatingDiff = require("../dao/applyRatingDiff")
const findRatingMatches = require("../dao/findRatingMatches")
const findRatingSourceStats = require("../dao/findRatingSourceStats")
const findStoredRatingDocuments = require("../dao/findStoredRatingDocuments")
const { getRatingSyncSettings } = require("../config/ratingSync")
const {
    defaultDependencies,
    syncRatingsAfterWrite,
    triggerRatingSync,
} = require("../service/syncRatingsAfterWrite")

const ROOT = path.join(__dirname, "..")

test("el cableado real lee directo de la base y no por el caché de retrieveRatingMatches", () => {
    assert.equal(defaultDependencies.loadMatches, findRatingMatches)
    assert.equal(defaultDependencies.loadSourceStats, findRatingSourceStats)
    assert.equal(defaultDependencies.findStored, findStoredRatingDocuments)
    assert.equal(defaultDependencies.applyDiff, applyRatingDiff)
    assert.equal(defaultDependencies.getSettings, getRatingSyncSettings)
    // Ninguna dependencia del sync sale de service/retrieveRatingMatches.
    const retrieveRatingMatches = require("../service/retrieveRatingMatches")
    for (const dependency of Object.values(defaultDependencies)) {
        assert.notEqual(dependency, retrieveRatingMatches)
    }
    assert.equal(typeof syncRatingsAfterWrite, "function")
})

test("applyDiff real solo acepta player-ratings y rating-events", async () => {
    const calls = []
    const model = (name) => ({
        collection: { name },
        bulkWrite: async () => calls.push(name),
    })
    const emptySection = { insert: [], update: [], delete: [] }
    const diff = {
        events: {
            ...emptySection,
            insert: [
                {
                    ratingVersion: "v1",
                    matchId: "0".repeat(23) + "1",
                },
            ],
        },
        players: {
            ...emptySection,
            update: [{ ratingVersion: "v1", id: "a" }],
        },
    }
    await defaultDependencies.applyDiff(diff, {
        playersModel: model("player-ratings"),
        eventsModel: model("rating-events"),
    })
    assert.deepEqual(calls, ["rating-events", "player-ratings"])
    await assert.rejects(
        defaultDependencies.applyDiff(diff, {
            playersModel: model("face-to-face"),
            eventsModel: model("rating-events"),
        }),
        /solo puede escribir/
    )
})

test("isDatabaseReady es falso sin conexión y el hook real no toca la base", async () => {
    assert.equal(defaultDependencies.isDatabaseReady(), false)
    const outcome = await syncRatingsAfterWrite({
        trigger: "match_result_saved",
    })
    assert.deepEqual(outcome, {
        result: "skipped",
        reason: "database_not_connected",
    })
})

test("triggerRatingSync traga errores síncronos y asíncronos y pasa el trigger", async () => {
    const seen = []
    await triggerRatingSync(async (arg) => seen.push(arg), "match_result_saved")
    assert.deepEqual(seen, [{ trigger: "match_result_saved" }])
    await triggerRatingSync(() => {
        throw new Error("síncrono")
    }, "x")
    await triggerRatingSync(() => Promise.reject(new Error("asíncrono")), "x")
})

// --- Procesos hijo: qué se carga y qué no ----------------------------------
const runChild = (code) =>
    spawnSync(process.execPath, ["-e", code], {
        cwd: ROOT,
        env: { ...process.env },
        encoding: "utf8",
    })

const LOADED_HELPER = `
    const loaded = Object.keys(require.cache).map((key) => key.replace(/\\\\/g, "/"))
    const has = (suffix) => loaded.some((key) => key.endsWith(suffix))
`

test("el pipeline puro (ratingsSync y ratingsStore) no carga mongoose, modelos ni database.js", () => {
    const result = runChild(`
        require("./service/ratingsSync")
        require("./service/ratingsStore")
        ${LOADED_HELPER}
        process.stdout.write(JSON.stringify({
            mongoose: loaded.some((key) => /node_modules\\/mongoose\\//.test(key)),
            models: loaded.some((key) => key.includes("/dao/models/")),
            dao: loaded.some((key) => key.includes("/dao/")),
            database: has("/database.js"),
        }))
    `)
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), {
        mongoose: false,
        models: false,
        dao: false,
        database: false,
    })
})

test("require('./dao') y require('./service') siguen sin cargar el camino de escritura", () => {
    const result = runChild(`
        require("./dao")
        require("./service")
        ${LOADED_HELPER}
        process.stdout.write(JSON.stringify({
            syncWiring: has("service/syncRatingsAfterWrite/index.js"),
            applyDiff: has("dao/applyRatingDiff/index.js"),
            stored: has("dao/findStoredRatingDocuments/index.js"),
            sync: has("service/ratingsSync/index.js"),
            pipeline: has("service/ratingsStore/pipeline.js"),
        }))
    `)
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), {
        syncWiring: false,
        applyDiff: false,
        stored: false,
        sync: false,
        pipeline: false,
    })
})

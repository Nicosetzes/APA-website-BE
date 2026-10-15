"use strict"
const assert = require("node:assert/strict")
const test = require("node:test")
const {
    computeRatingsState,
    keyOfEvent,
    keyOfPlayer,
} = require("../service/ratingsStore")
const {
    MAX_EXTRA_PASSES,
    createRatingsSyncRunner,
} = require("../service/ratingsSync/runRatingsSync")
const { SOURCE_STATS, history } = require("./fixtures/ratingsStore")

const NOW = new Date("2026-02-01T00:00:00Z")
const clone = (value) => structuredClone(value)
const computedFor = (sourceStats = SOURCE_STATS) =>
    computeRatingsState(history(), { now: NOW, sourceStats }).computed

// Entorno falso: registra el orden de las llamadas y simula el store.
const harness = ({
    store = { events: [], players: [] },
    settings = {},
    statsSequence,
    clock,
    applyResult,
} = {}) => {
    const calls = []
    const state = { store: clone(store), applied: [] }
    const config = { timeoutMs: 5000, maxChanges: 300, ...settings }
    let statsCalls = 0
    const applyToStore = (diff) => {
        for (const [name, keyOf] of [
            ["events", keyOfEvent],
            ["players", keyOfPlayer],
        ]) {
            const map = new Map(state.store[name].map((d) => [keyOf(d), d]))
            for (const doc of diff[name].delete) map.delete(keyOf(doc))
            for (const doc of [...diff[name].insert, ...diff[name].update]) {
                map.set(keyOf(doc), clone(doc))
            }
            state.store[name] = [...map.values()]
        }
    }
    const deps = {
        loadSourceStats: async () => {
            calls.push("loadSourceStats")
            const stats = statsSequence
                ? statsSequence(statsCalls)
                : SOURCE_STATS
            statsCalls += 1
            return clone(stats)
        },
        loadMatches: async () => {
            calls.push("loadMatches")
            return history()
        },
        findStored: async () => {
            calls.push("findStored")
            return clone(state.store)
        },
        applyDiff: async (diff, options) => {
            calls.push("applyDiff")
            state.applied.push({ diff, options })
            if (applyResult) return applyResult(diff, options)
            applyToStore(diff)
            return { batches: 1 }
        },
        getSettings: () => config,
        now: () => NOW,
        ...(clock ? { clock } : {}),
    }
    return { deps, calls, state, run: createRatingsSyncRunner(deps) }
}

test("noop cuando lo guardado ya coincide: no llama a applyDiff", async () => {
    const { run, calls } = harness({ store: computedFor() })
    const outcome = await run()
    assert.equal(outcome.result, "noop")
    assert.equal(outcome.reason, null)
    assert.equal(outcome.passes, 1)
    assert.equal(outcome.ratedMatches, 7)
    assert.deepEqual(outcome.changes, {
        events: { insert: 0, update: 0, delete: 0 },
        players: { insert: 0, update: 0, delete: 0 },
    })
    assert.ok(!calls.includes("applyDiff"))
})

test("applied: aplica el diff, cuenta por colección y el siguiente sync es noop", async () => {
    const { run, state } = harness()
    const outcome = await run()
    assert.equal(outcome.result, "applied")
    assert.deepEqual(outcome.changes, {
        events: { insert: 6, update: 0, delete: 0 },
        players: { insert: 3, update: 0, delete: 0 },
    })
    assert.equal(state.applied.length, 1)
    assert.equal(typeof state.applied[0].options.shouldContinue, "function")
    assert.equal((await run()).result, "noop")
})

test("el orden de lecturas es stats, historial, guardado, apply y stats otra vez", async () => {
    const { run, calls } = harness()
    await run()
    assert.deepEqual(calls, [
        "loadSourceStats",
        "loadMatches",
        "findStored",
        "applyDiff",
        "loadSourceStats",
    ])
})

test("large_diff: con total > maxChanges no escribe; con total === maxChanges aplica", async () => {
    const skipped = harness({ settings: { maxChanges: 8 } })
    const outcome = await skipped.run()
    assert.equal(outcome.result, "skipped")
    assert.equal(outcome.reason, "large_diff")
    assert.deepEqual(outcome.changes, {
        events: { insert: 6, update: 0, delete: 0 },
        players: { insert: 3, update: 0, delete: 0 },
    })
    assert.ok(!skipped.calls.includes("applyDiff"))
    assert.deepEqual(skipped.state.store, { events: [], players: [] })

    const exact = harness({ settings: { maxChanges: 9 } })
    assert.equal((await exact.run()).result, "applied")
})

test("primera carga (store vacío) y cambio de fingerprint dan large_diff con umbral chico", async () => {
    const first = harness({ settings: { maxChanges: 3 } })
    assert.equal((await first.run()).reason, "large_diff")

    const store = clone(computedFor())
    for (const doc of [...store.events, ...store.players]) {
        doc.fingerprint = "c".repeat(64)
    }
    const changed = harness({ store, settings: { maxChanges: 5 } })
    const outcome = await changed.run()
    assert.equal(outcome.result, "skipped")
    assert.equal(outcome.reason, "large_diff")
    assert.equal(outcome.changes.events.update, 6)
    assert.equal(outcome.changes.players.update, 3)
    assert.ok(!changed.calls.includes("applyDiff"))
})

test("si el origen cambia durante la corrida hace una pasada extra y converge", async () => {
    const changed = { ratedMatches: 8, maxUpdatedAt: new Date("2026-01-10Z") }
    // Pasada 1 lee SOURCE_STATS; la relectura post-apply ya ve `changed`.
    const { run, state } = harness({
        statsSequence: (index) => (index === 0 ? SOURCE_STATS : changed),
    })
    const outcome = await run()
    assert.equal(outcome.result, "applied")
    assert.equal(outcome.reason, null)
    assert.equal(outcome.passes, 2)
    assert.equal(state.applied.length, 2)
    // La segunda pasada solo reescribe el `source` de los jugadores.
    assert.deepEqual(outcome.changes, {
        events: { insert: 6, update: 0, delete: 0 },
        players: { insert: 3, update: 3, delete: 0 },
    })
    assert.ok(
        state.store.players.every((player) => player.source.ratedMatches === 8)
    )
})

test("si el origen cambia siempre corta tras las pasadas extra acotadas", async () => {
    const { run, state } = harness({
        statsSequence: (index) => ({
            ratedMatches: 7 + index,
            maxUpdatedAt: SOURCE_STATS.maxUpdatedAt,
        }),
    })
    const outcome = await run()
    assert.equal(outcome.result, "applied")
    assert.equal(outcome.reason, "source_changed")
    assert.equal(outcome.passes, 1 + MAX_EXTRA_PASSES)
    assert.equal(state.applied.length, 1 + MAX_EXTRA_PASSES)
})

test("reloj vencido antes de aplicar: timeout y applyDiff sin llamarse", async () => {
    let now = 0
    const { deps, calls, state } = harness({ clock: () => now })
    // Leer el historial "tarda" más que el presupuesto.
    const loadMatches = deps.loadMatches
    deps.loadMatches = async () => {
        now += 6000
        return loadMatches()
    }
    const outcome = await createRatingsSyncRunner(deps)()
    assert.equal(outcome.result, "timeout")
    assert.equal(outcome.reason, "deadline")
    assert.ok(!calls.includes("applyDiff"))
    assert.deepEqual(state.store, { events: [], players: [] })
})

test("applyDiff cancelado por shouldContinue da timeout", async () => {
    let now = 0
    const { run, state } = harness({
        clock: () => now,
        applyResult: (diff, { shouldContinue }) => {
            assert.equal(shouldContinue(), true)
            now += 6000
            assert.equal(shouldContinue(), false)
            return { batches: 0, cancelled: true }
        },
    })
    const outcome = await run()
    assert.equal(outcome.result, "timeout")
    assert.equal(outcome.reason, "deadline")
    assert.equal(state.applied.length, 1)
})

test("los errores de cualquier dependencia se propagan", async () => {
    for (const name of [
        "loadSourceStats",
        "loadMatches",
        "findStored",
        "applyDiff",
    ]) {
        const { deps } = harness()
        deps[name] = async () => {
            throw new Error(`falló ${name}`)
        }
        await assert.rejects(
            createRatingsSyncRunner(deps)(),
            new RegExp(`falló ${name}`),
            name
        )
    }
})

test("un error en la relectura de stats posterior al apply se propaga", async () => {
    const { deps } = harness({
        statsSequence: (index) => {
            if (index > 0) throw new Error("falló relectura")
            return SOURCE_STATS
        },
    })
    await assert.rejects(createRatingsSyncRunner(deps)(), /falló relectura/)
})

test("lee la configuración en cada corrida", async () => {
    const config = { timeoutMs: 5000, maxChanges: 3 }
    const { deps } = harness()
    deps.getSettings = () => config
    const run = createRatingsSyncRunner(deps)
    assert.equal((await run()).reason, "large_diff")
    config.maxChanges = 300
    assert.equal((await run()).result, "applied")
})

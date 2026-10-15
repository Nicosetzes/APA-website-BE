"use strict"
process.env.LOG_LEVEL = "silent"
const assert = require("node:assert/strict")
const test = require("node:test")
const { createRatingSyncHook } = require("../service/ratingsSync/hook")

const ZERO = {
    events: { insert: 0, update: 0, delete: 0 },
    players: { insert: 0, update: 0, delete: 0 },
}

const loggerFake = () => {
    const calls = []
    return {
        calls,
        info: (event, fields) => calls.push({ level: "info", event, fields }),
        warn: (event, fields) => calls.push({ level: "warn", event, fields }),
        error: (event, fields) => calls.push({ level: "error", event, fields }),
    }
}

// Reloj y temporizador falsos: el timer solo se dispara a mano.
const timers = () => {
    const state = { now: 1000, scheduled: [], cleared: [] }
    return {
        state,
        clock: () => state.now,
        setTimer: (callback, ms) => {
            const timer = { callback, ms, unref: () => {} }
            state.scheduled.push(timer)
            return timer
        },
        clearTimer: (timer) => state.cleared.push(timer),
    }
}

const build = ({
    outcome = {
        result: "applied",
        reason: null,
        changes: {
            events: { insert: 1, update: 0, delete: 0 },
            players: { insert: 0, update: 3, delete: 0 },
        },
        ratedMatches: 7,
        passes: 1,
    },
    settings = { enabled: true, timeoutMs: 5000, maxChanges: 300 },
    ready = true,
    request,
    logger = loggerFake(),
    getSettings,
} = {}) => {
    const clockTools = timers()
    const requested = []
    const coordinator = {
        request:
            request ??
            (async () => {
                requested.push(1)
                clockTools.state.now += 42
                return outcome
            }),
    }
    const hook = createRatingSyncHook({
        coordinator,
        getSettings: getSettings ?? (() => settings),
        logger,
        isDatabaseReady: () => ready,
        clock: clockTools.clock,
        setTimer: clockTools.setTimer,
        clearTimer: clockTools.clearTimer,
    })
    return { hook, logger, requested, timers: clockTools, settings }
}

test("applied/noop/skipped se loguean una sola vez con los campos exactos y nivel info", async () => {
    for (const result of ["applied", "noop", "skipped"]) {
        const { hook, logger } = build({
            outcome: {
                result,
                reason: result === "skipped" ? "large_diff" : null,
                changes: ZERO,
                ratedMatches: 7,
                passes: 1,
            },
        })
        const outcome = await hook({ trigger: "match_result_saved" })
        assert.equal(outcome.result, result)
        assert.equal(logger.calls.length, 1)
        const [call] = logger.calls
        assert.equal(call.level, "info")
        assert.equal(call.event, "rating_sync")
        assert.deepEqual(Object.keys(call.fields).sort(), [
            "changes",
            "durationMs",
            "ratedMatches",
            "reason",
            "result",
            "trigger",
        ])
        assert.equal(call.fields.trigger, "match_result_saved")
        assert.equal(call.fields.durationMs, 42)
        assert.equal(call.fields.ratedMatches, 7)
    }
})

test("con más de una pasada el log agrega passes", async () => {
    const { hook, logger } = build({
        outcome: {
            result: "applied",
            reason: null,
            changes: ZERO,
            ratedMatches: 7,
            passes: 2,
        },
    })
    await hook({ trigger: "match_result_removed" })
    assert.equal(logger.calls[0].fields.passes, 2)
})

test("disabled: loguea, no invoca al coordinador y el interruptor se lee en cada llamada", async () => {
    const settings = { enabled: false, timeoutMs: 5000, maxChanges: 300 }
    const { hook, logger, requested } = build({ settings })
    const outcome = await hook({ trigger: "match_result_saved" })
    assert.equal(outcome.result, "disabled")
    assert.equal(requested.length, 0)
    assert.equal(logger.calls.length, 1)
    assert.equal(logger.calls[0].fields.result, "disabled")
    assert.equal(logger.calls[0].fields.reason, "env_off")
    settings.enabled = true
    assert.equal(
        (await hook({ trigger: "match_result_saved" })).result,
        "applied"
    )
    assert.equal(requested.length, 1)
})

test("base no lista: skipped sin log ni coordinador", async () => {
    const { hook, logger, requested } = build({ ready: false })
    const outcome = await hook({ trigger: "match_result_saved" })
    assert.deepEqual(outcome, {
        result: "skipped",
        reason: "database_not_connected",
    })
    assert.equal(logger.calls.length, 0)
    assert.equal(requested.length, 0)
})

test("timeout: el coordinador nunca resuelve, el timer vence, warn y se limpia el timer", async () => {
    const {
        hook,
        logger,
        timers: clockTools,
    } = build({
        request: () => new Promise(() => {}),
    })
    const pending = hook({ trigger: "match_result_saved" })
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(clockTools.state.scheduled.length, 1)
    assert.equal(clockTools.state.scheduled[0].ms, 5000)
    clockTools.state.now += 5000
    clockTools.state.scheduled[0].callback()
    const outcome = await pending
    assert.equal(outcome.result, "timeout")
    assert.equal(outcome.reason, "budget_exceeded")
    assert.equal(logger.calls.length, 1)
    assert.equal(logger.calls[0].level, "warn")
    assert.equal(logger.calls[0].fields.durationMs, 5000)
    assert.deepEqual(clockTools.state.cleared, clockTools.state.scheduled)
})

test("un resultado error del coordinador loguea warn y no lanza", async () => {
    const { hook, logger } = build({
        outcome: {
            result: "error",
            reason: "MongoServerError",
            changes: ZERO,
            ratedMatches: null,
            passes: 0,
        },
    })
    assert.equal((await hook({ trigger: "x" })).result, "error")
    assert.equal(logger.calls[0].level, "warn")
    assert.equal(logger.calls[0].fields.reason, "MongoServerError")
})

test("request que rechaza o lanza síncrono no hace lanzar al hook", async () => {
    for (const request of [
        () => Promise.reject(new TypeError("boom")),
        () => {
            throw new RangeError("boom")
        },
    ]) {
        const { hook, logger } = build({ request })
        const outcome = await hook({ trigger: "match_result_saved" })
        assert.equal(outcome.result, "error")
        assert.ok(["TypeError", "RangeError"].includes(outcome.reason))
        assert.equal(logger.calls[0].level, "warn")
    }
})

test("getSettings que lanza no hace lanzar al hook", async () => {
    const { hook } = build({
        getSettings: () => {
            throw new Error("env roto")
        },
    })
    assert.equal((await hook({ trigger: "x" })).result, "error")
})

test("un logger que lanza no hace lanzar al hook", async () => {
    const logger = {
        info: () => {
            throw new Error("logger roto")
        },
        warn: () => {
            throw new Error("logger roto")
        },
    }
    const { hook } = build({ logger })
    assert.equal((await hook({ trigger: "x" })).result, "applied")
})

test("el log no trae ids ni mensajes: solo contadores y etiquetas", async () => {
    const { hook, logger } = build({
        outcome: {
            result: "error",
            reason: "MongoServerError",
            changes: ZERO,
            ratedMatches: null,
            passes: 0,
        },
    })
    await hook({ trigger: "match_result_saved" })
    const { fields } = logger.calls[0]
    for (const key of Object.keys(fields)) {
        assert.ok(
            [
                "result",
                "reason",
                "changes",
                "ratedMatches",
                "durationMs",
                "trigger",
                "passes",
            ].includes(key),
            key
        )
    }
    assert.ok(!("message" in fields))
})

test("sin argumentos el trigger queda en null", async () => {
    const { hook, logger } = build()
    await hook()
    assert.equal(logger.calls[0].fields.trigger, null)
})

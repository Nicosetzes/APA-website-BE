"use strict"
const assert = require("node:assert/strict")
const test = require("node:test")
const {
    createRatingSyncCoordinator,
} = require("../service/ratingsSync/coordinator")

// `run` controlable: cada corrida queda pendiente hasta que el test la resuelve.
const controllable = () => {
    const runs = []
    let running = 0
    let maxRunning = 0
    const run = () => {
        running += 1
        maxRunning = Math.max(maxRunning, running)
        const index = runs.length
        return new Promise((resolve, reject) => {
            runs.push({
                finish: (value = { result: "applied", run: index }) => {
                    running -= 1
                    resolve(value)
                },
                fail: (error) => {
                    running -= 1
                    reject(error)
                },
            })
        })
    }
    return { run, runs, maxRunning: () => maxRunning }
}
// Deja correr los microtasks pendientes.
const flush = () => new Promise((resolve) => setImmediate(resolve))

test("un pedido en reposo dispara una corrida", async () => {
    const { run, runs } = controllable()
    const { request } = createRatingSyncCoordinator({ run })
    const pending = request()
    assert.equal(runs.length, 1)
    runs[0].finish()
    assert.equal((await pending).result, "applied")
})

test("5 pedidos con una corrida activa: 2 corridas en total y nunca simultáneas", async () => {
    const harness = controllable()
    const { request } = createRatingSyncCoordinator({ run: harness.run })
    const first = request()
    const followers = [request(), request(), request(), request()]
    assert.equal(harness.runs.length, 1)
    // Los 4 pedidos del mismo follow-up comparten la MISMA promesa.
    assert.ok(followers.every((promise) => promise === followers[0]))
    harness.runs[0].finish({ result: "applied", run: 0 })
    assert.equal((await first).run, 0)
    await flush()
    assert.equal(harness.runs.length, 2)
    harness.runs[1].finish({ result: "noop", run: 1 })
    const results = await Promise.all(followers)
    assert.ok(results.every((outcome) => outcome.run === 1))
    assert.equal(harness.maxRunning(), 1)
    assert.equal(harness.runs.length, 2)
})

test("un pedido durante el follow-up dispara una tercera corrida", async () => {
    const harness = controllable()
    const { request } = createRatingSyncCoordinator({ run: harness.run })
    const first = request()
    const second = request()
    harness.runs[0].finish()
    await first
    await flush()
    assert.equal(harness.runs.length, 2)
    const third = request()
    assert.notEqual(third, second)
    harness.runs[1].finish()
    await second
    await flush()
    assert.equal(harness.runs.length, 3)
    harness.runs[2].finish()
    await third
    assert.equal(harness.maxRunning(), 1)
})

test("run que lanza: resultado error con el nombre y sin el mensaje; el siguiente pedido corre", async () => {
    const harness = controllable()
    const { request } = createRatingSyncCoordinator({ run: harness.run })
    const failing = request()
    // URI armada por partes para que el escáner de secretos no la tome por real.
    const error = new Error(["mongodb", "//usuario:secreto@host"].join(":"))
    error.name = "MongoServerSelectionError"
    harness.runs[0].fail(error)
    const outcome = await failing
    assert.equal(outcome.result, "error")
    assert.equal(outcome.reason, "MongoServerSelectionError")
    assert.ok(!JSON.stringify(outcome).includes("secreto"))
    assert.deepEqual(outcome.changes, {
        events: { insert: 0, update: 0, delete: 0 },
        players: { insert: 0, update: 0, delete: 0 },
    })
    await flush()
    const next = request()
    assert.equal(harness.runs.length, 2)
    harness.runs[1].finish()
    assert.equal((await next).result, "applied")
})

test("request nunca rechaza, ni con un run que lanza de forma síncrona", async () => {
    const { request } = createRatingSyncCoordinator({
        run: () => {
            throw new TypeError("boom")
        },
    })
    const outcome = await request()
    assert.equal(outcome.result, "error")
    assert.equal(outcome.reason, "TypeError")
    const again = await request()
    assert.equal(again.result, "error")
})

test("tras quedar ocioso, un pedido nuevo corre de inmediato", async () => {
    const harness = controllable()
    const { request } = createRatingSyncCoordinator({ run: harness.run })
    const first = request()
    harness.runs[0].finish()
    await first
    await flush()
    const second = request()
    assert.equal(harness.runs.length, 2)
    harness.runs[1].finish()
    await second
})

test("una corrida que nunca termina vence por su tope y libera la cola", async () => {
    let calls = 0
    const coordinator = createRatingSyncCoordinator({
        run: () => {
            calls += 1
            // La primera se cuelga para siempre; la segunda termina bien.
            return calls === 1
                ? new Promise(() => {})
                : Promise.resolve({ result: "applied" })
        },
        maxRunMs: 20,
    })

    const first = await coordinator.request()
    assert.equal(first.result, "timeout")
    assert.equal(first.reason, "run_deadline")

    // Ya no queda nada activo: el siguiente pedido corre enseguida.
    assert.deepEqual(await coordinator.request(), { result: "applied" })
    assert.equal(calls, 2)
})

test("el tope de una corrida no afecta a las que terminan a tiempo", async () => {
    const coordinator = createRatingSyncCoordinator({
        run: async () => ({ result: "noop" }),
        maxRunMs: 1000,
    })

    assert.deepEqual(await coordinator.request(), { result: "noop" })
})

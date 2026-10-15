"use strict"

const assert = require("node:assert/strict")
const { EventEmitter } = require("node:events")
const test = require("node:test")

const { parseTtl } = require("../config/cache")
const matchesModel = require("../dao/models/matches")
const retrieveRatingMatches = require("../service/retrieveRatingMatches")
const {
    invalidateRatingCacheOnWrite,
} = require("../middleware/invalidateRatingCache")
const { createSingleFlightCache } = require("../utils/singleFlightCache")

// Reloj y lectura controlables.
const setup = (...args) => {
    const ttlMs = args.length ? args[0] : 1000
    let time = 0
    let reads = 0
    const cache = createSingleFlightCache({
        read: async () => {
            reads += 1
            return { read: reads }
        },
        ttlMs,
        now: () => time,
    })
    return {
        cache,
        reads: () => reads,
        advance: (ms) => {
            time += ms
        },
    }
}

test("singleFlightCache guarda el valor hasta que vence el TTL", async () => {
    const { cache, reads, advance } = setup(1000)

    assert.deepEqual(await cache.get(), { read: 1 })
    assert.deepEqual(await cache.get(), { read: 1 })
    advance(999)
    assert.deepEqual(await cache.get(), { read: 1 })
    assert.equal(reads(), 1)

    advance(1)
    assert.deepEqual(await cache.get(), { read: 2 })
    assert.equal(reads(), 2)
})

test("singleFlightCache comparte una sola lectura entre pedidos simultáneos", async () => {
    const { cache, reads } = setup()

    const results = await Promise.all([cache.get(), cache.get(), cache.get()])

    assert.equal(reads(), 1)
    assert.ok(results.every((value) => value === results[0]))
})

test("singleFlightCache invalidate fuerza una lectura nueva", async () => {
    const { cache, reads } = setup()

    await cache.get()
    cache.invalidate()
    assert.deepEqual(await cache.get(), { read: 2 })
    assert.equal(reads(), 2)
})

test("singleFlightCache no guarda una lectura que empezó antes de una invalidación", async () => {
    let release
    let reads = 0
    const cache = createSingleFlightCache({
        read: () => {
            reads += 1
            const current = reads
            return new Promise((resolve) => {
                release = () => resolve({ read: current })
            })
        },
        ttlMs: 1000,
        now: () => 0,
    })

    const slow = cache.get()
    await Promise.resolve()
    // Entra una escritura mientras se estaba leyendo.
    cache.invalidate()
    release()
    // Quien ya esperaba recibe lo que se leyó...
    assert.deepEqual(await slow, { read: 1 })

    // ...pero el valor no quedó guardado: el siguiente pedido lee de nuevo.
    const next = cache.get()
    await Promise.resolve()
    release()
    assert.deepEqual(await next, { read: 2 })
    assert.equal(reads, 2)
})

test("singleFlightCache no guarda los errores y reintenta", async () => {
    let calls = 0
    const cache = createSingleFlightCache({
        read: async () => {
            calls += 1
            if (calls === 1) throw new Error("falló")
            return "ok"
        },
        ttlMs: 1000,
        now: () => 0,
    })

    await assert.rejects(cache.get(), /falló/)
    assert.equal(await cache.get(), "ok")
    assert.equal(await cache.get(), "ok")
    assert.equal(calls, 2)
})

test("singleFlightCache con TTL 0 o inválido no cachea", async () => {
    for (const ttlMs of [0, -1, undefined, Number.NaN]) {
        const { cache, reads } = setup(ttlMs)
        await cache.get()
        await cache.get()
        assert.equal(reads(), 2)
    }
})

test("parseTtl usa el valor por defecto si falta o es inválido", () => {
    assert.equal(parseTtl(undefined), 30000)
    assert.equal(parseTtl(""), 30000)
    assert.equal(parseTtl("abc"), 30000)
    assert.equal(parseTtl("-5"), 30000)
    assert.equal(parseTtl("0"), 0)
    assert.equal(parseTtl("5000"), 5000)
})

test("retrieveRatingMatches lee la base una vez dentro del TTL y de nuevo tras invalidar", async (t) => {
    retrieveRatingMatches.invalidate()
    t.after(retrieveRatingMatches.invalidate)
    let finds = 0
    t.mock.method(matchesModel, "find", () => {
        finds += 1
        return { lean: async () => [{ _id: "a" }, { _id: "b" }] }
    })

    const first = await retrieveRatingMatches()
    const second = await retrieveRatingMatches()
    assert.equal(finds, 1)
    assert.equal(second, first)
    // El arreglo compartido está congelado: nadie puede modificarlo.
    assert.equal(Object.isFrozen(first), true)

    retrieveRatingMatches.invalidate()
    await retrieveRatingMatches()
    assert.equal(finds, 2)
})

const run = (method) => {
    const res = new EventEmitter()
    let invalidations = 0
    let nexts = 0
    invalidateRatingCacheOnWrite({
        invalidate: () => {
            invalidations += 1
        },
    })({ method }, res, () => {
        nexts += 1
    })
    return {
        res,
        invalidations: () => invalidations,
        nexts: () => nexts,
    }
}

test("el middleware invalida al terminar una escritura, una sola vez", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const { res, invalidations, nexts } = run(method)

        assert.equal(nexts(), 1)
        // Todavía no: la escritura sigue en curso.
        assert.equal(invalidations(), 0)

        res.emit("finish")
        res.emit("close")
        assert.equal(invalidations(), 1)
    }
})

test("el middleware también invalida si la conexión se corta", () => {
    const { res, invalidations } = run("PUT")

    res.emit("close")
    assert.equal(invalidations(), 1)
})

test("el middleware no toca las lecturas", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
        const { res, invalidations, nexts } = run(method)

        res.emit("finish")
        res.emit("close")
        assert.equal(nexts(), 1)
        assert.equal(invalidations(), 0)
    }
})

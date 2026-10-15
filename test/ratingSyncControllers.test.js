"use strict"
process.env.LOG_LEVEL = "silent"
const assert = require("node:assert/strict")
const test = require("node:test")
const {
    createPutMatchByTournamentId,
} = require("../controller/putMatchByTournamentId")
const {
    createPutRemoveMatchByTournamentId,
} = require("../controller/putRemoveMatchByTournamentId")
const { createRatingSyncHook } = require("../service/ratingsSync")
const ratingSync = require("../service/syncRatingsAfterWrite")

const SERIES_TOURNAMENT = { format: "playoff", playoffMode: "two_legged" }
const SERIES_MATCH = { type: "playoff", leg: 1 }
const INVALID_TOURNAMENT = { format: "playoff", playoffMode: "otro" }

const playerP1 = { id: "player-1", name: "Player 1" }
const playerP2 = { id: "player-2", name: "Player 2" }
const teamP1 = { id: "team-1", name: "Team 1" }
const teamP2 = { id: "team-2", name: "Team 2" }

const createResponse = (order = []) => ({
    statusCode: null,
    body: null,
    status(code) {
        this.statusCode = code
        return this
    },
    send(body) {
        order.push("respond")
        this.body = body
        return this
    },
    json(body) {
        order.push("respond")
        this.body = body
        return this
    },
})

const saveBody = {
    playerP1,
    teamP1,
    scoreP1: 2,
    playerP2,
    teamP2,
    scoreP2: 1,
    valid: true,
}

const SAVED_MATCH = {
    _id: "match",
    type: "regular",
    tournament: { id: "tournament", name: "Tournament" },
}
const SERIES_RESULT = { series: "ok" }
const CLEANED_MATCH = { _id: "match", played: false }

// Cada caso describe un camino de escritura: cómo armar el controller, el
// request, qué dependencia falla y cuál es el disparador esperado.
const CASES = [
    {
        name: "putMatch legado",
        trigger: "match_result_saved",
        expectedBody: SAVED_MATCH,
        create: (deps) => createPutMatchByTournamentId(deps),
        request: (overrides = {}) => ({
            params: { tournament: "tournament", match: "match" },
            body: saveBody,
            ...overrides,
        }),
        base: (order) => ({
            modifyTournamentStartedAt: async () => null,
            modifyMatchResult: async () => SAVED_MATCH,
            withTransaction: async (work) => {
                const result = await work({ id: "session" })
                order.push("commit")
                return result
            },
        }),
        failing: () => ({
            modifyMatchResult: async () => {
                throw new Error("falló la escritura")
            },
        }),
        notFound: () => ({ modifyMatchResult: async () => null }),
        invalidRequest: () => ({
            tournament: INVALID_TOURNAMENT,
            match: SERIES_MATCH,
        }),
    },
    {
        name: "putMatch serie",
        trigger: "match_result_saved",
        expectedBody: SERIES_RESULT,
        create: (deps) => createPutMatchByTournamentId(deps),
        request: (overrides = {}) => ({
            params: { tournament: "tournament", match: "match" },
            body: saveBody,
            tournament: SERIES_TOURNAMENT,
            match: SERIES_MATCH,
            ...overrides,
        }),
        base: (order) => ({
            processPlayoffSeriesResult: async () => {
                order.push("commit")
                return SERIES_RESULT
            },
        }),
        failing: () => ({
            processPlayoffSeriesResult: async () => {
                throw new Error("falló la serie")
            },
        }),
        notFound: null,
        invalidRequest: () => ({
            tournament: INVALID_TOURNAMENT,
            match: SERIES_MATCH,
        }),
    },
    {
        name: "putRemove legado",
        trigger: "match_result_removed",
        expectedBody: CLEANED_MATCH,
        create: (deps) => createPutRemoveMatchByTournamentId(deps),
        request: (overrides = {}) => ({
            params: { tournament: "tournament", match: "match" },
            body: {},
            ...overrides,
        }),
        base: (order) => ({
            modifyMatchResultToRemoveIt: async () => CLEANED_MATCH,
            modifyTournamentStartedAtAfterRemoval: async () => null,
            withTransaction: async (work) => {
                const result = await work({ id: "session" })
                order.push("commit")
                return result
            },
        }),
        failing: () => ({
            modifyMatchResultToRemoveIt: async () => {
                throw new Error("falló el borrado")
            },
        }),
        notFound: () => ({ modifyMatchResultToRemoveIt: async () => null }),
        invalidRequest: () => ({
            tournament: INVALID_TOURNAMENT,
            match: SERIES_MATCH,
        }),
    },
    {
        name: "putRemove serie",
        trigger: "match_result_removed",
        expectedBody: CLEANED_MATCH,
        create: (deps) => createPutRemoveMatchByTournamentId(deps),
        request: (overrides = {}) => ({
            params: { tournament: "tournament", match: "match" },
            body: { expectedSeriesRevision: 3 },
            tournament: SERIES_TOURNAMENT,
            match: SERIES_MATCH,
            ...overrides,
        }),
        base: (order) => ({
            removePlayoffSeriesResult: async () => {
                order.push("commit")
                return CLEANED_MATCH
            },
        }),
        failing: () => ({
            removePlayoffSeriesResult: async () => {
                throw new Error("falló el borrado de la serie")
            },
        }),
        notFound: () => ({ removePlayoffSeriesResult: async () => null }),
        invalidRequest: () => ({
            tournament: INVALID_TOURNAMENT,
            match: SERIES_MATCH,
        }),
    },
]

// Hook espía que registra el orden y los argumentos.
const spyHook = (order, behavior = async () => ({ result: "applied" })) => {
    const calls = []
    const hook = async (arg) => {
        calls.push(arg)
        order.push("sync")
        return behavior(arg)
    }
    return { hook, calls }
}

for (const spec of CASES) {
    test(`${spec.name}: el hook se llama UNA vez con el trigger correcto, después del commit y antes de responder`, async () => {
        const order = []
        const { hook, calls } = spyHook(order)
        const controller = spec.create({
            ...spec.base(order),
            syncRatings: hook,
        })
        const res = createResponse(order)
        await controller(spec.request(), res)
        assert.deepEqual(calls, [{ trigger: spec.trigger }])
        assert.deepEqual(order, ["commit", "sync", "respond"])
        assert.equal(res.statusCode, 200)
        assert.deepEqual(res.body, spec.expectedBody)
    })

    test(`${spec.name}: no se llama cuando la escritura falla`, async () => {
        const order = []
        const { hook, calls } = spyHook(order)
        const controller = spec.create({
            ...spec.base(order),
            ...spec.failing(),
            syncRatings: hook,
        })
        const res = createResponse(order)
        await assert.rejects(controller(spec.request(), res), /falló/)
        assert.equal(calls.length, 0)
        assert.equal(res.statusCode, null)
    })

    test(`${spec.name}: no se llama con una configuración de serie inválida (409)`, async () => {
        const order = []
        const { hook, calls } = spyHook(order)
        const controller = spec.create({
            ...spec.base(order),
            syncRatings: hook,
        })
        const res = createResponse(order)
        await assert.rejects(
            controller(spec.request(spec.invalidRequest()), res),
            (error) => error.status === 409 || error.statusCode === 409
        )
        assert.equal(calls.length, 0)
        assert.equal(res.statusCode, null)
    })

    if (spec.notFound) {
        test(`${spec.name}: no se llama cuando el partido no existe (404)`, async () => {
            const order = []
            const { hook, calls } = spyHook(order)
            const controller = spec.create({
                ...spec.base(order),
                ...spec.notFound(),
                syncRatings: hook,
            })
            const res = createResponse(order)
            await assert.rejects(
                controller(spec.request(), res),
                (error) => error.status === 404 || error.statusCode === 404
            )
            assert.equal(calls.length, 0)
            assert.equal(res.statusCode, null)
        })
    }

    test(`${spec.name}: la respuesta es idéntica si el hook lanza, rechaza o anda`, async () => {
        const responses = []
        for (const behavior of [
            async () => ({ result: "applied" }),
            () => {
                throw new Error("hook roto")
            },
            () => Promise.reject(new Error("hook rechazado")),
        ]) {
            const order = []
            const { hook, calls } = spyHook(order, behavior)
            const controller = spec.create({
                ...spec.base(order),
                syncRatings: hook,
            })
            const res = createResponse(order)
            await controller(spec.request(), res)
            assert.equal(calls.length, 1)
            responses.push({ status: res.statusCode, body: res.body })
        }
        assert.deepEqual(responses[1], responses[0])
        assert.deepEqual(responses[2], responses[0])
        assert.equal(responses[0].status, 200)
    })

    test(`${spec.name}: con el hook real y un coordinador que nunca resuelve, responde dentro del presupuesto`, async () => {
        const order = []
        const logs = []
        const hook = createRatingSyncHook({
            coordinator: { request: () => new Promise(() => {}) },
            getSettings: () => ({
                enabled: true,
                timeoutMs: 25,
                maxChanges: 300,
            }),
            logger: {
                info: (event, fields) => logs.push({ event, fields }),
                warn: (event, fields) => logs.push({ event, fields }),
            },
            isDatabaseReady: () => true,
        })
        const controller = spec.create({
            ...spec.base(order),
            syncRatings: hook,
        })
        const res = createResponse(order)
        const startedAt = Date.now()
        await controller(spec.request(), res)
        assert.ok(Date.now() - startedAt < 2000)
        assert.equal(res.statusCode, 200)
        assert.deepEqual(res.body, spec.expectedBody)
        assert.equal(logs.length, 1)
        assert.equal(logs[0].fields.result, "timeout")
        assert.equal(logs[0].fields.trigger, spec.trigger)
    })

    test(`${spec.name}: con el kill switch apagado responde igual y no invoca al coordinador`, async () => {
        const order = []
        let requested = 0
        const hook = createRatingSyncHook({
            coordinator: {
                request: async () => {
                    requested += 1
                    return { result: "applied" }
                },
            },
            getSettings: () => ({
                enabled: false,
                timeoutMs: 5000,
                maxChanges: 300,
            }),
            logger: { info: () => {}, warn: () => {} },
            isDatabaseReady: () => true,
        })
        const controller = spec.create({
            ...spec.base(order),
            syncRatings: hook,
        })
        const res = createResponse(order)
        await controller(spec.request(), res)
        assert.equal(requested, 0)
        assert.equal(res.statusCode, 200)
        assert.deepEqual(res.body, spec.expectedBody)
    })

    test(`${spec.name}: sin syncRatings inyectado usa el cableado real por defecto`, async () => {
        const order = []
        const { hook, calls } = spyHook(order)
        const original = ratingSync.syncRatingsAfterWrite
        ratingSync.syncRatingsAfterWrite = hook
        try {
            const controller = spec.create(spec.base(order))
            const res = createResponse(order)
            await controller(spec.request(), res)
            assert.deepEqual(calls, [{ trigger: spec.trigger }])
        } finally {
            ratingSync.syncRatingsAfterWrite = original
        }
    })

    test(`${spec.name}: sin syncRatings y sin conexión (tests viejos) no toca nada y responde`, async () => {
        const order = []
        const controller = spec.create(spec.base(order))
        const res = createResponse(order)
        await controller(spec.request(), res)
        assert.equal(res.statusCode, 200)
        assert.deepEqual(res.body, spec.expectedBody)
    })
}

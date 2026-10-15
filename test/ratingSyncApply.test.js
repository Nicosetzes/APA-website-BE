"use strict"
const assert = require("node:assert/strict")
const test = require("node:test")
const applyRatingDiff = require("../dao/applyRatingDiff")
const { objectId } = require("./fixtures/ratingsStore")

// Modelos falsos: registran cada bulkWrite en un log global ordenado.
const fakeModels = () => {
    const log = []
    const model = (name) => ({
        collection: { name },
        bulkWrite: async (operations) => {
            log.push({ name, size: operations.length })
        },
    })
    return {
        log,
        playersModel: model("player-ratings"),
        eventsModel: model("rating-events"),
    }
}

const event = (n) => ({
    ratingVersion: "v1",
    matchId: objectId(n),
    delta: n,
})
const player = (id) => ({ ratingVersion: "v1", id, rating: 1000 })
const section = (insert = [], update = [], remove = []) => ({
    insert,
    update,
    delete: remove,
})
const diffOf = (events, players) => ({ events, players })

test("sin shouldContinue: escribe todo igual que antes y no agrega cancelled", async () => {
    const { log, playersModel, eventsModel } = fakeModels()
    const result = await applyRatingDiff(
        diffOf(
            section([event(1), event(2)], [], [event(3)]),
            section([], [player("a"), player("b")])
        ),
        { playersModel, eventsModel }
    )
    assert.deepEqual(result, {
        events: { insert: 2, update: 0, delete: 1 },
        players: { insert: 0, update: 2, delete: 0 },
        batches: 2,
    })
    assert.deepEqual(
        log.map((call) => call.name),
        ["rating-events", "player-ratings"]
    )
})

test("shouldContinue falso desde el inicio: 0 escrituras y cancelled", async () => {
    const { log, playersModel, eventsModel } = fakeModels()
    const result = await applyRatingDiff(
        diffOf(section([event(1)]), section([], [player("a")])),
        { playersModel, eventsModel, shouldContinue: () => false }
    )
    assert.deepEqual(log, [])
    assert.equal(result.cancelled, true)
    assert.equal(result.batches, 0)
})

test("falso después de la última tanda de eventos: eventos escritos, jugadores no", async () => {
    const { log, playersModel, eventsModel } = fakeModels()
    const result = await applyRatingDiff(
        diffOf(section([event(1), event(2)]), section([], [player("a")])),
        {
            playersModel,
            eventsModel,
            shouldContinue: () => log.length < 1,
        }
    )
    assert.deepEqual(log, [{ name: "rating-events", size: 2 }])
    assert.equal(result.cancelled, true)
    assert.equal(result.batches, 1)
})

test("con 1.200 inserts y batchSize chico corta entre tandas", async () => {
    const { log, playersModel, eventsModel } = fakeModels()
    const inserts = Array.from({ length: 1200 }, (_, index) => event(index + 1))
    const result = await applyRatingDiff(
        diffOf(section(inserts), section([], [player("a")])),
        {
            playersModel,
            eventsModel,
            batchSize: 500,
            shouldContinue: () => log.length < 2,
        }
    )
    assert.deepEqual(
        log.map((call) => call.size),
        [500, 500]
    )
    assert.equal(result.cancelled, true)
    assert.ok(!log.some((call) => call.name === "player-ratings"))
})

test("shouldContinue siempre verdadero aplica las 3 tandas de eventos y la de jugadores", async () => {
    const { log, playersModel, eventsModel } = fakeModels()
    const inserts = Array.from({ length: 1200 }, (_, index) => event(index + 1))
    const result = await applyRatingDiff(
        diffOf(section(inserts), section([], [player("a")])),
        {
            playersModel,
            eventsModel,
            batchSize: 500,
            shouldContinue: () => true,
        }
    )
    assert.equal(result.batches, 4)
    assert.equal("cancelled" in result, false)
    assert.equal(log.at(-1).name, "player-ratings")
})

"use strict"
const assert = require("node:assert/strict")
const test = require("node:test")
const mongoose = require("mongoose")
const applyRatingDiff = require("../dao/applyRatingDiff")
const { RATING_FILTER } = require("../dao/findRatingMatches")
const findRatingSourceStats = require("../dao/findRatingSourceStats")
const findStoredRatingDocuments = require("../dao/findStoredRatingDocuments")
const playerRatingsModel = require("../dao/models/playerRatings")
const ratingEventsModel = require("../dao/models/ratingEvents")
const {
    buildRatingDocuments,
    diffRatingDocuments,
} = require("../service/ratingsStore")
const {
    SOURCE_STATS,
    buildTimeline,
    objectId,
} = require("./fixtures/ratingsStore")

const computed = () =>
    buildRatingDocuments(buildTimeline(), {
        fingerprint: "a".repeat(64),
        computedAt: new Date("2026-02-01T00:00:00Z"),
        sourceStats: SOURCE_STATS,
    })
const EMPTY = { events: [], players: [] }

const indexOf = (model, fields) =>
    model.schema
        .indexes()
        .find(([keys]) => JSON.stringify(keys) === JSON.stringify(fields))

test("modelos: colecciones y opciones que evitan crear nada al desplegar", () => {
    assert.equal(playerRatingsModel.collection.name, "player-ratings")
    assert.equal(ratingEventsModel.collection.name, "rating-events")
    for (const model of [playerRatingsModel, ratingEventsModel]) {
        assert.equal(model.schema.options.autoIndex, false)
        assert.equal(model.schema.options.autoCreate, false)
        assert.equal(model.schema.options.versionKey, false)
        assert.equal(model.schema.options.timestamps, undefined)
    }
})

test("modelos: índices esperados con la unicidad correcta", () => {
    const player = indexOf(playerRatingsModel, { ratingVersion: 1, id: 1 })
    assert.equal(player[1].unique, true)
    assert.equal(playerRatingsModel.schema.indexes().length, 1)

    const match = indexOf(ratingEventsModel, { ratingVersion: 1, matchId: 1 })
    assert.equal(match[1].unique, true)
    const seq = indexOf(ratingEventsModel, { ratingVersion: 1, seq: 1 })
    assert.notEqual(seq[1].unique, true)
    const p1 = indexOf(ratingEventsModel, {
        ratingVersion: 1,
        "p1.id": 1,
        seq: 1,
    })
    const p2 = indexOf(ratingEventsModel, {
        ratingVersion: 1,
        "p2.id": 1,
        seq: 1,
    })
    assert.ok(p1 && p2)
    assert.notEqual(p1[1].unique, true)
    assert.notEqual(p2[1].unique, true)
    assert.equal(ratingEventsModel.schema.indexes().length, 4)
})

test("modelos: source existe en player-ratings y no es obligatorio", () => {
    for (const field of ["source.ratedMatches", "source.maxUpdatedAt"]) {
        const schemaPath = playerRatingsModel.schema.path(field)
        assert.ok(schemaPath, field)
        assert.notEqual(schemaPath.isRequired, true, field)
    }
    assert.equal(
        playerRatingsModel.schema.path("source.maxUpdatedAt").instance,
        "Date"
    )
    assert.equal(
        ratingEventsModel.schema.path("source.ratedMatches"),
        undefined
    )
    // Un documento de la etapa 1 (sin source) sigue validando.
    const { players } = computed()
    const { source, ...stage1 } = players[0]
    assert.ok(source)
    assert.equal(new playerRatingsModel(stage1).validateSync(), undefined)
})

test("modelos: cada campo de los documentos del builder existe en el schema", () => {
    const leaves = (value, prefix, found) => {
        for (const [key, child] of Object.entries(value)) {
            const where = prefix ? `${prefix}.${key}` : key
            if (
                child &&
                typeof child === "object" &&
                !(child instanceof Date)
            ) {
                leaves(child, where, found)
            } else {
                found.push(where)
            }
        }
        return found
    }
    const { events, players } = computed()
    for (const [model, doc] of [
        [ratingEventsModel, events[0]],
        [playerRatingsModel, players[0]],
    ]) {
        for (const leaf of leaves(doc, "", [])) {
            assert.ok(model.schema.path(leaf), `${model.modelName}: ${leaf}`)
        }
    }
})

test("modelos: los documentos del builder validan (matchId string castea a ObjectId)", () => {
    const { events, players } = computed()
    for (const doc of events) {
        const instance = new ratingEventsModel(doc)
        assert.equal(instance.validateSync(), undefined)
        assert.ok(instance.matchId instanceof mongoose.Types.ObjectId)
        assert.equal(instance.p1._id, undefined)
    }
    for (const doc of players) {
        assert.equal(new playerRatingsModel(doc).validateSync(), undefined)
    }
})

const fakeModel = (name, calls) => ({
    collection: { name },
    bulkWrite: async (operations, options) => {
        calls.push({ name, operations, options })
    },
})
const fakes = () => {
    const calls = []
    return {
        calls,
        playersModel: fakeModel("player-ratings", calls),
        eventsModel: fakeModel("rating-events", calls),
    }
}

test("applyRatingDiff: 1.200 inserts van en tandas de 500, ordered false", async () => {
    const { calls, playersModel, eventsModel } = fakes()
    const base = computed().events[0]
    const events = Array.from({ length: 1200 }, (_, index) => ({
        ...base,
        seq: index + 1,
        matchId: String(objectId(index + 1)),
    }))
    const result = await applyRatingDiff(
        {
            events: { insert: events, update: [], delete: [] },
            players: diffRatingDocuments(EMPTY, EMPTY).players,
        },
        { playersModel, eventsModel }
    )
    assert.deepEqual(
        calls.map((call) => call.operations.length),
        [500, 500, 200]
    )
    for (const call of calls) {
        assert.equal(call.name, "rating-events")
        assert.deepEqual(call.options, { ordered: false })
    }
    assert.equal(result.batches, 3)
    assert.deepEqual(result.events, { insert: 1200, update: 0, delete: 0 })
})

test("applyRatingDiff: upserts por clave única, sin la clave en $set", async () => {
    const { calls, playersModel, eventsModel } = fakes()
    const { events, players } = computed()
    const diff = {
        events: { insert: [events[0]], update: [events[1]], delete: [] },
        players: { insert: [players[0]], update: [players[1]], delete: [] },
    }
    await applyRatingDiff(diff, { playersModel, eventsModel })
    const [eventCall, playerCall] = calls
    assert.equal(eventCall.name, "rating-events")
    assert.equal(playerCall.name, "player-ratings")
    for (const [index, operation] of eventCall.operations.entries()) {
        const { filter, update, upsert } = operation.updateOne
        assert.equal(upsert, true)
        assert.equal(filter.ratingVersion, "2.0")
        assert.ok(filter.matchId instanceof mongoose.Types.ObjectId)
        assert.equal(String(filter.matchId), events[index].matchId)
        assert.equal("ratingVersion" in update.$set, false)
        assert.equal("matchId" in update.$set, false)
        assert.equal(update.$set.seq, events[index].seq)
        assert.deepEqual(update.$set.computedAt, events[index].computedAt)
    }
    playerCall.operations.forEach((operation, index) => {
        const { filter, update, upsert } = operation.updateOne
        assert.equal(upsert, true)
        assert.deepEqual(filter, {
            ratingVersion: "2.0",
            id: players[index].id,
        })
        assert.equal("id" in update.$set, false)
        assert.equal(update.$set.rating, players[index].rating)
        assert.ok(update.$set.computedAt)
    })
})

test("applyRatingDiff: el $set del jugador lleva source y los eventos se escriben antes que los jugadores", async () => {
    const { calls, playersModel, eventsModel } = fakes()
    const { events, players } = computed()
    await applyRatingDiff(
        {
            events: { insert: [], update: events, delete: [] },
            players: { insert: [], update: players, delete: [] },
        },
        { playersModel, eventsModel }
    )
    assert.deepEqual(
        calls.map((call) => call.name),
        ["rating-events", "player-ratings"]
    )
    calls[1].operations.forEach((operation, index) => {
        const { $set } = operation.updateOne.update
        assert.deepEqual($set.source, players[index].source)
        assert.equal($set.source.ratedMatches, SOURCE_STATS.ratedMatches)
        assert.equal(
            $set.source.maxUpdatedAt.getTime(),
            SOURCE_STATS.maxUpdatedAt.getTime()
        )
    })
    for (const operation of calls[0].operations) {
        assert.equal("source" in operation.updateOne.update.$set, false)
    }
})

test("findRatingSourceStats: un solo aggregate con $match = RATING_FILTER y $group count + max updatedAt", async () => {
    const pipelines = []
    const model = {
        aggregate: async (pipeline) => {
            pipelines.push(pipeline)
            return [
                {
                    _id: null,
                    ratedMatches: 7,
                    maxUpdatedAt: new Date("2026-01-09T12:00:00Z"),
                },
            ]
        },
    }
    const result = await findRatingSourceStats({ model })
    assert.equal(pipelines.length, 1)
    assert.deepEqual(pipelines[0], [
        { $match: { played: { $ne: false }, valid: { $ne: false } } },
        {
            $group: {
                _id: null,
                ratedMatches: { $sum: 1 },
                maxUpdatedAt: { $max: "$updatedAt" },
            },
        },
    ])
    assert.deepEqual(pipelines[0][0].$match, RATING_FILTER)
    // El filtro es una copia: mutar el pipeline no toca la constante.
    assert.notEqual(pipelines[0][0].$match, RATING_FILTER)
    assert.deepEqual(result, {
        ratedMatches: 7,
        maxUpdatedAt: new Date("2026-01-09T12:00:00Z"),
    })
})

test("findRatingSourceStats: sin filas o sin updatedAt da ceros y null", async () => {
    const modelReturning = (rows) => ({ aggregate: async () => rows })
    assert.deepEqual(
        await findRatingSourceStats({ model: modelReturning([]) }),
        { ratedMatches: 0, maxUpdatedAt: null }
    )
    assert.deepEqual(
        await findRatingSourceStats({
            model: modelReturning([{ _id: null, ratedMatches: 3 }]),
        }),
        { ratedMatches: 3, maxUpdatedAt: null }
    )
    assert.deepEqual(
        await findRatingSourceStats({
            model: modelReturning([
                { _id: null, ratedMatches: 3, maxUpdatedAt: null },
            ]),
        }),
        { ratedMatches: 3, maxUpdatedAt: null }
    )
})

test("applyRatingDiff: delete usa la clave guardada (matchId puede ser ObjectId)", async () => {
    const { calls, playersModel, eventsModel } = fakes()
    const { events, players } = computed()
    const stored = { ...events[0], matchId: objectId(1) }
    await applyRatingDiff(
        {
            events: { insert: [], update: [], delete: [stored] },
            players: { insert: [], update: [], delete: [players[0]] },
        },
        { playersModel, eventsModel }
    )
    assert.deepEqual(calls[0].operations, [
        {
            deleteOne: {
                filter: { ratingVersion: "2.0", matchId: objectId(1) },
            },
        },
    ])
    assert.deepEqual(calls[1].operations, [
        { deleteOne: { filter: { ratingVersion: "2.0", id: players[0].id } } },
    ])
})

test("applyRatingDiff: diff vacío no llama a bulkWrite y devuelve ceros", async () => {
    const { calls, playersModel, eventsModel } = fakes()
    const result = await applyRatingDiff(diffRatingDocuments(EMPTY, EMPTY), {
        playersModel,
        eventsModel,
    })
    assert.equal(calls.length, 0)
    assert.deepEqual(result, {
        events: { insert: 0, update: 0, delete: 0 },
        players: { insert: 0, update: 0, delete: 0 },
        batches: 0,
    })
})

test("applyRatingDiff: propaga session", async () => {
    const { calls, playersModel, eventsModel } = fakes()
    const session = { id: "sesion" }
    await applyRatingDiff(diffRatingDocuments(computed(), EMPTY), {
        playersModel,
        eventsModel,
        session,
    })
    assert.ok(calls.length >= 2)
    for (const call of calls) {
        assert.equal(call.options.session, session)
        assert.equal(call.options.ordered, false)
    }
})

test("applyRatingDiff: se niega a escribir en colecciones ajenas antes de tocar nada", async () => {
    const diff = diffRatingDocuments(computed(), EMPTY)
    for (const [playersName, eventsName] of [
        ["player-ratings", "face-to-face"],
        ["face-to-face", "rating-events"],
    ]) {
        const calls = []
        await assert.rejects(
            applyRatingDiff(diff, {
                playersModel: fakeModel(playersName, calls),
                eventsModel: fakeModel(eventsName, calls),
            }),
            /solo puede escribir en player-ratings y rating-events/
        )
        assert.equal(calls.length, 0)
    }
    await assert.rejects(
        applyRatingDiff(diff, {
            playersModel: { bulkWrite: async () => {} },
            eventsModel: {
                collection: { name: "rating-events" },
                bulkWrite: async () => {},
            },
        }),
        /solo puede escribir/
    )
})

test("applyRatingDiff: matchId inválido lanza sin escribir; el error de bulkWrite se propaga", async () => {
    const { calls, playersModel, eventsModel } = fakes()
    const event = { ...computed().events[0], matchId: "no-es-un-id" }
    await assert.rejects(
        applyRatingDiff(
            {
                events: { insert: [event], update: [], delete: [] },
                players: { insert: [], update: [], delete: [] },
            },
            { playersModel, eventsModel }
        ),
        /matchId inválido/
    )
    assert.equal(calls.length, 0)

    const failing = {
        collection: { name: "rating-events" },
        bulkWrite: async () => {
            throw new Error("boom")
        },
    }
    await assert.rejects(
        applyRatingDiff(diffRatingDocuments(computed(), EMPTY), {
            playersModel,
            eventsModel: failing,
        }),
        /boom/
    )
    assert.equal(calls.length, 0)
})

test("findStoredRatingDocuments: find por ratingVersion con lean en ambos modelos", async () => {
    const queries = []
    const modelReturning = (name, docs) => ({
        find: (filter) => {
            queries.push([name, filter])
            return { lean: async () => docs }
        },
    })
    const result = await findStoredRatingDocuments("2.0", {
        playersModel: modelReturning("players", [{ id: "n" }]),
        eventsModel: modelReturning("events", [{ seq: 1 }, { seq: 2 }]),
    })
    assert.deepEqual(result, {
        events: [{ seq: 1 }, { seq: 2 }],
        players: [{ id: "n" }],
    })
    assert.deepEqual(queries.sort(), [
        ["events", { ratingVersion: "2.0" }],
        ["players", { ratingVersion: "2.0" }],
    ])
    for (const invalid of ["", "  ", undefined, 2]) {
        await assert.rejects(
            findStoredRatingDocuments(invalid, {
                playersModel: modelReturning("players", []),
                eventsModel: modelReturning("events", []),
            }),
            /ratingVersion/
        )
    }
})

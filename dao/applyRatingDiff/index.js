const mongoose = require("mongoose")
const {
    ALLOWED_COLLECTIONS,
    DEFAULT_BATCH_SIZE,
} = require("../../service/ratingsStore/constants")

// Aplica un diff (service/ratingsStore/diff) a `player-ratings` y
// `rating-events` con bulkWrite en tandas. Solo puede escribir en esas dos
// colecciones. Los modelos se cargan recién al llamar (o se inyectan, para
// tests). Todavía no se exporta desde dao/index.js.
//
// No es transaccional en la etapa 1 (colecciones derivadas y recomputables);
// `session` se pasa a bulkWrite para poder envolverlo en una transacción más
// adelante sin cambiar la firma.
const assertAllowedModel = (model) => {
    if (!ALLOWED_COLLECTIONS.includes(model?.collection?.name)) {
        throw new Error(
            "applyRatingDiff solo puede escribir en player-ratings y rating-events"
        )
    }
}

const toObjectId = (value) => {
    // bson 4 usa "ObjectID" y las versiones nuevas "ObjectId".
    if (
        value instanceof mongoose.Types.ObjectId ||
        /^ObjectI[dD]$/.test(value?._bsontype)
    ) {
        return value
    }
    if (typeof value === "string" && /^[0-9a-f]{24}$/i.test(value)) {
        return new mongoose.Types.ObjectId(value)
    }
    throw new Error("applyRatingDiff: matchId inválido")
}

const withoutKeys = (doc, keys) => {
    const copy = { ...doc }
    for (const key of keys) delete copy[key]
    return copy
}

const upsertOp = (key, doc, keyFields) => ({
    updateOne: {
        filter: key,
        update: { $set: withoutKeys(doc, keyFields) },
        upsert: true,
    },
})

const buildOperations = (section, keyOf, keyFields) => [
    ...section.insert.map((doc) =>
        upsertOp(keyOf(doc), doc, ["ratingVersion", ...keyFields])
    ),
    ...section.update.map((doc) =>
        upsertOp(keyOf(doc), doc, ["ratingVersion", ...keyFields])
    ),
    ...section.delete.map((doc) => ({
        deleteOne: { filter: keyOf(doc) },
    })),
]

const eventKey = (doc) => ({
    ratingVersion: doc.ratingVersion,
    matchId: toObjectId(doc.matchId),
})
const playerKey = (doc) => ({ ratingVersion: doc.ratingVersion, id: doc.id })

const writeInBatches = async (model, operations, batchSize, session) => {
    let batches = 0
    for (let start = 0; start < operations.length; start += batchSize) {
        await model.bulkWrite(operations.slice(start, start + batchSize), {
            ordered: false,
            ...(session ? { session } : {}),
        })
        batches += 1
    }
    return batches
}

const counts = (section) => ({
    insert: section.insert.length,
    update: section.update.length,
    delete: section.delete.length,
})

const applyRatingDiff = async (
    diff,
    { playersModel, eventsModel, batchSize = DEFAULT_BATCH_SIZE, session } = {}
) => {
    const players = playersModel ?? require("../models/playerRatings")
    const events = eventsModel ?? require("../models/ratingEvents")
    // Antes de cualquier escritura: ninguna colección ajena, ni la otra.
    assertAllowedModel(players)
    assertAllowedModel(events)
    if (!Number.isInteger(batchSize) || batchSize < 1) {
        throw new Error("applyRatingDiff: batchSize inválido")
    }
    // Se arman todas las operaciones antes de escribir, así un matchId inválido
    // no deja una escritura a medias.
    const eventOperations = buildOperations(diff.events, eventKey, ["matchId"])
    const playerOperations = buildOperations(diff.players, playerKey, ["id"])
    const eventBatches = await writeInBatches(
        events,
        eventOperations,
        batchSize,
        session
    )
    const playerBatches = await writeInBatches(
        players,
        playerOperations,
        batchSize,
        session
    )
    return {
        events: counts(diff.events),
        players: counts(diff.players),
        batches: eventBatches + playerBatches,
    }
}

module.exports = applyRatingDiff
module.exports.assertAllowedModel = assertAllowedModel

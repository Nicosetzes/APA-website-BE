const mongoose = require("mongoose")
const {
    ALLOWED_COLLECTIONS,
    DEFAULT_BATCH_SIZE,
} = require("../../service/ratingsStore/constants")

// Aplica un diff (service/ratingsStore/diff) a `player-ratings` y
// `rating-events` con bulkWrite en tandas. Solo puede escribir en esas dos
// colecciones. Los modelos se cargan recién al llamar (o se inyectan, para
// tests). NO se exporta desde dao/index.js a propósito: lo usan el script
// `recompute:ratings` y service/syncRatingsAfterWrite (la actualización al
// escribir, etapa 3), y la lectura de la app no debe cargar el camino de
// escritura (lo exige test/ratingsStoreScripts.test.js).
//
// No es transaccional (colecciones derivadas y recomputables; el orden eventos
// y luego jugadores hace seguro el estado intermedio); `session` se pasa a
// bulkWrite para poder envolverlo en una transacción sin cambiar la firma.
//
// `shouldContinue` (opcional) se evalúa antes de cada tanda; si da falso se
// corta y el resultado trae `cancelled: true` (lo usa el presupuesto de tiempo
// de la etapa 3).
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

// `shouldContinue` se evalúa ANTES de cada tanda: si devuelve falso se corta ahí
// (`cancelled: true`) y no se escribe nada más.
const writeInBatches = async (
    model,
    operations,
    batchSize,
    session,
    shouldContinue
) => {
    let batches = 0
    for (let start = 0; start < operations.length; start += batchSize) {
        if (!shouldContinue()) return { batches, cancelled: true }
        await model.bulkWrite(operations.slice(start, start + batchSize), {
            ordered: false,
            ...(session ? { session } : {}),
        })
        batches += 1
    }
    return { batches, cancelled: false }
}

const counts = (section) => ({
    insert: section.insert.length,
    update: section.update.length,
    delete: section.delete.length,
})

const applyRatingDiff = async (
    diff,
    {
        playersModel,
        eventsModel,
        batchSize = DEFAULT_BATCH_SIZE,
        session,
        shouldContinue = () => true,
    } = {}
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
    // Primero TODOS los eventos y recién después los jugadores: los jugadores
    // llevan `source` + `fingerprint`, el marcador de frescura (ver
    // service/ratingsStore/freshness). Si el proceso se corta entre las dos
    // colecciones, los jugadores guardados siguen con el `source` viejo y los
    // lectores caen al camino en vivo.
    const eventsResult = await writeInBatches(
        events,
        eventOperations,
        batchSize,
        session,
        shouldContinue
    )
    const playersResult = eventsResult.cancelled
        ? { batches: 0, cancelled: true }
        : await writeInBatches(
              players,
              playerOperations,
              batchSize,
              session,
              shouldContinue
          )
    const result = {
        events: counts(diff.events),
        players: counts(diff.players),
        batches: eventsResult.batches + playersResult.batches,
    }
    // Sin la clave `cancelled` cuando se aplicó completo: misma forma que antes.
    if (playersResult.cancelled) result.cancelled = true
    return result
}

module.exports = applyRatingDiff
module.exports.assertAllowedModel = assertAllowedModel

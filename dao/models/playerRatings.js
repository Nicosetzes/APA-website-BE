const mongoose = require("mongoose")
// Ratings persistidos (etapa 1): estado actual de cada jugador. Colección
// derivada de `face-to-face`, que sigue siendo la fuente de verdad.
//
// La app solo carga este modelo para LEER; la colección y sus índices se crean
// únicamente cuando corre `npm run recompute:ratings -- --apply` (por eso
// `autoIndex` y `autoCreate` están apagados en el schema).
//
// `source` (no requerido: los documentos de la etapa 1 no lo tienen) guarda de
// qué estado de `matches` salieron los ratings: cantidad de partidos que cumplen
// el filtro del motor y el mayor `updatedAt`. Es igual en todos los jugadores de
// una corrida.
const collection = "player-ratings"
const playerRatingsSchema = new mongoose.Schema(
    {
        ratingVersion: { type: String, required: true },
        id: { type: String, required: true },
        name: { type: String, required: true },
        rating: { type: Number, required: true },
        peak: { type: Number, required: true },
        matches: { type: Number, required: true },
        wins: { type: Number, required: true },
        draws: { type: Number, required: true },
        losses: { type: Number, required: true },
        lastPlayedAt: { type: Date, required: false },
        lastChange: { type: Number, required: false },
        eventCount: { type: Number, required: true },
        source: {
            ratedMatches: { type: Number },
            maxUpdatedAt: { type: Date },
        },
        fingerprint: { type: String, required: true },
        computedAt: { type: Date, required: true },
    },
    {
        collection,
        versionKey: false,
        id: false,
        autoIndex: false,
        autoCreate: false,
    }
)
playerRatingsSchema.index(
    { ratingVersion: 1, id: 1 },
    { name: "uniq_player_rating_version_id_v1", unique: true }
)
module.exports = mongoose.model(collection, playerRatingsSchema)

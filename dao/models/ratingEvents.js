const mongoose = require("mongoose")
const { PLAYED_AT_PRECISIONS } = require("../../utils/playedAt")
// Ratings persistidos (etapa 1): un documento por partido rateado, con el
// rating de cada lado antes y después. `matchId` es el `_id` del partido en
// `face-to-face`. Colección derivada: la fuente de verdad sigue siendo `matches`.
// Desde el esquema 2 también guarda lo que necesita `GET /api/ratings/history`
// (ids de equipo, penales, tipo de cruce) y lo previsto para la etapa 2
// (torneo y precisión de la fecha), así el endpoint no lee partidos.
//
// La app solo carga este modelo para LEER; la colección y sus índices se crean
// únicamente cuando corre `npm run recompute:ratings -- --apply` (por eso
// `autoIndex` y `autoCreate` están apagados en el schema).
const collection = "rating-events"
// Lado del partido como path anidado (sin sub-schema, para no generar `_id`).
const createSide = () => ({
    id: { type: String, required: true },
    name: { type: String },
    before: { type: Number, required: true },
    after: { type: Number, required: true },
    games: { type: Number, required: true },
    team: { type: String },
    teamId: { type: mongoose.Schema.Types.Mixed },
    teamOverall: { type: Number },
})
const ratingEventsSchema = new mongoose.Schema(
    {
        ratingVersion: { type: String, required: true },
        seq: { type: Number, required: true },
        matchId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        time: { type: Date },
        tournament: { type: String },
        type: { type: String },
        scoreP1: { type: Number, required: true },
        scoreP2: { type: Number, required: true },
        expectedP1: { type: Number, required: true },
        resultP1: { type: Number, required: true },
        delta: { type: Number, required: true },
        teamAdjustment: { type: Number, required: true },
        tournamentId: { type: String },
        leg: { type: Number },
        tournamentFormat: { type: String },
        tournamentPlayoffMode: { type: String },
        kind: { type: String, enum: ["win", "advance", null] },
        playedAtPrecision: {
            type: String,
            enum: [...PLAYED_AT_PRECISIONS, null],
        },
        shootoutP1: { type: Number },
        shootoutP2: { type: Number },
        shootoutWinner: { type: String, enum: ["p1", "p2", null] },
        p1: createSide(),
        p2: createSide(),
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
// Único real: un evento por (versión, partido).
ratingEventsSchema.index(
    { ratingVersion: 1, matchId: 1 },
    { name: "uniq_rating_event_version_match_v1", unique: true }
)
// `seq` NO es único a propósito: al insertar un partido en el medio se
// desplaza el `seq` de muchos eventos, y un bulkWrite `ordered: false`
// violaría un único de forma transitoria.
ratingEventsSchema.index(
    { ratingVersion: 1, seq: 1 },
    { name: "rating_event_version_seq_v1" }
)
// Lo usa `GET /api/ratings/period`: eventos con `time` dentro de un rango (el
// período) y con `time >= end` (el borde posterior), ordenados por `seq`.
ratingEventsSchema.index(
    { ratingVersion: 1, time: 1, seq: 1 },
    { name: "rating_event_version_time_seq_v1" }
)
ratingEventsSchema.index(
    { ratingVersion: 1, "p1.id": 1, seq: 1 },
    { name: "rating_event_version_p1_seq_v1" }
)
ratingEventsSchema.index(
    { ratingVersion: 1, "p2.id": 1, seq: 1 },
    { name: "rating_event_version_p2_seq_v1" }
)
module.exports = mongoose.model(collection, ratingEventsSchema)

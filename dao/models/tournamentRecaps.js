const mongoose = require("mongoose")

const collection = "tournament-recaps"

const generationSchema = new mongoose.Schema(
    {
        model: { type: String, required: true, trim: true, maxlength: 100 },
        promptVersion: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
        },
        contextVersion: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
        },
        ratingVersion: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
        },
        drawModelVersion: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
        },
        contextHash: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
        },
    },
    { _id: false }
)

// Reservado para la etapa 2 (imagen). El POST no lo acepta todavía.
const imageSchema = new mongoose.Schema(
    {
        url: { type: String },
        publicId: { type: String },
        prompt: { type: String },
        status: { type: String },
    },
    { _id: false }
)

const tournamentRecapSchema = new mongoose.Schema(
    {
        tournamentId: { type: String, required: true, trim: true },
        tournament: { type: String, required: true, trim: true },
        format: { type: String, trim: true },
        closedAt: { type: Date },
        headline: {
            type: String,
            required: true,
            trim: true,
            maxlength: 140,
        },
        summary: { type: String, required: true, trim: true, maxlength: 500 },
        recap: { type: String, required: true, maxlength: 50000 },
        language: { type: String, default: "es-AR", trim: true },
        generation: { type: generationSchema, required: true },
        image: { type: imageSchema, default: null },
        // Sin default: el upsert lo maneja con `$inc` (crea 1, reemplazar suma 1).
        revision: { type: Number, min: 1 },
        createdAt: { type: Date, required: true },
    },
    { collection, timestamps: { createdAt: false, updatedAt: true } }
)

tournamentRecapSchema.index(
    { tournamentId: 1 },
    { unique: true, name: "uniq_tournament_recap_tournament_v1" }
)

module.exports = mongoose.model(collection, tournamentRecapSchema)

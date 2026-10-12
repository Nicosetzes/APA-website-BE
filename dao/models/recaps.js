const mongoose = require("mongoose")

const collection = "recaps"

const recapTournamentSchema = new mongoose.Schema(
    {
        tournamentId: { type: String, required: true, trim: true },
        tournament: { type: String, required: true, trim: true },
        matchCount: { type: Number, required: true, min: 0 },
        matchesByStage: {
            playoff: { type: Number, default: 0, min: 0 },
            playin: { type: Number, default: 0, min: 0 },
            regular: { type: Number, default: 0, min: 0 },
        },
    },
    { _id: false }
)

const recapSchema = new mongoose.Schema(
    {
        date: {
            type: String,
            required: true,
            trim: true,
            match: /^\d{4}-\d{2}-\d{2}$/,
        },
        matchCount: { type: Number, required: true, min: 0 },
        recap: { type: String, required: true },
        tournaments: { type: [recapTournamentSchema], default: [] },
        createdAt: { type: Date, required: true },
    },
    { collection, timestamps: { createdAt: false, updatedAt: true } }
)

recapSchema.index({ date: 1 }, { unique: true, name: "uniq_recap_date_v1" })

module.exports = mongoose.model(collection, recapSchema)

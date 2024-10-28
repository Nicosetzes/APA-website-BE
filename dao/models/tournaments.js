const mongoose = require("mongoose")

const collection = "tournaments"

const tournamentsSchema = new mongoose.Schema(
    {
        name: { type: String, require: true, max: 100 },
        players: { type: Array, require: true, max: 100 },
        teams: { type: Array, require: true, max: 100 },
        outcome: { type: Object, require: true, max: 100 },
        ongoing: { type: Boolean, default: true }, // Revisar el default
        format: { type: String, default: false },
        cloudinary_id: { type: String, require: true, max: 100 },
        groups: { type: Array, require: true, default: [], max: 8 },
    },
    {
        collection: "tournaments",
        timestamps: true,
    }
)

module.exports = mongoose.model(collection, tournamentsSchema)

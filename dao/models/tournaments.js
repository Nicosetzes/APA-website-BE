const mongoose = require("mongoose")

const collection = "tournaments"

const tournamentsSchema = new mongoose.Schema(
    {
        name: { type: String, require: true, max: 100 },
        players: { type: Array, require: true, max: 100 },
        teams: { type: Array, require: true, max: 100 },
        outcome: { type: Object, require: true, max: 100 },
        apa_id: { type: String, require: true, max: 100 },
        ongoing: { type: Boolean, default: true }, // Revisar el default
        type: { type: String, default: false },
        parents: { type: Array, require: true, max: 100 },
        cloudinary_id: { type: String, require: true, max: 100 },
    },
    { collection: "tournaments" }
)

module.exports = mongoose.model(collection, tournamentsSchema)

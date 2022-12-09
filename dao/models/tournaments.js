const mongoose = require("mongoose")

const collection = "tournaments"

const tournamentsSchema = new mongoose.Schema(
    {
        name: { type: String, require: true, max: 100 },
        players: { type: Array, require: true, max: 100 },
        teams: { type: Array, require: true, max: 100 },
        outcome: { type: Object, require: true, max: 100 },
        ongoing: { type: Boolean, default: true }, // Revisar el default
        worldCup: { type: Boolean, default: false },
    },
    { collection: "tournaments" }
)

module.exports = mongoose.model(collection, tournamentsSchema)

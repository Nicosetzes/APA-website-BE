const mongoose = require("mongoose")

const collection = "tournaments"

const tournamentsSchema = new mongoose.Schema(
    {
        name: { type: String, require: true, max: 100 },
        players: { type: Array, require: true, max: 100 },
        format: { type: String, require: true, max: 100 },
        origin: { type: String, require: true, max: 100 },
        teams: { type: Array, require: true, max: 100 },
        fixture: { type: Array, require: true, max: 100 },
        fixtureStatus: { type: Boolean, require: true },
        ongoing: { type: Boolean, require: true },
    },
    { collection: "tournaments" }
)

module.exports = mongoose.model(collection, tournamentsSchema)

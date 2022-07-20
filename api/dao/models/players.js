const mongoose = require("mongoose");

const collection = "human-players";

const playersSchema = new mongoose.Schema(
    {
        name: { type: String, require: true, max: 100 },
        championships: { type: Array, require: true },
        drawStreak: { type: Number, require: true, max: 100 },
        winningStreak: { type: Number, require: true, max: 100 },
        losingStreak: { type: Number, require: true, max: 100 },
        longestDrawStreak: { type: Number, require: true, max: 100 },
        longestWinningStreak: { type: Number, require: true, max: 100 },
        longestLosingStreak: { type: Number, require: true, max: 100 },
    },
    { collection: collection }
);

module.exports = mongoose.model(collection, playersSchema);
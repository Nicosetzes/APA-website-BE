const mongoose = require("mongoose")

const collection = "edits"

const editSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users",
            required: true,
        },
        url: {
            type: String,
            required: true,
        },
        public_id: {
            type: String,
            required: true,
        },
        caption: {
            type: String,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    { collection, timestamps: true }
)

module.exports = mongoose.model(collection, editSchema)

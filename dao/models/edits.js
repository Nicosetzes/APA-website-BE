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
            trim: true,
            minlength: 1,
            maxlength: 2048,
        },
        public_id: {
            type: String,
            required: true,
            trim: true,
            minlength: 1,
            maxlength: 512,
        },
    },
    { collection, timestamps: true }
)

module.exports = mongoose.model(collection, editSchema)

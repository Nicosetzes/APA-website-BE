const mongoose = require("mongoose")

const collection = "users"
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$.{53}$/

const usersSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            maxlength: 255,
            match: EMAIL_PATTERN,
        },
        password: {
            type: String,
            required: true,
            select: false,
            match: BCRYPT_HASH_PATTERN,
        },
        nickname: {
            type: String,
            required: true,
            trim: true,
            minlength: 1,
            maxlength: 255,
        },
        role: {
            type: String,
            enum: ["user", "superadmin"],
            default: "user",
            required: true,
        },
        date: {
            type: Date,
            default: Date.now,
        },
    },
    { collection }
)

module.exports = mongoose.model(collection, usersSchema)

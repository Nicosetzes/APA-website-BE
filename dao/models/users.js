const mongoose = require("mongoose")

const collection = "users"

const usersSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: [
                true,
                "{VALUE} no es un email válido, intente nuevamente",
            ],
            min: 6,
            max: 1024,
            message: "{VALUE} no es un email válido, intente nuevamente",
        },
        password: {
            type: String,
            required: true,
            min: [8, "La contraseña debe tener 8 caracteres como mínimo"],
        },
        nickname: {
            type: String,
            required: true,
            min: 1,
            max: 255,
        },
        date: {
            type: Date,
            default: Date.now,
        },
    },
    { collection: "users" }
)

module.exports = mongoose.model(collection, usersSchema)

const mongoose = require("mongoose")

const collection = "face-to-face"

const scoreLimit = (upperLimit) => {
    const numbers = []
    for (let i = 0; i < upperLimit; i++) {
        numbers.push(i)
    }
    return numbers
}

const matchesSchema = new mongoose.Schema(
    {
        playerP1: { type: Object, require: true, max: 100 },
        teamP1: { type: Object, require: true, max: 100 },
        scoreP1: {
            type: Number,
            require: true,
            enum: {
                values: scoreLimit(25),
                message: "{VALUE} es un valor inválido",
            },
        },
        playerP2: { type: Object, require: true, max: 100 },
        teamP2: { type: Object, require: true, max: 100 },
        scoreP2: {
            type: Number,
            require: true,
            enum: {
                values: scoreLimit(25),
                message: "{VALUE} es un valor inválido",
            },
        },
        type: {
            type: String,
            require: true,
            max: 100,
            // enum: {
            //     values: ["regular, playin, playoff"],
            //     message: "{VALUE} es un valor inválido",
            // },
            // default: "regular",
        },
        outcome: { type: Object, require: true, max: 100 },
        tournament: { type: Object, require: true, max: 100 },
        valid: { type: Boolean, require: false },
        played: { type: Boolean, require: true },
    },
    { collection }
)

module.exports = mongoose.model(collection, matchesSchema)

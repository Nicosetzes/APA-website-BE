const mongoose = require("mongoose")
const { schemaVersionPlugin } = require("./plugins/schemaVersion")

const collection = "face-to-face"
const MATCH_TYPES = ["regular", "playin", "playoff"]

const isVersionedV1 = function () {
    return this.schemaVersion === 1
}

const hasTournamentReference = function (tournament) {
    if (!isVersionedV1.call(this)) return true

    return (
        tournament !== null &&
        typeof tournament === "object" &&
        tournament.id !== undefined &&
        typeof tournament.name === "string" &&
        tournament.name.trim().length > 0
    )
}

const hasValidMatchType = function (type) {
    return !isVersionedV1.call(this) || MATCH_TYPES.includes(type)
}

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
            required: isVersionedV1,
            validate: {
                validator: hasValidMatchType,
                message: "{VALUE} no es un tipo de partido válido",
            },
        },
        outcome: { type: Object, require: true, max: 100 },
        tournament: {
            type: Object,
            required: isVersionedV1,
            validate: {
                validator: hasTournamentReference,
                message: "El torneo debe incluir id y name",
            },
        },
        valid: { type: Boolean, require: false },
        played: { type: Boolean, required: isVersionedV1 },
        group: { type: String, require: false, max: 1 },
        playoff_id: { type: Number, require: false },
        seedP1: { type: String, require: false, max: 2 },
        seedP2: { type: String, require: false, max: 2 },
        playerP3: { type: Object, require: true, max: 100 },
        playerP4: { type: Object, require: true, max: 100 },
    },
    { collection, timestamps: true }
)

matchesSchema.plugin(schemaVersionPlugin)

module.exports = mongoose.model(collection, matchesSchema)

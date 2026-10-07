const logger = require("../../utils/logger")
const mongoose = require("mongoose")
const { schemaVersionPlugin } = require("./plugins/schemaVersion")
const { PLAYED_AT_PRECISIONS } = require("../../utils/playedAt")

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
        leg: {
            type: Number,
            enum: [1, 2, 3],
            immutable: true,
            required: false,
        },
        seriesRevision: { type: Number, min: 0, required: false },
        // Fecha en la que se jugó; sin default ni índice (ver utils/playedAt).
        playedAt: { type: Date, required: false },
        playedAtPrecision: {
            type: String,
            enum: PLAYED_AT_PRECISIONS,
            required: false,
        },
        seedP1: { type: String, require: false, max: 2 },
        seedP2: { type: String, require: false, max: 2 },
        playerP3: { type: Object, require: true, max: 100 },
        playerP4: { type: Object, require: true, max: 100 },
    },
    { collection, timestamps: true }
)

matchesSchema.index(
    { "tournament.id": 1, type: 1, playoff_id: 1, leg: 1, _id: 1 },
    { name: "playoff_tournament_listing_v1" }
)

// Un partido físico por llave y leg; processPlayoffSeriesResult traduce el
// error 11000 de este índice en 409 PLAYOFF_DUPLICATE_LEG.
matchesSchema.index(
    { "tournament.id": 1, playoff_id: 1, leg: 1 },
    {
        name: "uniq_playoff_tournament_tie_leg_v1",
        unique: true,
        partialFilterExpression: {
            type: "playoff",
            leg: { $type: "number" },
            playoff_id: { $type: "number" },
            "tournament.id": { $type: "string" },
        },
    }
)

matchesSchema.plugin(schemaVersionPlugin)

const Match = mongoose.model(collection, matchesSchema)

// Mongoose construye los índices al conectar y, si falla, sólo emite "index".
Match.on("index", (error) => {
    if (!error) return
    logger.error("mongo_index_build_failed", {
        collection,
        errorName: error.name || "Error",
        code: error.code ?? null,
        codeName: error.codeName ?? null,
    })
})

module.exports = Match

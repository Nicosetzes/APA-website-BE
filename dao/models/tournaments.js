const mongoose = require("mongoose")
const { schemaVersionPlugin } = require("./plugins/schemaVersion")

const collection = "tournaments"
const TOURNAMENT_FORMATS = [
    "champions_league",
    "league",
    "league_playin_playoff",
    "playoff",
    "super_cup",
    "world_cup",
    "world_cup_2026",
]

const isVersionedV1 = function () {
    return this.schemaVersion === 1
}

const hasEntityReference = (value) =>
    value !== null &&
    typeof value === "object" &&
    value.id !== undefined &&
    typeof value.name === "string" &&
    value.name.trim().length > 0

const hasValidName = function (name) {
    return (
        !isVersionedV1.call(this) ||
        (typeof name === "string" &&
            name.trim().length >= 1 &&
            name.length <= 100)
    )
}

const hasValidFormat = function (format) {
    return !isVersionedV1.call(this) || TOURNAMENT_FORMATS.includes(format)
}

const hasValidPlayers = function (players) {
    return (
        !isVersionedV1.call(this) ||
        (Array.isArray(players) &&
            players.length > 0 &&
            players.every(hasEntityReference))
    )
}

const hasValidTeams = function (teams) {
    return (
        !isVersionedV1.call(this) ||
        (Array.isArray(teams) &&
            teams.length > 0 &&
            teams.every(
                (entry) =>
                    entry !== null &&
                    typeof entry === "object" &&
                    hasEntityReference(entry.team) &&
                    hasEntityReference(entry.player)
            ))
    )
}

const hasValidDailyRecap = function (dailyRecap) {
    return (
        !isVersionedV1.call(this) ||
        (dailyRecap !== null &&
            typeof dailyRecap === "object" &&
            !Array.isArray(dailyRecap))
    )
}

const tournamentsSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: isVersionedV1,
            trim: true,
            validate: {
                validator: hasValidName,
                message:
                    "El nombre del torneo debe tener entre 1 y 100 caracteres",
            },
        },
        players: {
            type: Array,
            required: isVersionedV1,
            validate: {
                validator: hasValidPlayers,
                message: "El torneo debe incluir al menos un jugador válido",
            },
        },
        teams: {
            type: Array,
            required: isVersionedV1,
            validate: {
                validator: hasValidTeams,
                message: "El torneo debe incluir al menos un equipo asignado",
            },
        },
        outcome: { type: Object, require: true, max: 100 },
        ongoing: { type: Boolean, default: true },
        format: {
            type: String,
            required: isVersionedV1,
            validate: {
                validator: hasValidFormat,
                message: "{VALUE} no es un formato de torneo válido",
            },
        },
        cloudinary_id: { type: String, require: false, max: 100 },
        groups: { type: Array, require: false, default: undefined, max: 8 },
        valid: { type: Boolean, require: false },
        daily_recap: {
            type: Object,
            default: () => ({}),
            validate: {
                validator: hasValidDailyRecap,
                message: "daily_recap debe ser un objeto indexado por fecha",
            },
        },
        legacy: { type: Boolean, require: false, default: false },
    },
    {
        collection,
        timestamps: true,
    }
)

tournamentsSchema.plugin(schemaVersionPlugin)

module.exports = mongoose.model(collection, tournamentsSchema)

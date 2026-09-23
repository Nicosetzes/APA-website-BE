const mongoose = require("mongoose")

const logger = require("./utils/logger")

let connectionPromise

// Por si el driver alguna vez incluye el URI completo en el mensaje.
const sanitizeConnectionError = (message = "") =>
    String(message)
        .replace(/mongodb(\+srv)?:\/\/[^\s]*/gi, "mongodb://<redactado>")
        .slice(0, 400)

const connectionStates = [
    "disconnected",
    "connected",
    "connecting",
    "disconnecting",
]

const getMongoUri = () => {
    const mongoUri = process.env.MONGO_URI?.trim()

    if (!mongoUri) {
        throw new Error("Missing required environment variable: MONGO_URI")
    }

    return mongoUri
}

const getDatabaseStatus = () => ({
    state: connectionStates[mongoose.connection.readyState] || "unknown",
    name: mongoose.connection.name || null,
})

const connectMongo = async () => {
    if (mongoose.connection.readyState === 1) return mongoose.connection
    if (connectionPromise) return connectionPromise

    const pendingConnection = mongoose
        .connect(getMongoUri(), { serverSelectionTimeoutMS: 5000 })
        .then(() => mongoose.connection)
        .catch((error) => {
            logger.error("mongo_connection_failed", {
                errorName: error.name || "Error",
                reason: sanitizeConnectionError(error.message),
            })

            throw error
        })

    connectionPromise = pendingConnection

    try {
        return await pendingConnection
    } finally {
        if (connectionPromise === pendingConnection) {
            connectionPromise = undefined
        }
    }
}

const disconnectMongo = async () => {
    connectionPromise = undefined

    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect()
    }
}

module.exports = {
    connectMongo,
    disconnectMongo,
    getDatabaseStatus,
}

const mongoose = require("mongoose")

let connectionPromise

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
})

const connectMongo = async () => {
    if (mongoose.connection.readyState === 1) return mongoose.connection
    if (connectionPromise) return connectionPromise

    const pendingConnection = mongoose
        .connect(getMongoUri(), { serverSelectionTimeoutMS: 5000 })
        .then(() => mongoose.connection)

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

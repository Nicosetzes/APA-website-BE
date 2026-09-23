require("dotenv").config()

const { validateEnvironment } = require("./config/environment")

if (require.main === module || process.env.VERCEL) {
    validateEnvironment()
}

const { createApp } = require("./app")
const {
    connectMongo,
    disconnectMongo,
    getDatabaseStatus,
} = require("./database")

const app = createApp({
    ensureDatabase: connectMongo,
    getDatabaseStatus,
})

const start = async () => {
    await connectMongo()
    console.log("Base de datos MongoDB conectada")

    const port = process.env.PORT || 5000
    const server = app.listen(port, () => {
        console.log(`EXPRESS server listening on port ${port}`)
    })

    let isShuttingDown = false

    const shutdown = async (signal) => {
        if (isShuttingDown) return
        isShuttingDown = true
        console.log(`${signal}: cerrando servidor`)

        const forceTimer = setTimeout(() => {
            server.closeAllConnections()
            process.exitCode = 1
        }, 10000)
        forceTimer.unref()

        try {
            await new Promise((resolve, reject) => {
                server.close((error) => {
                    if (error) return reject(error)
                    return resolve()
                })
            })
            await disconnectMongo()
            clearTimeout(forceTimer)
        } catch (error) {
            console.error("Error durante el cierre del servidor", error)
            process.exitCode = 1
        }
    }

    process.once("SIGINT", () => void shutdown("SIGINT"))
    process.once("SIGTERM", () => void shutdown("SIGTERM"))
}

if (require.main === module) {
    start().catch((error) => {
        console.error("No se pudo iniciar el servidor", error)
        process.exitCode = 1
    })
}

module.exports = app

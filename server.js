require("dotenv").config()

const { validateEnvironment } = require("./config/environment")

if (require.main === module || process.env.VERCEL) {
    validateEnvironment()
}

const { createApp } = require("./app")
const { shouldBlockLocalStart } = require("./config/databaseSafety")
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

    const { name: databaseName } = getDatabaseStatus()
    console.log(`Base de datos MongoDB conectada: ${databaseName}`)

    if (
        shouldBlockLocalStart({
            databaseName,
            isManagedDeployment: Boolean(process.env.VERCEL),
            allowProductionDatabase: process.env.ALLOW_PRODUCTION_DB === "true",
        })
    ) {
        console.error(
            `\nArranque bloqueado: "${databaseName}" no es una base de pruebas.` +
                "\nNavegar el FE contra el server local escribe en la base." +
                "\nApuntá MONGO_URI a la base de desarrollo, o si de verdad" +
                " necesitás producción, arrancá con ALLOW_PRODUCTION_DB=true.\n"
        )

        await disconnectMongo()
        process.exitCode = 1
        return
    }

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

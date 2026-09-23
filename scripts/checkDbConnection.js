/*
 * Diagnóstico de conexión. Solo conecta y desconecta: no lee ni escribe datos.
 *
 * Uso local contra la base de pruebas, sin tocar el .env:
 *   $env:MONGO_URI="mongodb+srv://..."; npm run check:db
 *
 * Nunca imprime el URI ni la contraseña: sólo el nombre de la base, el host del
 * primario y, si falla, el nombre y el motivo del error ya saneados.
 */

require("dotenv").config()

const mongoose = require("mongoose")

mongoose.set("autoIndex", false)
mongoose.set("autoCreate", false)

const {
    connectMongo,
    disconnectMongo,
    getDatabaseStatus,
} = require("../database")

const run = async () => {
    const started = Date.now()

    try {
        await connectMongo()

        const status = getDatabaseStatus()
        const host = mongoose.connection.host || "desconocido"

        console.log("conexión establecida")
        console.log(`  estado:  ${status.state}`)
        console.log(`  base:    ${status.name}`)
        console.log(`  host:    ${host}`)
        console.log(`  tiempo:  ${Date.now() - started} ms`)
    } catch (error) {
        console.log("conexión fallida")
        console.log(`  error:   ${error.name}`)
        console.log(`  motivo:  ${String(error.message).slice(0, 300)}`)
        console.log(`  tiempo:  ${Date.now() - started} ms`)
        console.log(
            "\nPistas: 'IP that isn't whitelisted' es Network Access en Atlas;" +
                " 'bad auth' son credenciales; 'Missing required environment" +
                " variable' es que MONGO_URI no llegó al proceso."
        )
        process.exitCode = 1
    } finally {
        await disconnectMongo()
    }
}

run()

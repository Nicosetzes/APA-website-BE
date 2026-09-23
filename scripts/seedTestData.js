/*
 * Puebla la base de PRUEBAS con usuarios de prueba.
 *
 * Guardas, en este orden y antes de cualquier escritura:
 *   1. `ALLOW_TEST_SEED=true` explícito.
 *   2. El nombre de la base conectada tiene que pasar el allowlist de
 *      `scripts/testEnvironment.js`: tiene que decir dev/test/staging/qa y no
 *      estar en la lista de bases productivas conocidas.
 *   3. Si ya hay documentos, aborta salvo `ALLOW_TEST_SEED_RESET=true`.
 *
 * `autoIndex` y `autoCreate` quedan desactivados, así requerir los modelos no
 * crea nada antes de que las guardas pasen.
 *
 * Uso:
 *   $env:MONGO_URI="<uri de apa-dev>"; $env:ALLOW_TEST_SEED="true"; npm run seed:test
 */

require("dotenv").config()

const mongoose = require("mongoose")

mongoose.set("autoIndex", false)
mongoose.set("autoCreate", false)

const bcrypt = require("bcrypt")

const {
    connectMongo,
    disconnectMongo,
    getDatabaseStatus,
} = require("../database")
const { TEST_USERS, isTestDatabaseName } = require("./testEnvironment")

const abort = (message) => {
    console.error(`seed abortado: ${message}`)
    process.exitCode = 1
}

const run = async () => {
    if (process.env.ALLOW_TEST_SEED !== "true") {
        return abort(
            "falta ALLOW_TEST_SEED=true. Es deliberado: este script escribe en la base."
        )
    }

    await connectMongo()

    const { name: databaseName } = getDatabaseStatus()
    const host = mongoose.connection.host

    console.log("destino de la escritura")
    console.log(`  base:  ${databaseName}`)
    console.log(`  host:  ${host}`)

    if (!isTestDatabaseName(databaseName)) {
        await disconnectMongo()
        return abort(
            `"${databaseName}" no pasa el allowlist de bases de prueba. No se escribió nada.`
        )
    }

    // Los modelos se requieren recién acá, después de validar el destino.
    const usersModel = require("../dao/models/users")
    const tournamentsModel = require("../dao/models/tournaments")
    const matchesModel = require("../dao/models/matches")
    const editsModel = require("../dao/models/edits")

    const collections = [
        ["users", usersModel],
        ["tournaments", tournamentsModel],
        ["matches", matchesModel],
        ["edits", editsModel],
    ]

    const counts = {}
    for (const [label, model] of collections) {
        counts[label] = await model.countDocuments({})
    }

    console.log(`  estado actual: ${JSON.stringify(counts)}`)

    const hasData = Object.values(counts).some((count) => count > 0)

    if (hasData && process.env.ALLOW_TEST_SEED_RESET !== "true") {
        await disconnectMongo()
        return abort(
            "la base ya tiene documentos. Usá ALLOW_TEST_SEED_RESET=true para vaciarla."
        )
    }

    if (hasData) {
        for (const [label, model] of collections) {
            const { deletedCount } = await model.deleteMany({})
            console.log(`  vaciada ${label}: ${deletedCount} documentos`)
        }
    }

    const createdUsers = []

    for (const user of TEST_USERS) {
        const created = await usersModel.create({
            email: user.email,
            password: await bcrypt.hash(user.password, 10),
            nickname: user.nickname,
            role: user.role,
        })

        createdUsers.push({
            id: String(created._id),
            nickname: created.nickname,
            role: created.role,
        })
    }

    console.log(`\nusuarios creados: ${createdUsers.length}`)
    for (const user of createdUsers) {
        console.log(`  ${user.role.padEnd(10)} ${user.nickname}  id=${user.id}`)
    }

    console.log(
        "\nContraseñas en scripts/testEnvironment.js. Sólo sirven en esta base."
    )
    console.log(
        "Los torneos, fixtures y resultados los crea el smoke de escritura vía API."
    )

    await disconnectMongo()
}

run().catch(async (error) => {
    console.error("el seed falló:", error.message)
    process.exitCode = 1
    await disconnectMongo().catch(() => {})
})

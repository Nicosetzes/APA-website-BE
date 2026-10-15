/*
 * Mide cuánto cuesta leer el historial de partidos para calcular ratings:
 * cuántos documentos y bytes son, cuánto tarda la lectura nueva (liviana, con
 * `.lean()`) contra la anterior (`findAllMatches`) y cuánto el cálculo del motor.
 * Con eso se estima cuántas lecturas completas entran en el tope de
 * transferencia semanal de un cluster gratuito de Atlas.
 *
 *   npm run measure:ratings-read
 *   npm run measure:ratings-read -- --uri-env MONGO_URI_PROD --runs 5
 *
 * SOLO LEE: usa `find`, `estimatedDocumentCount` y `aggregate` con `$match`,
 * `$project` y `$group` (los tamaños se calculan en el servidor con `$bsonSize`,
 * sin traer los documentos). No escribe ni crea índices. Cada corrida trae el
 * historial dos veces (lectura nueva y anterior), unos pocos MB en total.
 *
 * La URI sale de la variable de entorno indicada con `--uri-env` (por defecto
 * `MONGO_URI`) y nunca se imprime; solo el nombre de la base.
 *
 * Los tiempos incluyen la red entre esta máquina y Atlas, así que sirven para
 * comparar lectura nueva contra anterior; la latencia desde Vercel puede ser
 * distinta.
 */

require("dotenv").config()

const {
    FREE_TIER_WEEKLY_OUT_BYTES,
    formatBytes,
    formatMs,
    projectionFromString,
    readsWithinBudget,
    summarizeTimes,
} = require("./lib/readCost")

const DEFAULT_RUNS = 5
const MAX_RUNS = 20

// Proyección que usaba `dao/findAllMatches` antes de la lectura liviana (para
// comparar tamaños). Si cambia ese DAO, esto es solo una referencia histórica.
const LEGACY_PROJECTION =
    "playerP1 teamP1 scoreP1 playerP2 teamP2 scoreP2 outcome tournament type playoff_id playedAt playedAtPrecision"

const parseArguments = (argv) => {
    const valueOf = (flag) => {
        const index = argv.indexOf(flag)
        if (index === -1) return undefined
        const value = argv[index + 1]
        if (!value || value.startsWith("--")) {
            throw new Error(`${flag} necesita un valor`)
        }
        return value
    }

    const runs =
        valueOf("--runs") === undefined
            ? DEFAULT_RUNS
            : Number(valueOf("--runs"))
    if (!Number.isInteger(runs) || runs < 1 || runs > MAX_RUNS) {
        throw new Error(`--runs tiene que ser un entero entre 1 y ${MAX_RUNS}`)
    }

    return { uriEnv: valueOf("--uri-env") ?? "MONGO_URI", runs }
}

const timed = async (action) => {
    const start = performance.now()
    const result = await action()
    return { result, ms: performance.now() - start }
}

const printTimes = (label, values) => {
    const [first, ...rest] = values
    const warm = summarizeTimes(rest)
    const line = warm
        ? `mediana ${formatMs(warm.median)} (min ${formatMs(
              warm.min
          )}, máx ${formatMs(warm.max)})`
        : "sin corridas en caliente (usar --runs 2 o más)"
    console.log(`  ${label.padEnd(34)} primera ${formatMs(first)}; ${line}`)
}

const run = async () => {
    const { uriEnv, runs } = parseArguments(process.argv.slice(2))

    if (process.env[uriEnv] === undefined) {
        console.error(`falta la variable de entorno ${uriEnv}`)
        process.exitCode = 1
        return
    }
    process.env.MONGO_URI = process.env[uriEnv]

    const mongoose = require("mongoose")
    mongoose.set("autoIndex", false)
    mongoose.set("autoCreate", false)

    const { connectMongo, disconnectMongo } = require("../database")
    const matchesModel = require("../dao/models/matches")
    const findRatingMatches = require("../dao/findRatingMatches")
    const findAllMatches = require("../dao/findAllMatches")
    const {
        buildRatingsTimeline,
    } = require("../service/playerRatings/timeline")

    const { RATING_FILTER, RATING_PROJECTION } = findRatingMatches

    // Tamaño BSON en el servidor de lo que devolvería una consulta, sin traerlo.
    const sizeOf = async (projection) => {
        const pipeline = [{ $match: RATING_FILTER }]
        if (projection) {
            pipeline.push({ $project: projectionFromString(projection) })
        }
        pipeline.push({
            $group: {
                _id: null,
                documents: { $sum: 1 },
                totalBytes: { $sum: { $bsonSize: "$$ROOT" } },
                maxBytes: { $max: { $bsonSize: "$$ROOT" } },
            },
        })
        const [row] = await matchesModel.aggregate(pipeline)
        return row ?? { documents: 0, totalBytes: 0, maxBytes: 0 }
    }

    const printSize = (label, size) => {
        const average = size.documents ? size.totalBytes / size.documents : 0
        console.log(
            `  ${label.padEnd(34)} ${formatBytes(size.totalBytes).padStart(
                10
            )} en total, ${Math.round(average)} B por documento (máx ${
                size.maxBytes
            } B)`
        )
    }

    try {
        const connection = await timed(() => connectMongo())
        console.log(
            `Base: ${
                connection.result.name
            } (solo lectura). Conexión: ${formatMs(connection.ms)}`
        )

        const stored = await matchesModel.estimatedDocumentCount()
        const [full, legacy, light] = [
            await sizeOf(null),
            await sizeOf(LEGACY_PROJECTION),
            await sizeOf(RATING_PROJECTION),
        ]

        console.log(`\n== Documentos`)
        console.log(`  en la colección (estimado): ${stored}`)
        console.log(
            `  jugados y válidos (los que lee el rating): ${light.documents}`
        )

        console.log(`\n== Tamaño de la lectura completa del historial`)
        printSize("documentos enteros", full)
        printSize("lectura anterior (findAllMatches)", legacy)
        printSize("lectura liviana (findRatingMatches)", light)
        if (legacy.totalBytes > 0) {
            const share = (light.totalBytes / legacy.totalBytes) * 100
            console.log(`  la liviana pesa ${share.toFixed(0)}% de la anterior`)
        }

        const lightRead = []
        const legacyRead = []
        const compute = []
        let events = 0
        let fetched = 0
        for (let attempt = 0; attempt < runs; attempt += 1) {
            const a = await timed(() => findRatingMatches())
            const b = await timed(() => findAllMatches())
            const c = await timed(async () => buildRatingsTimeline(a.result))
            lightRead.push(a.ms)
            legacyRead.push(b.ms)
            compute.push(c.ms)
            fetched = a.result.length
            events = c.result.events.length
        }

        console.log(
            `\n== Tiempos (${runs} corridas; la primera incluye abrir la conexión y planificar)`
        )
        printTimes("lectura liviana", lightRead)
        printTimes("lectura anterior", legacyRead)
        printTimes("cálculo del motor (en memoria)", compute)
        console.log(
            `  documentos leídos: ${fetched}; eventos de rating: ${events}`
        )

        console.log(
            `\n== Tope semanal de transferencia (Atlas gratuito, 10 GB de salida)`
        )
        for (const [label, size] of [
            ["lectura anterior", legacy],
            ["lectura liviana", light],
        ]) {
            const reads = readsWithinBudget(size.totalBytes)
            console.log(
                `  ${label.padEnd(18)} ${
                    reads === null
                        ? "n/a"
                        : `~${reads} lecturas completas por semana (~${Math.floor(
                              reads / 7
                          )} por día)`
                }`
            )
        }
        console.log(
            `  (cota superior: supone que es el único tráfico, ${formatBytes(
                FREE_TIER_WEEKLY_OUT_BYTES
            )} por ventana)`
        )
        console.log(
            "\nLeer: si las lecturas por día superan por mucho las visitas esperadas a las pantallas con rating, no hace falta cachear todavía."
        )
    } finally {
        await disconnectMongo()
    }
}

run().catch((error) => {
    // Solo el nombre: el mensaje de una conexión fallida puede traer la URI.
    console.error(
        `error: ${error.name === "Error" ? error.message : error.name}`
    )
    process.exitCode = 1
})

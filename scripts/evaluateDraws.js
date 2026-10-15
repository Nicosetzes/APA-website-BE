/*
 * Evalúa el modelo de empate (config/drawModel.js) contra los partidos de liga
 * reales: tasa de empate, qué pasó según qué tan favorito era cada lado,
 * validación cronológica (constante contra forma según paridad contra lo
 * configurado), mejores parámetros y calibración. Sirve para decidir si hay que
 * reajustar `d0` y `k`.
 *
 *   npm run evaluate:draws
 *   npm run evaluate:draws -- --uri-env MONGO_URI_PROD
 *
 * SOLO LEE: una única consulta `find` con `.lean()` vía dao/findRatingMatches.
 * No escribe, no crea índices y NO modifica config/drawModel.js: si los
 * parámetros ajustados difieren, se editan a mano y se sube `version`.
 *
 * La URI sale de la variable de entorno indicada con `--uri-env` (por defecto
 * `MONGO_URI`) y nunca se imprime; solo el nombre de la base.
 */

require("dotenv").config()

const { DRAW_MODEL } = require("../config/drawModel")
const { splitOutcomes } = require("../service/playerRatings/outcomes")
const {
    RANDOM_LOG_LOSS,
    calibrationRows,
    chronologicalValidation,
    drawRate,
    fitConstant,
    fitShape,
    logLoss,
    observedByWindow,
    parseArguments,
    selectLeagueEvents,
} = require("./lib/drawEvaluation")

const pct = (value) =>
    value === null ? "n/a" : `${(value * 100).toFixed(1).replace(".", ",")}%`
const num4 = (value) =>
    value === null ? "n/a" : value.toFixed(4).replace(".", ",")

const printReport = (leagueEvents) => {
    const n = leagueEvents.length
    console.log(`\n== Muestra`)
    console.log(`  partidos de liga (regular): ${n}`)
    console.log(`  tasa de empate: ${pct(drawRate(leagueEvents))}`)
    if (!n) return

    console.log(
        `\n== Qué pasó realmente según qué tan favorito era el favorito (liga)`
    )
    console.log(
        `  duelo     n     gana fav.         empate            gana el otro`
    )
    for (const row of observedByWindow(leagueEvents)) {
        const withError = (rate, error) =>
            row.n ? `${pct(rate)} ±${pct(error)}` : "n/a"
        console.log(
            `  ${row.label.padEnd(10)}${String(row.n).padEnd(6)}${withError(
                row.favouriteWin,
                row.favouriteWinError
            ).padEnd(18)}${withError(row.draw, row.drawError).padEnd(18)}${pct(
                row.other
            )}`
        )
    }

    const validation = chronologicalValidation(leagueEvents, DRAW_MODEL)
    console.log(
        `\n== Validación cronológica (se ajusta con lo anterior y se prueba en el bloque siguiente; bloques ${
            validation.blocks - validation.testBlocks + 1
        } a ${validation.blocks})`
    )
    console.log(
        `  log-loss de tres resultados (menor es mejor; azar = ${num4(
            RANDOM_LOG_LOSS
        )}; n de prueba = ${validation.testSize})`
    )
    console.log(
        `    empate constante (reajustado)      ${num4(validation.constant)}`
    )
    console.log(
        `    según paridad (reajustado)         ${num4(validation.shape)}`
    )
    console.log(
        `    configurado (${DRAW_MODEL.version}: d0 ${DRAW_MODEL.d0}, k ${
            DRAW_MODEL.k
        })  ${num4(validation.configured)}`
    )

    const shape = fitShape(leagueEvents)
    const constant = fitConstant(leagueEvents)
    console.log(`\n== Parámetros con todos los partidos de liga`)
    console.log(
        `  configurado:      d0 ${DRAW_MODEL.d0}, k ${
            DRAW_MODEL.k
        }, log-loss ${num4(logLoss(leagueEvents, DRAW_MODEL))}`
    )
    console.log(
        `  mejor ajuste:     d0 ${shape.d0.toFixed(2)}, k ${
            shape.k
        }, log-loss ${num4(shape.loss)}`
    )
    console.log(
        `  mejor constante:  d0 ${constant.d0.toFixed(3)}, log-loss ${num4(
            constant.loss
        )}`
    )

    console.log(`\n== Calibración del modelo configurado (liga)`)
    console.log(
        `  E fav.    n     empate real  empate modelo  gana fav. real  gana fav. modelo  E medio`
    )
    for (const row of calibrationRows(leagueEvents, DRAW_MODEL)) {
        console.log(
            `  ${row.label.padEnd(10)}${String(row.n).padEnd(6)}${pct(
                row.realDraw
            ).padEnd(13)}${pct(row.modelDraw).padEnd(15)}${pct(
                row.realFavouriteWin
            ).padEnd(16)}${pct(row.modelFavouriteWin).padEnd(18)}${pct(
                row.meanExpected
            )}`
        )
    }

    console.log(
        `\n== Lo que muestra el modelo configurado (gana fav. / empate / gana el otro)`
    )
    for (const expected of [0.5, 0.6, 0.7, 0.8, 0.9]) {
        const { p1Win, draw, p2Win } = splitOutcomes(expected, DRAW_MODEL)
        console.log(
            `  ${Math.round(expected * 100)}/${Math.round(
                (1 - expected) * 100
            )}  ${pct(p1Win)} / ${pct(draw)} / ${pct(p2Win)}`
        )
    }

    console.log(
        `\nconfig/drawModel.js no se modificó. Si el mejor ajuste difiere de lo configurado, editarlo a mano y subir la versión.`
    )
}

const run = async () => {
    const { uriEnv } = parseArguments(process.argv.slice(2))

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
    const findRatingMatches = require("../dao/findRatingMatches")
    const {
        buildRatingsTimeline,
    } = require("../service/playerRatings/timeline")

    try {
        const connection = await connectMongo()
        console.log(`Base: ${connection.name} (solo lectura)`)

        const timeline = buildRatingsTimeline(await findRatingMatches())
        printReport(selectLeagueEvents(timeline.events))
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

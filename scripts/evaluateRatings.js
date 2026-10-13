/*
 * Etapa 0 del rating Elo: mide si el Elo de jugadores predice bien con el
 * historial real y ajusta K y el peso de la goleada.
 *
 * Sólo lee: carga los partidos jugados y calcula en memoria. No escribe nada.
 *
 *   npm run evaluate:ratings
 *
 * Se imprimen únicamente métricas agregadas y el ranking final.
 */

require("dotenv").config()

const mongoose = require("mongoose")

mongoose.set("autoIndex", false)
mongoose.set("autoCreate", false)

const { connectMongo, disconnectMongo } = require("../database")
const findAllMatches = require("../dao/findAllMatches")
const { RATING_CONFIG } = require("../config/ratings")
const {
    calculatePlayerRatings,
    isRateable,
    rankPlayers,
    snapshotBefore,
} = require("../service/playerRatings")
const {
    evaluateEvents,
    summarizeTeamEffect,
    tuneRatingParameters,
} = require("../service/playerRatings/evaluation")

const GRID = {
    kFactor: [2, 4, 6, 8, 12, 16],
    marginWeight: [0, 0.25],
    scale: [400, 500, 600, 800],
}
const MIN_GAMES = 10
const SPLIT_RATIO = 0.7

const fixed = (value, digits = 4) =>
    value === null || value === undefined ? "  n/a " : value.toFixed(digits)
const percent = (value) =>
    value === null || value === undefined
        ? "  n/a"
        : `${(value * 100).toFixed(1)}%`

const printMetrics = (label, metrics) => {
    console.log(`  ${label} (${metrics.matches} partidos evaluados)`)
    console.log(
        `    log-loss ${fixed(metrics.logLoss)}  (azar ${fixed(
            metrics.baselineLogLoss
        )})`
    )
    console.log(
        `    brier    ${fixed(metrics.brier)}  (azar ${fixed(
            metrics.baselineBrier
        )})`
    )
    console.log(
        `    acierta al favorito en ${percent(metrics.favoriteAccuracy)} de ${
            metrics.decisiveMatches
        } partidos con ganador`
    )
}

const run = async () => {
    await connectMongo()
    const matches = Array.from(await findAllMatches())

    const rateable = matches.filter(isRateable)
    const undated = rateable.filter((match) => !match.playedAt).length
    const approximate = rateable.filter(
        (match) =>
            match.playedAtPrecision && match.playedAtPrecision !== "exact"
    ).length

    console.log("== Datos")
    console.log(`  partidos jugados y válidos: ${matches.length}`)
    console.log(`  usables para el rating:    ${rateable.length}`)
    console.log(`  sin fecha:                 ${undated}`)
    console.log(`  con fecha no exacta:       ${approximate}`)

    const { results, best, totalEvents } = tuneRatingParameters(matches, GRID, {
        splitRatio: SPLIT_RATIO,
        minGames: MIN_GAMES,
    })

    if (!best) {
        console.log("\nNo hay partidos suficientes para evaluar.")
        return
    }

    console.log(
        `\n== Grid (se elige con el ${
            SPLIT_RATIO * 100
        }% más antiguo; mínimo ${MIN_GAMES} partidos previos por jugador)`
    )
    console.log("  K     goleada   escala   log-loss train   log-loss test")
    for (const { parameters, train, test } of results) {
        const mark = parameters === best.parameters ? " <" : ""
        console.log(
            `  ${String(parameters.kFactor).padEnd(5)} ${String(
                parameters.marginWeight
            ).padEnd(9)} ${String(parameters.scale).padEnd(8)} ${fixed(
                train.logLoss
            )}           ${fixed(test.logLoss)}${mark}`
        )
    }

    console.log("\n== Mejor combinación")
    console.log(`  ${JSON.stringify(best.parameters)}`)
    console.log(
        `  actual en config/ratings.js: K=${RATING_CONFIG.kFactor}, goleada=${RATING_CONFIG.marginWeight}, escala=${RATING_CONFIG.scale}`
    )
    printMetrics("tramo antiguo (donde se eligió)", best.train)
    printMetrics("tramo reciente (no visto al elegir)", best.test)

    console.log("\n== Calibración en el tramo reciente (lado del favorito)")
    console.log("  esperado     partidos  esperado   real")
    for (const bucket of best.test.calibration) {
        console.log(
            `  ${bucket.from.toFixed(1)}-${bucket.to.toFixed(1)}      ${String(
                bucket.matches
            ).padEnd(9)} ${fixed(bucket.predicted, 3)}    ${fixed(
                bucket.actual,
                3
            )}`
        )
    }

    console.log("\n== Ventaja de lado (puntaje medio del jugador 1)")
    console.log(
        `  ${fixed(best.test.player1AverageScore, 3)} (0.500 = sin ventaja)`
    )

    const final = calculatePlayerRatings(matches)
    const teamEffect = summarizeTeamEffect(final.events, {
        minGames: MIN_GAMES,
        minMatches: 20,
    })
    if (teamEffect) {
        const row = ({ team, matches, meanResidual, z }) =>
            `    ${String(team).padEnd(24)} ${String(matches).padStart(
                4
            )} partidos  residuo ${
                meanResidual >= 0 ? "+" : ""
            }${meanResidual.toFixed(3)}  z ${z >= 0 ? "+" : ""}${z.toFixed(1)}`

        console.log("\n== ¿Importa el equipo? (residuo respecto del Elo)")
        console.log(
            `  equipos distintos: ${teamEffect.distinctTeams}; con 20+ partidos: ${teamEffect.teamsEvaluated}`
        )
        console.log(
            `  con |z| > 2: ${
                teamEffect.flagged
            } (por azar se esperarían ~${teamEffect.expectedByChance.toFixed(
                1
            )})`
        )
        console.log("  rinden por encima de lo esperado:")
        teamEffect.top.forEach((team) => console.log(row(team)))
        console.log("  rinden por debajo de lo esperado:")
        teamEffect.bottom.forEach((team) => console.log(row(team)))
    }

    const ranking = rankPlayers(snapshotBefore(final.events, null, 1500))
    console.log(
        `\n== Ranking con los parámetros de config/ratings.js (${totalEvents} partidos)`
    )
    for (const player of ranking) {
        console.log(
            `  ${String(player.position).padStart(2)}. ${String(
                player.name
            ).padEnd(18)} ${player.rating.toFixed(0)}  (${
                player.matches
            } partidos, ${player.wins}-${player.draws}-${player.losses})`
        )
    }
}

run()
    .catch((error) => {
        console.error(
            `error: ${error.name}: ${String(error.message).slice(0, 300)}`
        )
        process.exitCode = 1
    })
    .finally(disconnectMongo)

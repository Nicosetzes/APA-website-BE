/*
 * Evaluación del APA Rating: mide si el Elo predice bien con el historial real,
 * ajusta K, el peso de la goleada y la escala, compara el peso de la fuerza de
 * equipo (1.0 = peso 0 contra 2.0) y muestra el ranking con la config vigente.
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
    compareTeamStrength,
    evaluateEvents,
    summarizeTeamEffect,
    tuneRatingParameters,
} = require("../service/playerRatings/evaluation")

const GRID = {
    kFactor: [2, 4, 6, 8, 12, 16],
    marginWeight: [0, 0.25],
    scale: [400, 500, 600, 800],
}
// Pesos de la fuerza de equipo a comparar (0 = rating 1.0).
const TEAM_WEIGHTS = [0, 10, 15, 20, 25, 30, 35, 40]
const MIN_GAMES = 10
const SPLIT_RATIO = 0.7

const fixed = (value, digits = 4) =>
    value === null || value === undefined ? "  n/a " : value.toFixed(digits)
const percent = (value) =>
    value === null || value === undefined
        ? "  n/a"
        : `${(value * 100).toFixed(1)}%`

const signed = (value, digits = 4) =>
    `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`

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

// Fuerza de equipo: cobertura de datos, tabla de pesos y 1.0 vs 2.0 sobre los
// mismos partidos evaluables (70/30 cronológico entre ellos, diferencias pareadas).
const printTeamStrength = (matches, events) => {
    const withTeams = events.filter((event) => event.p1.teamOverall !== null)
    console.log("\n== Fuerza de equipo (teamStrengthWeight)")
    console.log(
        `  partidos con overall de ambos equipos: ${withTeams.length} de ${
            events.length
        } (${percent(events.length ? withTeams.length / events.length : null)})`
    )

    const comparison = compareTeamStrength(matches, TEAM_WEIGHTS, {
        splitRatio: SPLIT_RATIO,
        minGames: MIN_GAMES,
    })
    if (!comparison) {
        console.log("  No hay partidos evaluables.")
        return
    }

    console.log(
        `  evaluables: ${comparison.evaluableMatches} (elige con ${comparison.trainMatches} antiguos, mide con ${comparison.testMatches} recientes)`
    )
    console.log(
        "  peso   log-loss todos   train    test     Brier test   favorito test"
    )
    for (const result of comparison.results) {
        const marks = [
            result === comparison.best ? "elegido en train" : null,
            result.weight === RATING_CONFIG.teamStrengthWeight
                ? "config"
                : null,
        ].filter(Boolean)
        console.log(
            `  ${String(result.weight).padEnd(6)} ${fixed(
                result.all.logLoss
            )}           ${fixed(result.train.logLoss)}   ${fixed(
                result.test.logLoss
            )}   ${fixed(result.test.brier)}       ${percent(
                result.test.favoriteAccuracy
            )}${marks.length ? `  < ${marks.join(", ")}` : ""}`
        )
    }

    const legacy = comparison.results.find(({ weight }) => weight === 0)
    const current = comparison.results.find(
        ({ weight }) => weight === RATING_CONFIG.teamStrengthWeight
    )
    if (!legacy || !current) return

    console.log(
        `\n== 1.0 (peso 0) vs ${RATING_CONFIG.version} (peso ${RATING_CONFIG.teamStrengthWeight})`
    )
    console.log("                          1.0       " + RATING_CONFIG.version)
    const row = (label, a, b, format) =>
        console.log(`  ${label.padEnd(24)} ${format(a)}   ${format(b)}`)
    row("log-loss todos", legacy.all.logLoss, current.all.logLoss, fixed)
    row("log-loss test", legacy.test.logLoss, current.test.logLoss, fixed)
    row("Brier todos", legacy.all.brier, current.all.brier, fixed)
    row("Brier test", legacy.test.brier, current.test.brier, fixed)
    row(
        "favorito gana (todos)",
        legacy.all.favoriteAccuracy,
        current.all.favoriteAccuracy,
        percent
    )
    row(
        "favorito gana (test)",
        legacy.test.favoriteAccuracy,
        current.test.favoriteAccuracy,
        percent
    )
    row(
        "prob. media geométrica",
        Math.exp(-legacy.all.logLoss),
        Math.exp(-current.all.logLoss),
        (value) => fixed(value, 3)
    )
    console.log(`  azar (log-loss)          ${fixed(Math.LN2)}`)
    for (const [label, paired] of [
        ["todos", current.pairedAll],
        ["test", current.pairedTest],
    ]) {
        console.log(
            `  mejora de log-loss en ${label}: ${signed(paired.gain)} ± ${fixed(
                paired.standardError
            )} (n=${paired.matches}); mayor que 0 es mejor que 1.0`
        )
    }
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
        `\n== Grid con teamStrengthWeight=${
            RATING_CONFIG.teamStrengthWeight
        } (se elige con el ${
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
    const legacy = calculatePlayerRatings(matches, { teamStrengthWeight: 0 })

    printTeamStrength(matches, final.events)

    const effectOptions = { minGames: MIN_GAMES, minMatches: 20 }
    const teamEffect = summarizeTeamEffect(final.events, effectOptions)
    const legacyEffect = summarizeTeamEffect(legacy.events, effectOptions)
    if (teamEffect) {
        const row = ({ team, matches, meanResidual, z }) =>
            `    ${String(team).padEnd(24)} ${String(matches).padStart(
                4
            )} partidos  residuo ${
                meanResidual >= 0 ? "+" : ""
            }${meanResidual.toFixed(3)}  z ${z >= 0 ? "+" : ""}${z.toFixed(1)}`

        console.log(
            `\n== ¿Importa el equipo? (residuo respecto del Elo con teamStrengthWeight=${RATING_CONFIG.teamStrengthWeight})`
        )
        console.log(
            `  equipos distintos: ${teamEffect.distinctTeams}; con 20+ partidos: ${teamEffect.teamsEvaluated}`
        )
        console.log(
            `  con |z| > 2: ${
                teamEffect.flagged
            } (por azar se esperarían ~${teamEffect.expectedByChance.toFixed(
                1
            )}); con 1.0 (peso 0): ${legacyEffect?.flagged ?? "n/a"}`
        )
        console.log("  rinden por encima de lo esperado:")
        teamEffect.top.forEach((team) => console.log(row(team)))
        console.log("  rinden por debajo de lo esperado:")
        teamEffect.bottom.forEach((team) => console.log(row(team)))
    }

    const initial = RATING_CONFIG.initialRating
    const ranking = rankPlayers(snapshotBefore(final.events, null, initial))
    const legacyRatings = snapshotBefore(legacy.events, null, initial)
    console.log(
        `\n== Ranking con los parámetros de config/ratings.js, versión ${RATING_CONFIG.version} (${totalEvents} partidos)`
    )
    for (const player of ranking) {
        console.log(
            `  ${String(player.position).padStart(2)}. ${String(
                player.name
            ).padEnd(18)} ${player.rating.toFixed(0)}  (${
                player.matches
            } partidos, ${player.wins}-${player.draws}-${
                player.losses
            })  1.0: ${legacyRatings.get(player.id)?.rating.toFixed(0)}`
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

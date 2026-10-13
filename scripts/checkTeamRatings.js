/*
 * Controla la calidad de los datos de fuerza de equipo del APA Rating 2.0.
 *
 *   npm run check:team-ratings
 *   npm run check:team-ratings -- --uri-env MONGO_URI_PROD
 *
 * Sin opciones es offline (no usa base de datos): valida `data/team-ratings.csv`
 * y `data/tournament-editions.csv` y que `data/teamRatings.json` esté
 * sincronizado con ellos. Termina con código 1 si hay errores; los avisos no
 * fallan.
 *
 * Con `--uri-env <VARIABLE>` además se conecta SOLO PARA LEER a la base cuya
 * URI está en esa variable de entorno (nunca se imprime) y lista los torneos sin
 * edición y los pares (equipo, edición) usados en partidos que no tienen rating.
 */

const fs = require("fs")
const { isDeepStrictEqual } = require("util")

const {
    ARTIFACT_PATH,
    buildArtifact,
    readSources,
    validateSources,
} = require("./lib/teamRatingsData")

const JUMP_THRESHOLD = 4

const editionNumber = (edition) => Number(String(edition).slice(-2))

const printEditionSummary = (teamRows) => {
    const editions = new Map()
    for (const row of teamRows) {
        const entry = editions.get(row.edition) ?? { rows: 0, dates: new Map() }
        entry.rows += 1
        entry.dates.set(
            row.capturedAt,
            (entry.dates.get(row.capturedAt) ?? 0) + 1
        )
        editions.set(row.edition, entry)
    }

    console.log("== Equipos por edición")
    const ordered = [...editions].sort(
        ([a], [b]) => editionNumber(a) - editionNumber(b)
    )
    for (const [edition, { rows, dates }] of ordered) {
        const list = [...dates]
            .map(([date, count]) => `${date} x${count}`)
            .join(", ")
        console.log(
            `  ${edition.padEnd(8)} ${String(rows).padStart(
                3
            )} filas; capturedAt: ${list}`
        )
    }
}

// Saltos grandes de overall entre ediciones consecutivas del mismo equipo:
// suelen ser reales (un equipo que sube o baja), pero también delatan un tipeo.
const findJumps = (teamRows) => {
    const byTeam = new Map()
    for (const row of teamRows) {
        if (row.overall === "") continue
        const list = byTeam.get(row.teamId) ?? []
        list.push(row)
        byTeam.set(row.teamId, list)
    }

    const jumps = []
    for (const list of byTeam.values()) {
        list.sort((a, b) => editionNumber(a.edition) - editionNumber(b.edition))
        for (let i = 1; i < list.length; i += 1) {
            const diff = Number(list[i].overall) - Number(list[i - 1].overall)
            if (Math.abs(diff) >= JUMP_THRESHOLD) {
                jumps.push(
                    `${list[i].teamName}: ${list[i - 1].edition} ${
                        list[i - 1].overall
                    } -> ${list[i].edition} ${list[i].overall} (l.${
                        list[i].line
                    })`
                )
            }
        }
    }
    return jumps
}

const checkArtifactSync = (sources) => {
    let committed
    try {
        committed = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8"))
    } catch (error) {
        return `no se pudo leer ${ARTIFACT_PATH} (${error.name}): correr \`npm run build:team-ratings\``
    }
    return isDeepStrictEqual(committed, buildArtifact(sources))
        ? null
        : "data/teamRatings.json está desactualizado respecto de los CSV: correr `npm run build:team-ratings`"
}

const parseArguments = (argv) => {
    const index = argv.indexOf("--uri-env")
    if (index === -1) return { uriEnv: null }
    const name = argv[index + 1]
    if (!name || name.startsWith("--")) {
        throw new Error("--uri-env necesita el nombre de una variable")
    }
    return { uriEnv: name }
}

// Cobertura contra los partidos reales. Solo lecturas (`find`); los módulos de
// base de datos se cargan acá para que el modo offline no conecte nada.
const checkCoverage = async (uriEnv) => {
    require("dotenv").config()
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
    const findAllMatches = require("../dao/findAllMatches")
    const {
        summarizeCoverage,
    } = require("../service/playerRatings/teamStrength")

    try {
        await connectMongo()
        const matches = Array.from(await findAllMatches())
        const coverage = summarizeCoverage(matches)

        const share = coverage.total
            ? ((coverage.covered / coverage.total) * 100).toFixed(1)
            : "0.0"
        console.log(`\n== Cobertura en la base (${uriEnv}, solo lectura)`)
        console.log(
            `  partidos con overall de ambos equipos: ${coverage.covered} de ${coverage.total} (${share}%)`
        )
        console.log(
            `  torneos sin edición: ${coverage.tournamentsWithoutEdition.length}`
        )
        for (const entry of coverage.tournamentsWithoutEdition) {
            console.log(
                `    ${entry.tournamentId} ${entry.name ?? ""} (${
                    entry.matches
                } partidos)`
            )
        }
        console.log(
            `  pares (equipo, edición) usados sin rating: ${coverage.missingPairs.length}`
        )
        for (const entry of coverage.missingPairs) {
            console.log(
                `    ${entry.teamId} ${entry.teamName ?? ""} en ${
                    entry.edition
                } (${entry.matches} partidos)`
            )
        }
    } finally {
        await disconnectMongo()
    }
}

const run = async () => {
    const { uriEnv } = parseArguments(process.argv.slice(2))
    const sources = readSources()
    const { errors, warnings } = validateSources(sources)

    console.log(
        `team-ratings.csv: ${sources.teamRows.length} filas; tournament-editions.csv: ${sources.tournamentRows.length} torneos\n`
    )
    printEditionSummary(sources.teamRows)

    const syncError = checkArtifactSync(sources)
    if (syncError) errors.push(syncError)

    const jumps = findJumps(sources.teamRows)
    console.log(
        `\n== Saltos de overall >= ${JUMP_THRESHOLD} entre ediciones (informativo)`
    )
    if (!jumps.length) console.log("  ninguno")
    for (const jump of jumps) console.log(`  ${jump}`)

    console.log(`\n== Avisos (${warnings.length})`)
    warnings.forEach((warning, index) =>
        console.log(`  ${index + 1}. ${warning}`)
    )
    console.log(`\n== Errores (${errors.length})`)
    errors.forEach((error, index) => console.log(`  ${index + 1}. ${error}`))

    if (errors.length) process.exitCode = 1
    else console.log("\nDatos de fuerza de equipo OK")

    if (!uriEnv) return
    try {
        await checkCoverage(uriEnv)
    } catch (error) {
        // Solo el nombre: el mensaje de una conexión fallida puede traer la URI.
        console.error(`error al leer la base: ${error.name}`)
        process.exitCode = 1
    }
}

run().catch((error) => {
    console.error(`error: ${error.message}`)
    process.exitCode = 1
})

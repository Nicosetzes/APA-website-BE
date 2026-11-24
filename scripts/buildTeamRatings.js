/*
 * Genera `data/teamRatings.json` (lo que carga el APA Rating 2.0 en runtime) a
 * partir de `data/team-ratings.csv`. No toca el CSV ni la base de datos.
 *
 *   npm run build:team-ratings
 *
 * Si el CSV tiene errores no escribe nada y termina con código 1.
 */

const fs = require("fs")

const {
    ARTIFACT_PATH,
    buildArtifact,
    formatArtifact,
    readSources,
    validateSources,
} = require("./lib/teamRatingsData")

const run = () => {
    const sources = readSources()
    const { errors, warnings } = validateSources(sources)

    for (const warning of warnings) console.warn(`aviso: ${warning}`)
    if (errors.length) {
        for (const error of errors) console.error(`error: ${error}`)
        console.error(
            `\n${errors.length} error(es) en el CSV: no se generó ${ARTIFACT_PATH}`
        )
        process.exitCode = 1
        return
    }

    const artifact = buildArtifact(sources)
    fs.writeFileSync(ARTIFACT_PATH, formatArtifact(artifact))

    console.log(`generado ${ARTIFACT_PATH}`)
    console.log(
        `  pares equipo|edición con overall: ${
            Object.keys(artifact.overallByTeamEdition).length
        }`
    )
}

try {
    run()
} catch (error) {
    console.error(`error: ${error.message}`)
    process.exitCode = 1
}

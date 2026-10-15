/*
 * Verifica que los ratings persistidos (`player-ratings` y `rating-events`)
 * coincidan con lo que calcula hoy el motor sobre todos los partidos.
 *
 *   npm run verify:ratings
 *   npm run verify:ratings -- --uri-env MONGO_URI_PROD
 *
 * SOLO LEE: no escribe, no crea índices y no acepta `--apply`. Sale con código
 * 1 si hay drift (faltan, sobran o difieren documentos, o cambió el
 * fingerprint) y 0 si coincide. El arreglo es volver a correr
 * `npm run recompute:ratings -- --apply`.
 *
 * La URI sale de la variable de entorno indicada con `--uri-env` (por defecto
 * `MONGO_URI`) y nunca se imprime; solo el nombre de la base.
 */
require("dotenv").config()
const { main } = require("./lib/ratingsStoreCli")

if (require.main === module) {
    main("verify", process.argv.slice(2)).then((code) => {
        process.exitCode = code
    })
}

module.exports = { main }

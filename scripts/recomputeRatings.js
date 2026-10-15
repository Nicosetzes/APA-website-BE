/*
 * Recalcula los ratings (APA Rating 2.0) con el motor de producción y los
 * compara con las colecciones derivadas `player-ratings` y `rating-events`.
 *
 *   npm run recompute:ratings                                 (dry-run)
 *   npm run recompute:ratings -- --apply                      (escribe)
 *   npm run recompute:ratings -- --uri-env MONGO_URI_PROD
 *
 * DRY-RUN POR DEFECTO: sin `--apply` solo lee y muestra el resumen del diff.
 * Con `--apply` crea los índices de las dos colecciones nuevas, aplica el diff
 * y vuelve a leer para comprobar que no quedó ninguna diferencia. SOLO escribe
 * en `player-ratings` y `rating-events`; `matches` no se toca. En una base que
 * no es de pruebas exige además `--allow-production`.
 *
 * La URI sale de la variable de entorno indicada con `--uri-env` (por defecto
 * `MONGO_URI`) y nunca se imprime; solo el nombre de la base.
 */
require("dotenv").config()
const { main } = require("./lib/ratingsStoreCli")

if (require.main === module) {
    main("recompute", process.argv.slice(2)).then((code) => {
        process.exitCode = code
    })
}

module.exports = { main }

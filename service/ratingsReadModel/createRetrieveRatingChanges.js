const { RATING_CONFIG } = require("../../config/ratings")
const { assessFreshness } = require("../ratingsStore/freshness")

// Variación de rating por partido, leída de los ratings persistidos (los mismos
// que usa la predicción). Devuelve `{ changes }` con un Map matchId ->
// { p1, p2, ratingVersion } si lo guardado está fresco, o `{ stale: <razón> }` si
// no. Un dato viejo NUNCA lanza; lanzan solo las fallas de lectura de los DAOs.
//
// Reglas de frescura idénticas a las de la predicción (`assessFreshness` más la
// huella de cada evento). No hay cálculo en vivo de reemplazo: si lo guardado no
// está al día, la columna queda vacía hasta la próxima sincronización.
//
// Un partido pedido que no tiene evento (por ejemplo uno recién cargado que la
// sincronización todavía no guardó) simplemente no aparece en el Map: los demás
// conservan su valor.
//
// Las tres lecturas salen en paralelo (un solo viaje a la base); si no hay ids
// pedidos no se lee nada.
const roundPoints = (value) => {
    const rounded = Math.round(value * 100) / 100
    // Sin "-0".
    return rounded === 0 ? 0 : rounded
}

const createRetrieveRatingChanges = ({
    findRatingSourceStats,
    findPlayerRatings,
    findRatingChangesByMatchIds,
    getCurrentFingerprint,
    config = RATING_CONFIG,
} = {}) => {
    for (const [name, dependency] of Object.entries({
        findRatingSourceStats,
        findPlayerRatings,
        findRatingChangesByMatchIds,
        getCurrentFingerprint,
    })) {
        if (typeof dependency !== "function") {
            throw new TypeError(`createRetrieveRatingChanges: falta ${name}`)
        }
    }

    return async ({ matchIds = [] } = {}) => {
        const requiredIds = [...new Set(matchIds.map(String))]
        if (requiredIds.length === 0) return { changes: new Map() }

        const [currentSourceStats, players, events] = await Promise.all([
            findRatingSourceStats(),
            findPlayerRatings(config.version),
            findRatingChangesByMatchIds(config.version, requiredIds),
        ])
        const currentFingerprint = await getCurrentFingerprint()
        const freshness = assessFreshness({
            players,
            currentFingerprint,
            currentSourceStats,
            ratingVersion: config.version,
        })
        if (!freshness.fresh) return { stale: freshness.reason }
        if (events.some((event) => event.fingerprint !== currentFingerprint)) {
            return { stale: "fingerprint_mismatch" }
        }

        const changes = new Map()
        for (const event of events) {
            if (
                typeof event.delta !== "number" ||
                !Number.isFinite(event.delta)
            ) {
                continue
            }
            const p1 = roundPoints(event.delta)
            changes.set(String(event.matchId), {
                p1,
                p2: p1 === 0 ? 0 : -p1,
                ratingVersion: config.version,
            })
        }
        return { changes }
    }
}

module.exports = { createRetrieveRatingChanges, roundPoints }

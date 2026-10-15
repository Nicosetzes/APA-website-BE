const { RATING_CONFIG } = require("../../config/ratings")
const { assessFreshness } = require("../ratingsStore/freshness")
const { defaultTeamStrength } = require("../playerRatings/teamStrength")
const { buildStoredPredictionIndex } = require("./buildStoredPredictionIndex")
// Lector del índice de predicción guardado. Devuelve `{ index }` si lo guardado
// está fresco y completo para los partidos pedidos, o `{ stale: <razón> }` si hay
// que usar el camino en vivo. Un dato viejo NUNCA lanza: lanzan solo las fallas
// de lectura (los DAOs) y los datos guardados malformados (el adaptador valida
// tipos); el que decora las registra como error y calcula en vivo.
//
// Lecturas: `findRatingSourceStats`, `findPlayerRatings` y, si hay ids pedidos,
// `findRatingEventsByMatchIds`, las tres en paralelo (un solo viaje a la base).
// Si lo guardado resulta viejo, el resultado de los eventos se descarta.
//
// `matchIds` son los partidos jugados que EXIGEN evento guardado (los que el
// motor rateó). La razón `missing_event` es de este servicio, no de
// `assessFreshness`; `fingerprint_mismatch` también puede venir de un evento
// con huella distinta (apply parcial entre las dos colecciones).
const createRetrieveStoredPredictionIndex = ({
    findRatingSourceStats,
    findPlayerRatings,
    findRatingEventsByMatchIds,
    getCurrentFingerprint,
    config = RATING_CONFIG,
    lookup = defaultTeamStrength,
} = {}) => {
    for (const [name, dependency] of Object.entries({
        findRatingSourceStats,
        findPlayerRatings,
        findRatingEventsByMatchIds,
        getCurrentFingerprint,
    })) {
        if (typeof dependency !== "function") {
            throw new TypeError(
                `createRetrieveStoredPredictionIndex: falta ${name}`
            )
        }
    }
    return async ({ matchIds = [] } = {}) => {
        const requiredIds = [...new Set(matchIds.map(String))]
        // Las tres lecturas salen juntas: el costo dominante es el viaje de ida
        // y vuelta a la base, así que esperar la frescura antes de pedir los
        // eventos sumaría un viaje entero. Si lo guardado resulta viejo, la
        // consulta de eventos se descarta (es chica).
        const [currentSourceStats, players, events] = await Promise.all([
            findRatingSourceStats(),
            findPlayerRatings(config.version),
            requiredIds.length === 0
                ? []
                : findRatingEventsByMatchIds(config.version, requiredIds),
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
        const found = new Set(events.map((event) => String(event.matchId)))
        if (requiredIds.some((id) => !found.has(id))) {
            return { stale: "missing_event" }
        }
        return {
            index: buildStoredPredictionIndex({
                players,
                events,
                config,
                lookup,
            }),
        }
    }
}

module.exports = { createRetrieveStoredPredictionIndex }

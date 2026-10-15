const ratingEventsModel = require("./../models/ratingEvents.js")
const { toObjectIds } = require("../findRatingEventsByMatchIds")

// Variación de rating guardada de los partidos pedidos: solo el `delta` (puntos
// que pasan hacia el jugador 1; el jugador 2 recibe lo opuesto) y la huella, para
// detectar un apply parcial entre colecciones. `.lean()`. Es una consulta aparte
// de `findRatingEventsByMatchIds` para no tocar su proyección, que es la que
// lee la predicción.
const RATING_CHANGES_PROJECTION = "matchId delta fingerprint -_id"

const findRatingChangesByMatchIds = async (
    ratingVersion,
    ids,
    { model = ratingEventsModel } = {}
) => {
    if (typeof ratingVersion !== "string" || !ratingVersion.trim()) {
        throw new Error("findRatingChangesByMatchIds: falta ratingVersion")
    }
    const objectIds = toObjectIds(ids)
    // Sin ids válidos no se consulta la base.
    if (objectIds.length === 0) return []
    return model
        .find(
            { ratingVersion, matchId: { $in: objectIds } },
            RATING_CHANGES_PROJECTION
        )
        .lean()
}

module.exports = findRatingChangesByMatchIds
module.exports.RATING_CHANGES_PROJECTION = RATING_CHANGES_PROJECTION

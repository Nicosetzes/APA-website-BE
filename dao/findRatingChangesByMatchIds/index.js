const ratingEventsModel = require("./../models/ratingEvents.js")
const { toObjectIds } = require("../findRatingEventsByMatchIds")

// Datos agregables de rating de los partidos pedidos. `delta` alimenta la
// variación por partido; expected/result y los ids permiten comparar esperado
// contra real en un cara a cara sin enviar eventos al cliente. La huella detecta
// un apply parcial entre colecciones. `.lean()`. Es una consulta aparte de
// `findRatingEventsByMatchIds` para no tocar la proyección de predicciones.
const RATING_CHANGES_PROJECTION =
    "matchId delta expectedP1 resultP1 p1.id p2.id fingerprint -_id"

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

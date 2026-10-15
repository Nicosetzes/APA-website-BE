const mongoose = require("mongoose")
const ratingEventsModel = require("./../models/ratingEvents.js")
// Eventos guardados de los partidos pedidos, con EXACTAMENTE lo que lee la
// predicción (`expectedP1`, `p1.games`, `p1.teamOverall`, `p2.games`) más la
// huella, para detectar un apply parcial entre colecciones. `.lean()`.
const RATING_EVENTS_PROJECTION =
    "matchId expectedP1 p1.games p1.teamOverall p2.games fingerprint -_id"
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i
// Cast seguro: solo strings de 24 hex o ObjectId reales. Cualquier otra cosa se
// ignora (nunca llega a Mongoose, que lanzaría un CastError). Sin duplicados.
const toObjectIds = (ids) => {
    const byHex = new Map()
    for (const id of Array.isArray(ids) ? ids : []) {
        let objectId = null
        if (id instanceof mongoose.Types.ObjectId) objectId = id
        else if (typeof id === "string" && OBJECT_ID_PATTERN.test(id)) {
            objectId = new mongoose.Types.ObjectId(id)
        }
        if (objectId !== null) byHex.set(objectId.toHexString(), objectId)
    }
    return [...byHex.values()]
}
const findRatingEventsByMatchIds = async (
    ratingVersion,
    ids,
    { model = ratingEventsModel } = {}
) => {
    if (typeof ratingVersion !== "string" || !ratingVersion.trim()) {
        throw new Error("findRatingEventsByMatchIds: falta ratingVersion")
    }
    const objectIds = toObjectIds(ids)
    // Sin ids válidos no se consulta la base.
    if (objectIds.length === 0) return []
    return model
        .find(
            { ratingVersion, matchId: { $in: objectIds } },
            RATING_EVENTS_PROJECTION
        )
        .lean()
}
module.exports = findRatingEventsByMatchIds
module.exports.RATING_EVENTS_PROJECTION = RATING_EVENTS_PROJECTION
module.exports.toObjectIds = toObjectIds

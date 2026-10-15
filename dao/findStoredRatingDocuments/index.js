// Documentos de ratings persistidos de una `ratingVersion` (docs completos, sin
// proyección). `.lean()`: se comparan contra lo recalculado, no se modifican.
//
// Los modelos se cargan recién al llamar (o se inyectan, para tests): importar
// este archivo no registra ningún modelo en mongoose. Todavía no se exporta
// desde dao/index.js.
const findStoredRatingDocuments = async (
    ratingVersion,
    { playersModel, eventsModel } = {}
) => {
    if (typeof ratingVersion !== "string" || !ratingVersion.trim()) {
        throw new Error("findStoredRatingDocuments: falta ratingVersion")
    }
    const players = playersModel ?? require("../models/playerRatings")
    const events = eventsModel ?? require("../models/ratingEvents")
    const [storedEvents, storedPlayers] = await Promise.all([
        events.find({ ratingVersion }).lean(),
        players.find({ ratingVersion }).lean(),
    ])
    return { events: storedEvents, players: storedPlayers }
}

module.exports = findStoredRatingDocuments

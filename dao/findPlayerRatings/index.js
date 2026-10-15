const playerRatingsModel = require("./../models/playerRatings.js")
// Estado guardado de cada jugador para una `ratingVersion`, con solo lo que usa
// el read-model: la versión, el rating y los partidos (snapshot), la huella y el
// `source` (frescura). `.lean()`: objetos planos, es una lectura de solo lectura.
const PLAYER_RATINGS_PROJECTION =
    "ratingVersion id rating matches fingerprint source -_id"
const findPlayerRatings = async (
    ratingVersion,
    { model = playerRatingsModel } = {}
) => {
    if (typeof ratingVersion !== "string" || !ratingVersion.trim()) {
        throw new Error("findPlayerRatings: falta ratingVersion")
    }
    return model.find({ ratingVersion }, PLAYER_RATINGS_PROJECTION).lean()
}
module.exports = findPlayerRatings
module.exports.PLAYER_RATINGS_PROJECTION = PLAYER_RATINGS_PROJECTION

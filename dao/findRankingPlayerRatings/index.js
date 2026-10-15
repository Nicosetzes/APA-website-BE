const playerRatingsModel = require("./../models/playerRatings.js")

// Estado guardado de cada jugador con TODO lo que muestra el ranking
// (`GET /api/ratings`) más lo que necesita el chequeo de frescura (`fingerprint`
// y `source`). Es una consulta aparte de `findPlayerRatings` para no tocar su
// proyección, que es la que lee la predicción. `.lean()`: solo lectura.
const RANKING_PLAYER_RATINGS_PROJECTION =
    "ratingVersion id name rating peak matches wins draws losses lastPlayedAt lastChange fingerprint source -_id"

const findRankingPlayerRatings = async (
    ratingVersion,
    { model = playerRatingsModel } = {}
) => {
    if (typeof ratingVersion !== "string" || !ratingVersion.trim()) {
        throw new Error("findRankingPlayerRatings: falta ratingVersion")
    }
    return model
        .find({ ratingVersion }, RANKING_PLAYER_RATINGS_PROJECTION)
        .lean()
}

module.exports = findRankingPlayerRatings
module.exports.RANKING_PLAYER_RATINGS_PROJECTION =
    RANKING_PLAYER_RATINGS_PROJECTION

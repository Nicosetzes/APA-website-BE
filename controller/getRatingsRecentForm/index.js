const { createPeriodSource } = require("../getRatingsPeriod/periodSource")
const {
    buildRecentFormPayload,
} = require("../../service/playerRatings/recentForm")

// GET /api/ratings/recent-form: ventanas globales de los últimos 5, 10 y 25
// partidos rateables propios de cada jugador. Reutiliza el historial persistido
// cuando está fresco y cae al cálculo en vivo según las reglas del read model.
const createGetRatingsRecentForm = (dependencies = {}) => {
    const readPeriod = createPeriodSource(dependencies)

    return async (req, res) => {
        const source = await readPeriod({
            allTime: true,
            endpoint: "ratings_recent_form",
        })

        return res.json(buildRecentFormPayload(source))
    }
}

const getRatingsRecentForm = createGetRatingsRecentForm()

module.exports = getRatingsRecentForm
module.exports.createGetRatingsRecentForm = createGetRatingsRecentForm

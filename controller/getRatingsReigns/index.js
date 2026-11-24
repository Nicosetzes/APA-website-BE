const { createPeriodSource } = require("../getRatingsPeriod/periodSource")
const { buildReignsPayload } = require("../../service/playerRatings/leadership")

// GET /api/ratings/reigns: reinados en el #1 del Rating APA en toda la
// historia (reglas en `service/playerRatings/leadership.js`). Lee todo el
// historial por el mismo camino que el historial por torneo (`allTime`: lo
// guardado si está fresco, si no en vivo), con los datos de partido del evento
// (`includeHistory`: equipos, tanda y precisión de la fecha) para mostrar el
// partido en que empieza y en que termina cada reinado.
const createGetRatingsReigns = (dependencies = {}) => {
    const readPeriod = createPeriodSource(dependencies)

    return async (req, res) => {
        const { config, names, previousRanking, periodEvents } =
            await readPeriod({
                allTime: true,
                endpoint: "ratings_reigns",
                includeHistory: true,
            })

        return res.json(
            buildReignsPayload({
                previousRanking,
                periodEvents,
                config,
                names,
            })
        )
    }
}

const getRatingsReigns = createGetRatingsReigns()

module.exports = getRatingsReigns
module.exports.createGetRatingsReigns = createGetRatingsReigns

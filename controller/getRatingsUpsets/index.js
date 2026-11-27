const { createPeriodSource } = require("../getRatingsPeriod/periodSource")
const {
    buildGlobalUpsetsPayload,
} = require("../../service/playerRatings/globalUpsets")

// GET /api/ratings/upsets: ranking global de victorias sorpresivas. Lee una
// sola vez todo el historial rateable, desde el read model fresco o desde el
// timeline vivo, y aplica filtros y límite en memoria.
const createGetRatingsUpsets = (dependencies = {}) => {
    const readPeriod = createPeriodSource(dependencies)

    return async (req, res) => {
        const source = await readPeriod({
            allTime: true,
            includeHistory: true,
            endpoint: "ratings_upsets",
        })

        return res.json(
            buildGlobalUpsetsPayload({
                ...source,
                ...req.query,
            })
        )
    }
}

const getRatingsUpsets = createGetRatingsUpsets()

module.exports = getRatingsUpsets
module.exports.createGetRatingsUpsets = createGetRatingsUpsets

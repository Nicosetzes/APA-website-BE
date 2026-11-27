const { createPeriodSource } = require("../getRatingsPeriod/periodSource")
const {
    buildTournamentComparisonsPayload,
} = require("../../service/playerRatings/tournaments")

// GET /api/ratings/tournaments: actuaciones jugador-torneo agregadas sobre todo
// el historial rateable. Reutiliza el read model fresco y cae al cálculo vivo
// sin consultar partidos ni torneos por cada actuación.
const createGetRatingsTournaments = (dependencies = {}) => {
    const readPeriod = createPeriodSource(dependencies)

    return async (req, res) => {
        const source = await readPeriod({
            allTime: true,
            includeHistory: true,
            endpoint: "ratings_tournaments",
        })

        return res.json(buildTournamentComparisonsPayload(source))
    }
}

const getRatingsTournaments = createGetRatingsTournaments()

module.exports = getRatingsTournaments
module.exports.createGetRatingsTournaments = createGetRatingsTournaments

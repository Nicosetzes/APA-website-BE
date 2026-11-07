const { createPeriodSource } = require("../getRatingsPeriod/periodSource")
const { buildHistoryPayload } = require("../../service/playerRatings/history")

// GET /api/ratings/history: cómo se movió el rating de cada jugador partido a
// partido en un período. Lee el período igual que `/api/ratings/period` (lo
// guardado si está fresco, si no en vivo) y arma un punto por partido.
//
// Todo lo que lleva cada punto sale del evento y no de los partidos: el tipo de
// cruce (`kind`, para la probabilidad previa de ganar o de avanzar), la tanda de
// penales y nombre e id de cada equipo (`teams`, con el id para el escudo). El
// camino guardado los pide a `rating-events` (`includeHistory`); el camino en
// vivo los trae en los eventos del motor. Un evento guardado sin esos datos
// (o con datos inválidos) da `null` para ese dato: la respuesta nunca falla por
// eso y el endpoint no consulta partidos.
const createGetRatingsHistory = (dependencies = {}) => {
    const readPeriod = createPeriodSource(dependencies)

    return async (req, res) => {
        const { dateFrom, dateTo, players } = req.query
        const source = await readPeriod({
            dateFrom,
            dateTo,
            endpoint: "ratings_history",
            includeHistory: true,
        })

        return res.json(
            buildHistoryPayload({
                ...source,
                dateFrom,
                dateTo,
                playerIds: players,
            })
        )
    }
}

const getRatingsHistory = createGetRatingsHistory()

module.exports = getRatingsHistory
module.exports.createGetRatingsHistory = createGetRatingsHistory

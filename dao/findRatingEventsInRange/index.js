const ratingEventsModel = require("./../models/ratingEvents.js")

// Consulta A de `GET /api/ratings/period`: los eventos guardados cuyo `time`
// cae en el período `[start, end)`, en el orden del motor (`seq`). Proyección
// mínima: lo que hace falta para el récord de cada jugador, la sorpresa del
// período y el estado de cada jugador en `start` (`before` y `games` de su
// primer evento), más la huella para detectar un apply parcial. Deja afuera
// `after`, `team`, `teamOverall`, `teamAdjustment`, `computedAt` y
// `ratingVersion`. Los eventos sin `time` nunca entran (un `null` no cumple
// `$gte`). `.lean()`: solo lectura.
//
// `GET /api/ratings/history` pide además lo que el evento guarda del partido
// (`includeHistory`): nombre e id del equipo de cada lado, el tipo de cruce
// (`kind`) y la tanda de penales (`shootoutP1`/`shootoutP2`). Así el historial
// no lee partidos. Sin esa opción la proyección es la de siempre, así que
// `/api/ratings/period` no cambia.
const RATING_EVENTS_RANGE_PROJECTION =
    "seq time matchId tournament type scoreP1 scoreP2 expectedP1 resultP1 delta p1.id p1.name p1.before p1.games p2.id p2.name p2.before p2.games fingerprint -_id"
const RATING_EVENTS_HISTORY_PROJECTION = `${RATING_EVENTS_RANGE_PROJECTION} p1.team p1.teamId p2.team p2.teamId kind shootoutP1 shootoutP2`

const isValidDate = (value) =>
    value instanceof Date && !Number.isNaN(value.getTime())

const findRatingEventsInRange = async (
    ratingVersion,
    start,
    end,
    { model = ratingEventsModel, includeHistory = false } = {}
) => {
    if (typeof ratingVersion !== "string" || !ratingVersion.trim()) {
        throw new Error("findRatingEventsInRange: falta ratingVersion")
    }
    if (!isValidDate(start) || !isValidDate(end)) {
        throw new Error(
            "findRatingEventsInRange: start y end tienen que ser Date válidas"
        )
    }
    if (start.getTime() >= end.getTime()) {
        throw new Error("findRatingEventsInRange: start tiene que ser < end")
    }

    return model
        .find(
            { ratingVersion, time: { $gte: start, $lt: end } },
            includeHistory
                ? RATING_EVENTS_HISTORY_PROJECTION
                : RATING_EVENTS_RANGE_PROJECTION
        )
        .sort({ seq: 1 })
        .lean()
}

module.exports = findRatingEventsInRange
module.exports.RATING_EVENTS_RANGE_PROJECTION = RATING_EVENTS_RANGE_PROJECTION
module.exports.RATING_EVENTS_HISTORY_PROJECTION =
    RATING_EVENTS_HISTORY_PROJECTION

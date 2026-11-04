const ratingEventsModel = require("./../models/ratingEvents.js")

// Consulta B de `GET /api/ratings/period`: el borde posterior al período. Sobre
// los eventos con `time >= end` devuelve UNA fila por jugador (no la cola
// entera):
//   - `first`: su primer evento posterior a `end` (`seq`, `name`, `before`,
//     `games`). Su `before`/`games` son el estado del jugador en `end`.
//   - `last`: su último evento (`seq`, `before`, `games`, `delta`, `sign`), para
//     validar que la cadena termina en el estado guardado de `player-ratings`.
//     `sign` es 1 si fue `p1` y -1 si fue `p2`: el rating después del evento es
//     `before + sign * delta`.
//   - `count` y `fingerprints` (set) de todos sus eventos posteriores a `end`,
//     para chequear huecos y huellas de TODA la cola sin traerla.
// El `$project` va antes del `$sort` para ordenar documentos chicos, y el
// `$sort` por `seq` va antes de `$unwind` y `$group` para que `$first`/`$last`
// respeten el orden del motor. El filtro usa el índice
// `(ratingVersion, time, seq)`. No lleva `allowDiskUse`: se ordena solo la cola
// proyectada.
const buildBoundaryPipeline = (ratingVersion, end) => [
    { $match: { ratingVersion, time: { $gte: end } } },
    {
        $project: {
            _id: 0,
            seq: 1,
            delta: 1,
            fingerprint: 1,
            sides: [
                {
                    id: "$p1.id",
                    name: "$p1.name",
                    before: "$p1.before",
                    games: "$p1.games",
                    sign: { $literal: 1 },
                },
                {
                    id: "$p2.id",
                    name: "$p2.name",
                    before: "$p2.before",
                    games: "$p2.games",
                    sign: { $literal: -1 },
                },
            ],
        },
    },
    { $sort: { seq: 1 } },
    { $unwind: "$sides" },
    {
        $group: {
            _id: "$sides.id",
            count: { $sum: 1 },
            fingerprints: { $addToSet: "$fingerprint" },
            first: {
                $first: {
                    seq: "$seq",
                    name: "$sides.name",
                    before: "$sides.before",
                    games: "$sides.games",
                },
            },
            last: {
                $last: {
                    seq: "$seq",
                    before: "$sides.before",
                    games: "$sides.games",
                    delta: "$delta",
                    sign: "$sides.sign",
                },
            },
        },
    },
    {
        $project: {
            _id: 0,
            id: "$_id",
            count: 1,
            fingerprints: 1,
            first: 1,
            last: 1,
        },
    },
    { $sort: { id: 1 } },
]

const isValidDate = (value) =>
    value instanceof Date && !Number.isNaN(value.getTime())

const findRatingBoundaryEvents = async (
    ratingVersion,
    end,
    { model = ratingEventsModel } = {}
) => {
    if (typeof ratingVersion !== "string" || !ratingVersion.trim()) {
        throw new Error("findRatingBoundaryEvents: falta ratingVersion")
    }
    if (!isValidDate(end)) {
        throw new Error("findRatingBoundaryEvents: end tiene que ser una Date")
    }

    const rows = await model.aggregate(
        buildBoundaryPipeline(ratingVersion, end)
    )
    if (!Array.isArray(rows)) {
        throw new Error("findRatingBoundaryEvents: respuesta inválida")
    }
    return rows
}

module.exports = findRatingBoundaryEvents
module.exports.buildBoundaryPipeline = buildBoundaryPipeline

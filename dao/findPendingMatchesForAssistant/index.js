const matchesModel = require("./../models/matches.js")

const PROJECTION =
    "tournament type group playoff_id leg playerP1 teamP1 playerP2 teamP2"

// Armado aparte para poder probar la forma exacta de la consulta.
//
// - `involving`: participa al menos uno de los jugadores. Incluye los cruces de
//   playoff con un solo lado asignado, que el servicio informa aparte.
// - `among`: los dos lados son jugadores del grupo.
// Sin jugadores no se filtra por jugador (pendientes de todos).
const buildPendingFilter = ({ tournamentIds, stage, playerIds, scope }) => {
    const conditions = [
        { "tournament.id": { $in: tournamentIds } },
        { played: false },
        { valid: { $ne: false } },
    ]

    if (stage) conditions.push({ type: stage })

    if (playerIds?.length) {
        conditions.push(
            scope === "among"
                ? {
                      "playerP1.id": { $in: playerIds },
                      "playerP2.id": { $in: playerIds },
                  }
                : {
                      $or: [
                          { "playerP1.id": { $in: playerIds } },
                          { "playerP2.id": { $in: playerIds } },
                      ],
                  }
        )
    }

    return { $and: conditions }
}

// Una sola lectura para todos los torneos pedidos: los pendientes de los
// torneos activos son pocos (cientos), así que el servicio ordena, corta y
// cuenta en memoria en lugar de consultar por torneo.
const findPendingMatchesForAssistant = async (filters) =>
    Array.from(
        await matchesModel.find(buildPendingFilter(filters), PROJECTION).lean()
    )

module.exports = findPendingMatchesForAssistant
module.exports.buildPendingFilter = buildPendingFilter
module.exports.PROJECTION = PROJECTION

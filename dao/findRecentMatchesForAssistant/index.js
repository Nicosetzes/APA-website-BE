const matchesModel = require("./../models/matches.js")
const { PROJECTION } = require("../findHeadToHeadMatchesForAssistant")

// Partidos jugados de un jugador, contra cualquier rival y de cualquier lado.
// Incluye los `valid: false`: el servicio los separa para poder informar
// cuántos se dejaron afuera. `played: {$ne: false}` es el mismo criterio de
// "jugado" que `GET /api/matches` (los partidos históricos pueden no tener el
// campo). `stage` y `tournamentId` acotan la lista a una etapa o a un torneo.
const buildRecentMatchesFilter = ({ player, stage, tournamentId }) => {
    const conditions = [
        { played: { $ne: false } },
        { $or: [{ "playerP1.id": player }, { "playerP2.id": player }] },
    ]

    if (stage) conditions.push({ type: stage })
    if (tournamentId) conditions.push({ "tournament.id": tournamentId })

    return { $and: conditions }
}

// Solo los partidos de ese jugador (como mucho unos cientos), nunca todos los
// de la base. El orden y el recorte los hace el servicio con el mismo criterio
// de fecha que el cara a cara.
const findRecentMatchesForAssistant = async (filters) =>
    Array.from(
        await matchesModel
            .find(buildRecentMatchesFilter(filters), PROJECTION)
            .lean()
    )

module.exports = findRecentMatchesForAssistant
module.exports.buildRecentMatchesFilter = buildRecentMatchesFilter
module.exports.PROJECTION = PROJECTION

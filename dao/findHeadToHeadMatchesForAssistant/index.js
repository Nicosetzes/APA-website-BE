const matchesModel = require("./../models/matches.js")

const PROJECTION =
    "tournament type group playoff_id leg playerP1 teamP1 scoreP1 playerP2 teamP2 scoreP2 outcome valid playedAt playedAtPrecision"

// Partidos jugados entre dos jugadores, en cualquier orden de lados. Incluye
// los `valid: false`: el servicio los separa para poder informar cuántos se
// dejaron afuera. `played: {$ne: false}` es el mismo criterio de "jugado" que
// `GET /api/matches` (los partidos históricos pueden no tener el campo).
// `stage` y `tournamentId` acotan el cruce a una etapa o a un torneo.
const buildHeadToHeadFilter = ({ playerA, playerB, stage, tournamentId }) => {
    const conditions = [
        { played: { $ne: false } },
        {
            $or: [
                { "playerP1.id": playerA, "playerP2.id": playerB },
                { "playerP1.id": playerB, "playerP2.id": playerA },
            ],
        },
    ]

    if (stage) conditions.push({ type: stage })
    if (tournamentId) conditions.push({ "tournament.id": tournamentId })

    return { $and: conditions }
}

// Solo los partidos del par (como mucho unos cientos), nunca todos los de la
// base como el cara a cara de todos contra todos.
const findHeadToHeadMatchesForAssistant = async (filters) =>
    Array.from(
        await matchesModel
            .find(buildHeadToHeadFilter(filters), PROJECTION)
            .lean()
    )

module.exports = findHeadToHeadMatchesForAssistant
module.exports.buildHeadToHeadFilter = buildHeadToHeadFilter
module.exports.PROJECTION = PROJECTION

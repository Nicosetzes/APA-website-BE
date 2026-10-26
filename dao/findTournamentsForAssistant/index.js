const tournamentsModel = require("./../models/tournaments.js")
const { byStart } = require("../findTournaments")

const PROJECTION =
    "name format playoffMode ongoing valid startedAt startedAtPrecision"

// Mismo criterio de "activo" que `GET /api/tournaments?status=active`.
const ACTIVE_FILTER = { ongoing: true, valid: { $ne: false } }

// Sin ids, los torneos activos del más nuevo al más viejo. Con `tournamentId`,
// ese torneo esté activo o no (el servicio decide qué hacer con uno cerrado);
// una lista vacía significa que no existe. Con `tournamentIds`, esos torneos,
// activos o no.
const findTournamentsForAssistant = async ({
    tournamentId,
    tournamentIds,
} = {}) => {
    let filter = ACTIVE_FILTER
    if (tournamentId) filter = { _id: tournamentId }
    else if (tournamentIds) filter = { _id: { $in: tournamentIds } }

    const tournaments = await tournamentsModel.find(filter, PROJECTION).lean()

    return Array.from(tournaments).sort(byStart("desc"))
}

module.exports = findTournamentsForAssistant
module.exports.ACTIVE_FILTER = ACTIVE_FILTER
module.exports.PROJECTION = PROJECTION

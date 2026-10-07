const tournamentsModel = require("./../models/tournaments.js")

// Lectura liviana para las rachas por torneo de /api/statistics: sólo los
// campos que usan, sin hidratar documentos. Son pocos torneos y no hay filtro:
// `valid` y `ongoing` se evalúan en el dominio.
const STATISTICS_FIELDS =
    "name format playoffMode ongoing startedAt startedAtPrecision closedAt closedAtPrecision players outcome legacy valid"

const findTournamentsForStatistics = async () =>
    tournamentsModel.find({}, STATISTICS_FIELDS).lean()

module.exports = findTournamentsForStatistics

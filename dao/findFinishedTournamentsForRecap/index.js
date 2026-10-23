const tournamentsModel = require("./../models/tournaments.js")

const PROJECTION = "name format playoffMode outcome closedAt closedAtPrecision"

const FILTER = {
    ongoing: false,
    valid: { $ne: false },
    legacy: { $ne: true },
    "outcome.champion.player.id": { $exists: true, $ne: null },
}

const findFinishedTournamentsForRecap = async () =>
    tournamentsModel.find(FILTER, PROJECTION).lean()

module.exports = findFinishedTournamentsForRecap
module.exports.FILTER = FILTER
module.exports.PROJECTION = PROJECTION

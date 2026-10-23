const tournamentRecapsModel = require("./../models/tournamentRecaps.js")

const findTournamentRecapIds = async () =>
    tournamentRecapsModel.distinct("tournamentId")

module.exports = findTournamentRecapIds

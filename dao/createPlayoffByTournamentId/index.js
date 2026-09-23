const matchesModel = require("./../models/matches.js")

const createPlayoffByTournamentId = async (matches, options = {}) => {
    return matchesModel.insertMany(matches, options)
}

module.exports = createPlayoffByTournamentId

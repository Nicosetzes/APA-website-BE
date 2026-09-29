const matchesModel = require("./../models/matches.js")

const createPlayinByTournamentId = async (matches, options = {}) => {
    return matchesModel.insertMany(matches, options)
}

module.exports = createPlayinByTournamentId

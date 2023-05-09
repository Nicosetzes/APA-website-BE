const matchesModel = require("./../models/matches.js")

const createPlayinByTournamentId = async (matches) => {
    const newMatches = await matchesModel.insertMany(matches)
    return newMatches
}

module.exports = createPlayinByTournamentId

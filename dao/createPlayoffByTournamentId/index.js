const matchesModel = require("./../models/matches.js")

const createPlayoffByTournamentId = async (matches) => {
    const newMatches = await matchesModel.insertMany(matches)
    return newMatches
}

module.exports = createPlayoffByTournamentId

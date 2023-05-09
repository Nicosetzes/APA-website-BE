const matchesModel = require("./../models/matches.js")

const createFixtureByTournamentId = async (matches) => {
    const newMatches = await matchesModel.insertMany(matches)
    return newMatches
}

module.exports = createFixtureByTournamentId

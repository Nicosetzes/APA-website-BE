const matchesModel = require("./../models/matches.js")

const createManyMatches = async (matchesToBePlayed) => {
    const newMatches = await matchesModel.insertMany(matchesToBePlayed)
    return newMatches
}

module.exports = createManyMatches

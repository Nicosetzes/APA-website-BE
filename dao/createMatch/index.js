const matchesModel = require("./../models/matches.js")

const createMatch = async (match) => {
    const newMatch = await matchesModel.create(match)
    return newMatch
}

module.exports = createMatch

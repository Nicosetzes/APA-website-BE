const tournamentsModel = require("./../models/tournaments.js")

const findTournaments = async (query) => {
    const tournaments = await tournamentsModel.find(query)
    return tournaments
}

module.exports = findTournaments

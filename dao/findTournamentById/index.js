const tournamentsModel = require("./../models/tournaments.js")

const findTournamentById = async (id) => {
    const tournament = await tournamentsModel.findById(id)
    return tournament
}

module.exports = findTournamentById

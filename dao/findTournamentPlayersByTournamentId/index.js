const tournamentsModel = require("./../models/tournaments.js")

const findTournamentPlayersByTournamentId = async (id) => {
    const { players } = await tournamentsModel.findById(id, "players")
    return players
}

module.exports = findTournamentPlayersByTournamentId

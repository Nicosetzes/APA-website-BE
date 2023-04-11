const tournamentsModel = require("./../models/tournaments.js")

const findTournamentTeamsByTournamentId = async (id) => {
    const { teams } = await tournamentsModel.findById(id, "teams")
    return teams
}

module.exports = findTournamentTeamsByTournamentId

const tournamentsModel = require("./../models/tournaments.js")

const updateTeamUsersFromTournamentByTournamentId = async (id, teams) => {
    const updatedTeamUsers = await tournamentsModel.findByIdAndUpdate(
        id,
        { teams },
        { new: true } // Returns the updated document, not the original
    )
    return updatedTeamUsers
}

module.exports = updateTeamUsersFromTournamentByTournamentId

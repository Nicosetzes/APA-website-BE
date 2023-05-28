const tournamentsModel = require("./../models/tournaments.js")

const updateSquad = async (tournament, teams) => {
    const uploadedTeams = await tournamentsModel.findByIdAndUpdate(
        tournament,
        {
            teams,
        },
        { new: true } // Returns the updated document, not the original
    )

    return uploadedTeams
}

module.exports = updateSquad

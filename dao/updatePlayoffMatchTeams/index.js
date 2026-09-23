const matchesModel = require("./../models/matches.js")

const updatePlayoffMatchTeams = async (
    tournamentId,
    playoffId,
    fields,
    options = {}
) => {
    return matchesModel.findOneAndUpdate(
        {
            "tournament.id": tournamentId,
            playoff_id: playoffId,
            type: "playoff",
        },
        { $set: fields },
        { ...options, new: true }
    )
}

module.exports = updatePlayoffMatchTeams

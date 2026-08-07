const matchesModel = require("./../models/matches.js")

const updatePlayoffMatchTeams = async (tournamentId, playoffId, fields) => {
    return await matchesModel.findOneAndUpdate(
        {
            "tournament.id": tournamentId,
            playoff_id: playoffId,
            type: "playoff",
        },
        { $set: fields },
        { new: true }
    )
}

module.exports = updatePlayoffMatchTeams

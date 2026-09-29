const matchesModel = require("./../models/matches.js")

const updatePlayinMatchTeams = async (
    tournamentId,
    playoffId,
    fields,
    options = {}
) => {
    return matchesModel.findOneAndUpdate(
        {
            "tournament.id": tournamentId,
            playoff_id: playoffId,
            type: "playin",
        },
        { $set: fields },
        { ...options, new: true }
    )
}

module.exports = updatePlayinMatchTeams

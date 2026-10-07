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
        // Completar participantes no es cargar un resultado.
        { ...options, new: true, timestamps: false }
    )
}

module.exports = updatePlayoffMatchTeams

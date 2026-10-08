const matchesModel = require("../models/matches")

const updatePlayoffSeriesSlots = async (
    tournamentId,
    playoffId,
    updates,
    { session } = {}
) => {
    const results = []
    for (const { leg, fields, emptyTeamField } of updates) {
        const result = await matchesModel.updateOne(
            {
                "tournament.id": String(tournamentId),
                type: "playoff",
                playoff_id: playoffId,
                leg,
                [emptyTeamField]: null,
            },
            { $set: fields },
            // Completar el cruce siguiente no es cargar un resultado.
            { session, timestamps: false }
        )
        results.push(result)
    }
    return results
}

module.exports = updatePlayoffSeriesSlots

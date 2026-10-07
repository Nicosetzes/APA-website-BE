const matchesModel = require("../models/matches")

const claimPlayoffSeriesRevision = async (
    tournamentId,
    playoffId,
    expectedRevision,
    { session } = {}
) =>
    matchesModel.findOneAndUpdate(
        {
            "tournament.id": String(tournamentId),
            type: "playoff",
            playoff_id: Number(playoffId),
            leg: 1,
            seriesRevision: expectedRevision,
        },
        { $inc: { seriesRevision: 1 } },
        // Escritura de control: no debe mover updatedAt de la ida.
        { new: true, session, timestamps: false }
    )

module.exports = claimPlayoffSeriesRevision

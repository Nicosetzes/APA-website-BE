const matchesModel = require("../models/matches")

const deletePendingPlayoffTiebreak = async (
    tournamentId,
    playoffId,
    { session } = {}
) =>
    matchesModel.deleteOne(
        {
            "tournament.id": String(tournamentId),
            type: "playoff",
            playoff_id: Number(playoffId),
            leg: 3,
            played: false,
        },
        { session }
    )

module.exports = deletePendingPlayoffTiebreak

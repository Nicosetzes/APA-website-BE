const matchesModel = require("./../models/matches.js")

const findPlayoffMatchesByTournamentId = async (id) => {
    const matches = await matchesModel
        .find({
            "tournament.id": id,
            type: "playoff",
        })
        .sort({ playoff_id: 1 })

    return matches
}

module.exports = findPlayoffMatchesByTournamentId

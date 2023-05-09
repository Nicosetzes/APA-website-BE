const matchesModel = require("./../models/matches.js")

const findPlayinMatchesByTournamentId = async (id) => {
    const matches = await matchesModel
        .find({
            "tournament.id": id,
            type: "playin",
        })
        .sort({ playoff_id: 1 })

    return matches
}

module.exports = findPlayinMatchesByTournamentId

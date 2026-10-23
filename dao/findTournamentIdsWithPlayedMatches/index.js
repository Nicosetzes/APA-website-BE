const matchesModel = require("./../models/matches.js")

const findTournamentIdsWithPlayedMatches = async (ids = []) => {
    if (ids.length === 0) return []

    return matchesModel.distinct("tournament.id", {
        "tournament.id": { $in: ids.map(String) },
        played: true,
        valid: { $ne: false },
    })
}

module.exports = findTournamentIdsWithPlayedMatches

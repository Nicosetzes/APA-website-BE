const matchesModel = require("./../models/matches.js")

const countAllMatchesByTournamentId = async (tournament) => {
    let matches = await matchesModel.countDocuments({
        "tournament.id": tournament,
        valid: { $ne: false },
    })
    return matches
}

module.exports = countAllMatchesByTournamentId

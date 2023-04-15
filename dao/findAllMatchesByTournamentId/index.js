const matchesModel = require("./../models/matches.js")

const findAllMatchesByTournamentId = async (tournament) => {
    let matches = await matchesModel.find({
        "tournament.id": tournament,
        played: { $ne: false },
        valid: { $ne: false },
    })
    return matches
}

module.exports = findAllMatchesByTournamentId

const matchesModel = require("./../models/matches.js")

const findMatchesByTournamentId = async (tournament, team, qty) => {
    let matches = await matchesModel
        .find({
            played: true,
            "tournament.id": tournament,
            $or: [{ "teamP1.id": team }, { "teamP2.id": team }],
        })
        .sort({ updatedAt: -1, _id: -1 })
        .limit(qty)
    return matches
}

module.exports = findMatchesByTournamentId

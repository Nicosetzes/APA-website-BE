const matchesModel = require("./../models/matches.js")

const findPlayerMatchesByTournamentId = async (tournament, player) => {
    const matches = await matchesModel
        .find(
            {
                "tournament.id": tournament,
                played: true,
                valid: { $ne: false },
                $or: [{ "playerP1.id": player }, { "playerP2.id": player }],
            },
            "playerP1 playerP2 teamP1 teamP2 scoreP1 scoreP2 outcome updatedAt"
        )
        .sort({ updatedAt: -1, _id: -1 })

    return matches
}

module.exports = findPlayerMatchesByTournamentId

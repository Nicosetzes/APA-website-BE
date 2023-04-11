const matchesModel = require("./../models/matches.js")

const findRecentMatchesFromPlayer = async (playerQuery) => {
    const matches = await matchesModel
        .find(
            {
                played: { $ne: false },
                valid: { $ne: false },
                $or: [
                    { "playerP1.name": playerQuery },
                    { "playerP2.name": playerQuery },
                ],
            },
            "playerP1 teamP1 scoreP1 playerP2 teamP2 scoreP2 tournament outcome updatedAt"
        )
        .limit(10)
        .sort({ updatedAt: -1, _id: -1 })
    return matches
}

module.exports = findRecentMatchesFromPlayer

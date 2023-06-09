const matchesModel = require("./../models/matches.js")

const findAllMatches = async () => {
    const matches = await matchesModel
        .find(
            {
                played: { $ne: false },
                valid: { $ne: false },
            },
            "playerP1 scoreP1 playerP2 scoreP2 outcome updatedAt"
        )
        .sort({ updatedAt: -1, _id: -1 })

    return matches
}

module.exports = findAllMatches

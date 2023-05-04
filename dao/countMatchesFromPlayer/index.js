const matchesModel = require("./../models/matches.js")

const countMatchLossesFromPlayer = async (id) => {
    const matches = await matchesModel.countDocuments({
        $or: [{ "playerP1.id": id }, { "playerP2.id": id }],
        played: { $ne: false },
        valid: { $ne: false },
    })
    return matches
}

module.exports = countMatchLossesFromPlayer

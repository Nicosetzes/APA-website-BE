const matchesModel = require("./../models/matches.js")

const countMatchLossesFromPlayer = async (id) => {
    const matches = await matchesModel.countDocuments({
        "outcome.playerThatLost.id": id,
        played: { $ne: false },
        valid: { $ne: false },
    })
    return matches
}

module.exports = countMatchLossesFromPlayer

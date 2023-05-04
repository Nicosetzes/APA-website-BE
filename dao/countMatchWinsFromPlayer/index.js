const matchesModel = require("./../models/matches.js")

const countMatchWinsFromPlayer = async (id) => {
    const matches = await matchesModel.countDocuments({
        "outcome.playerThatWon.id": id,
        played: { $ne: false },
        valid: { $ne: false },
    })
    return matches
}

module.exports = countMatchWinsFromPlayer

const matchesModel = require("./../models/matches.js")

const findMatches = async (qty) => {
    let matches = await matchesModel
        .find({
            played: { $ne: false },
            valid: { $ne: false },
        })
        .sort({ updatedAt: -1, _id: -1 })
        .limit(qty)
    return matches
}

module.exports = findMatches

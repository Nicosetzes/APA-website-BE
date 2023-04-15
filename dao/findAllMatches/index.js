const matchesModel = require("./../models/matches.js")

const findAllMatches = async () => {
    const matches = await matchesModel.find({
        played: { $ne: false },
        valid: { $ne: false },
    })

    return matches
}

module.exports = findAllMatches

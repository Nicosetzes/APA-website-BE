const matchesModel = require("./../models/matches.js")

const findAllMatchesByUserId = async (id) => {
    let matches = await matchesModel
        .find(
            {
                $or: [{ "playerP1.id": id }, { "playerP2.id": id }],
                played: { $ne: false },
                valid: { $ne: false },
            },
            "playerP1 playerP2 scoreP1 scoreP2 outcome updatedAt type"
        )
        .sort({ updatedAt: -1, _id: -1 })
    return matches
}

module.exports = findAllMatchesByUserId

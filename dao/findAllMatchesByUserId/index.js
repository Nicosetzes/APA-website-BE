const matchesModel = require("./../models/matches.js")

const findAllMatchesByUserId = async (id) => {
    let matches = await matchesModel
        .find(
            {
                $or: [{ "playerP1.id": id }, { "playerP2.id": id }],
                played: { $ne: false },
                valid: { $ne: false },
            },
            "playerP1 teamP1 scoreP1 playerP2 teamP2 scoreP2 outcome tournament updatedAt type"
        )
        .sort({ updatedAt: -1, _id: -1 })
    return matches
}

module.exports = findAllMatchesByUserId

const matchesModel = require("./../models/matches.js")

const findMatchesByTeamName = async (query) => {
    let matches = await matchesModel
        .find({
            played: true,
            $or: [
                { "teamP1.name": { $regex: query, $options: "i" } },
                { "teamP2.name": { $regex: query, $options: "i" } },
            ],
        })
        .sort({ updatedAt: -1, _id: -1 })
    return matches
}

module.exports = findMatchesByTeamName

const matchesModel = require("./../models/matches.js")

const findMatches = async (page, teamName) => {
    const limit = 10 // Here I define the amount of results per page //
    let matches
    let amountOfTotalMatches

    // console.log(typeof teamName)

    if (!teamName) {
        matches = await matchesModel
            .find({
                played: { $ne: false },
                valid: { $ne: false },
            })
            .limit(limit * 1)
            .skip(page * limit)
            .sort({ updatedAt: -1, _id: -1 })

        amountOfTotalMatches = await matchesModel.countDocuments({
            played: { $ne: false },
            valid: { $ne: false },
        })
    } else {
        matches = await matchesModel
            .find({
                played: { $ne: false },
                valid: { $ne: false },
                $or: [
                    { "teamP1.name": { $regex: teamName, $options: "i" } },
                    { "teamP2.name": { $regex: teamName, $options: "i" } },
                ],
            })
            .limit(limit * 1)
            .skip(page * limit)
            .sort({ updatedAt: -1, _id: -1 })

        amountOfTotalMatches = await matchesModel.countDocuments({
            played: { $ne: false },
            valid: { $ne: false },
            $or: [
                { "teamP1.name": { $regex: teamName, $options: "i" } },
                { "teamP2.name": { $regex: teamName, $options: "i" } },
            ],
        })
    }

    return {
        matches,
        totalPages: Math.ceil(amountOfTotalMatches / limit),
        currentPage: Number(page),
    }
}

module.exports = findMatches

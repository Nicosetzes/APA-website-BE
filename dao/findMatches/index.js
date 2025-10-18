const matchesModel = require("./../models/matches.js")

const findMatches = async (page, teamName, date, played) => {
    const limit = 10 // Results per page

    // Build filter dynamically
    const filter = { valid: { $ne: false } }

    // played can be "true" or "false" or undefined
    if (typeof played !== "undefined") {
        const playedBool = String(played).toLowerCase() === "true"
        filter.played = playedBool
    } else {
        // backward compatibility: default to played != false (same as before)
        filter.played = { $ne: false }
    }

    if (teamName) {
        filter.$or = [
            { "teamP1.name": { $regex: teamName, $options: "i" } },
            { "teamP2.name": { $regex: teamName, $options: "i" } },
        ]
    }

    if (date) {
        const d = new Date(date)
        if (!isNaN(d.getTime())) {
            const start = new Date(
                Date.UTC(
                    d.getUTCFullYear(),
                    d.getUTCMonth(),
                    d.getUTCDate(),
                    0,
                    0,
                    0,
                    0
                )
            )
            const end = new Date(
                Date.UTC(
                    d.getUTCFullYear(),
                    d.getUTCMonth(),
                    d.getUTCDate() + 1,
                    0,
                    0,
                    0,
                    0
                )
            )
            filter.updatedAt = { $gte: start, $lt: end }
        }
    }

    const [matches, amountOfTotalMatches] = await Promise.all([
        matchesModel
            .find(filter)
            .limit(limit)
            .skip(page * limit)
            .sort({ updatedAt: -1, _id: -1 }),
        matchesModel.countDocuments(filter),
    ])

    return {
        matches,
        totalPages: Math.ceil(amountOfTotalMatches / limit),
        currentPage: Number(page),
    }
}

module.exports = findMatches

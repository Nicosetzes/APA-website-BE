const matchesModel = require("./../models/matches.js")

const findMatches = async (page, teamName, date, played) => {
    const limit = 20

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
        const parts = String(date).split("-")
        if (parts.length === 3) {
            const year = parseInt(parts[0], 10)
            const month = parseInt(parts[1], 10) - 1
            const day = parseInt(parts[2], 10)

            if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                const offset = 3 * 60 * 60 * 1000 // 3h en ms, difference between UTC and local time

                const start = new Date(
                    Date.UTC(year, month, day, 0, 0, 0, 0) + offset
                )
                const end = new Date(
                    Date.UTC(year, month, day + 1, 0, 0, 0, 0) + offset
                )

                filter.updatedAt = { $gte: start, $lt: end }
            }
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

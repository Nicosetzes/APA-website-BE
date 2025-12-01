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
        // Parse date string manually to avoid timezone issues
        // Expected format: YYYY-MM-DD
        const parts = String(date).split("-")
        if (parts.length === 3) {
            const year = parseInt(parts[0], 10)
            const month = parseInt(parts[1], 10) - 1 // Month is 0-indexed
            const day = parseInt(parts[2], 10)

            if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                // Create date range in local timezone
                const start = new Date(year, month, day, 0, 0, 0, 0)
                const end = new Date(year, month, day + 1, 0, 0, 0, 0)
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

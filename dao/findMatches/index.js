const matchesModel = require("./../models/matches.js")

const findMatches = async (filters) => {
    const limit = 20
    const {
        page = 0,
        teamName,
        player1,
        player2,
        tournamentId,
        type,
        outcome,
        goalDiffOp = "gte",
        goalDiffVal,
        dateFrom,
        dateTo,
        played,
    } = filters

    const queryConditions = [{ valid: { $ne: false } }]

    if (typeof played !== "undefined") {
        queryConditions.push({
            played: String(played).toLowerCase() === "true",
        })
    } else {
        queryConditions.push({ played: { $ne: false } })
    }

    if (teamName) {
        queryConditions.push({
            $or: [
                { "teamP1.name": { $regex: teamName, $options: "i" } },
                { "teamP2.name": { $regex: teamName, $options: "i" } },
            ],
        })
    }

    if (tournamentId && tournamentId !== "all") {
        queryConditions.push({ "tournament.id": tournamentId })
    }

    if (type && type !== "all") {
        if (type === "knockout")
            queryConditions.push({
                $or: [{ type: "playin" }, { type: "playoff" }],
            })
        else queryConditions.push({ type: type })
    }

    if (player1 && player1 !== "all") {
        if (player2 && player2 !== "all") {
            queryConditions.push({
                $or: [
                    { "playerP1.id": player1, "playerP2.id": player2 },
                    { "playerP1.id": player2, "playerP2.id": player1 },
                ],
            })
        } else {
            queryConditions.push({
                $or: [{ "playerP1.id": player1 }, { "playerP2.id": player1 }],
            })
        }
    }

    if (player1 && player1 !== "all" && outcome && outcome !== "all") {
        if (outcome === "draw") {
            queryConditions.push({ "outcome.draw": true })
        } else if (outcome === "penalties") {
            queryConditions.push({ "outcome.penalties": true })
        } else if (outcome === "win") {
            queryConditions.push({
                "outcome.draw": false,
                "outcome.playerThatWon.id": player1,
            })
        } else if (outcome === "loss") {
            queryConditions.push({
                "outcome.draw": false,
                "outcome.playerThatLost.id": player1,
            })
        }
    }

    if (goalDiffVal !== undefined && goalDiffVal !== "") {
        const diffValue = Number(goalDiffVal)
        const mongoOp =
            goalDiffOp === "lte" ? "$lte" : goalDiffOp === "eq" ? "$eq" : "$gte"

        queryConditions.push({
            "outcome.scoringDifference": { [mongoOp]: diffValue },
        })
    }

    if (dateFrom || dateTo) {
        const dateFilter = {}
        const offset = 3 * 60 * 60 * 1000 // Offset de 3 hs

        if (dateFrom) {
            const [y, m, d] = dateFrom.split("-").map(Number)
            dateFilter.$gte = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + offset)
        }
        if (dateTo) {
            const [y, m, d] = dateTo.split("-").map(Number)
            dateFilter.$lt = new Date(
                Date.UTC(y, m - 1, d + 1, 0, 0, 0) + offset
            )
        }

        queryConditions.push({ updatedAt: dateFilter })
    }

    const finalFilter = { $and: queryConditions }

    const [matches, amountOfTotalMatches] = await Promise.all([
        matchesModel
            .find(finalFilter)
            .limit(limit)
            .skip(page * limit)
            .sort({ updatedAt: -1, _id: -1 }),
        matchesModel.countDocuments(finalFilter),
    ])

    return {
        matches,
        totalMatches: amountOfTotalMatches,
        totalPages: Math.ceil(amountOfTotalMatches / limit),
        currentPage: Number(page),
    }
}

module.exports = findMatches

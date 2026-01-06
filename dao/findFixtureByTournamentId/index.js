const matchesModel = require("./../models/matches.js")

// Build an efficient, reusable filter and fetch results + counts in a single round-trip using aggregation.
const findFixtureByTournamentId = async (id, page, players, team, group) => {
    const limit = 9 // Results per page

    // Normalize inputs
    const rawPage = Number.isFinite(Number(page)) ? Number(page) : 0
    const currentPage = Math.max(0, rawPage)
    const playersArr = Array.isArray(players) ? players : undefined

    // Base match filter
    const match = {
        "tournament.id": id,
        type: "regular",
    }
    if (group) match.group = group

    const andClauses = []

    // Team filter (team can be either side)
    if (team) {
        // Match both string and number representations
        const teamIdNum = Number(team)
        andClauses.push({
            $or: [
                { $or: [{ "teamP1.id": team }, { "teamP1.id": teamIdNum }] },
                { $or: [{ "teamP2.id": team }, { "teamP2.id": teamIdNum }] },
            ],
        })
    }

    // Players filter
    if (playersArr && playersArr.length === 1) {
        const p = playersArr[0]
        andClauses.push({ $or: [{ "playerP1.id": p }, { "playerP2.id": p }] })
    } else if (playersArr && playersArr.length === 2) {
        const [p0, p1] = playersArr
        andClauses.push({
            $or: [
                { $and: [{ "playerP1.id": p0 }, { "playerP2.id": p1 }] },
                { $and: [{ "playerP1.id": p1 }, { "playerP2.id": p0 }] },
            ],
        })
    }

    const finalMatch = andClauses.length
        ? { ...match, $and: andClauses }
        : match

    // Single aggregation to fetch page and counts
    const [result] = await matchesModel
        .aggregate([
            { $match: finalMatch },
            {
                $facet: {
                    data: [
                        { $sort: { played: 1, updatedAt: -1 } },
                        { $skip: currentPage * limit },
                        { $limit: limit },
                    ],
                    totals: [
                        {
                            $group: {
                                _id: null,
                                amountOfTotalMatches: { $sum: 1 },
                                amountOfNotPlayedMatches: {
                                    $sum: {
                                        $cond: [
                                            { $eq: ["$played", false] },
                                            1,
                                            0,
                                        ],
                                    },
                                },
                            },
                        },
                    ],
                },
            },
        ])
        .option({ allowDiskUse: true })

    const matches = result?.data || []
    const totals = (result?.totals && result.totals[0]) || {
        amountOfTotalMatches: 0,
        amountOfNotPlayedMatches: 0,
    }

    return {
        matches,
        amountOfNotPlayedMatches: totals.amountOfNotPlayedMatches,
        amountOfTotalMatches: totals.amountOfTotalMatches,
        totalPages: Math.ceil((totals.amountOfTotalMatches || 0) / limit) || 0,
        currentPage,
    }
}

module.exports = findFixtureByTournamentId

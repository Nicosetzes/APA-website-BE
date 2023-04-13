const matchesModel = require("./../models/matches.js")

const findMatchesByTournamentIds = async (ids, page, player, team) => {
    const limit = 10 // Here I define the amount of results per page //
    let matches = []
    let amountOfTotalMatches
    // console.log(ids)
    console.log(page)
    console.log(player)
    console.log(typeof team)
    if (ids.length == 1) {
        if (player && team) {
            matches = await matchesModel
                .find({
                    $and: [
                        { "tournament.id": ids[0] },
                        {
                            $or: [
                                { "playerP1.id": player },
                                { "playerP2.id": player },
                            ],
                        },
                        { $or: [{ "teamP1.id": team }, { "teamP2.id": team }] },
                    ],
                })
                .limit(limit * 1)
                .skip(page * limit)

            amountOfTotalMatches = await matchesModel.countDocuments({
                $and: [
                    { "tournament.id": ids[0] },
                    {
                        $or: [
                            { "playerP1.id": player },
                            { "playerP2.id": player },
                        ],
                    },
                    { $or: [{ "teamP1.id": team }, { "teamP2.id": team }] },
                ],
            })
        } else if (player && !team) {
            matches = await matchesModel
                .find(
                    {
                        $and: [
                            { "tournament.id": ids[0] },
                            {
                                $or: [
                                    { "playerP1.id": player },
                                    { "playerP2.id": player },
                                ],
                            },
                        ],
                    }
                    // type: "regular", // Activar a futuro //
                )
                .limit(limit * 1)
                .skip(page * limit)

            amountOfTotalMatches = await matchesModel.countDocuments({
                $and: [
                    { "tournament.id": ids[0] },
                    {
                        $or: [
                            { "playerP1.id": player },
                            { "playerP2.id": player },
                        ],
                    },
                ],
            })
        } else if (!player && team) {
            console.log("solo equipo")
            matches = await matchesModel
                .find({
                    $and: [
                        { "tournament.id": ids[0] },
                        {
                            $or: [{ "teamP1.id": team }, { "teamP2.id": team }],
                        },
                    ],
                })
                .limit(limit * 1)
                .skip(page * limit)

            amountOfTotalMatches = await matchesModel.countDocuments({
                $and: [
                    { "tournament.id": ids[0] },
                    {
                        $or: [{ "teamP1.id": team }, { "teamP2.id": team }],
                    },
                ],
            })
        } else {
            matches = await matchesModel
                .find(
                    {
                        "tournament.id": ids[0],
                    }
                    // type: "regular", // Activar a futuro //
                )
                .limit(limit * 1)
                .skip(page * limit)

            amountOfTotalMatches = await matchesModel.countDocuments({
                "tournament.id": ids[0],
            })
        }
    }

    if (ids.length > 1) {
        // console.log("más de un ID")
        const query = ids.map((id, index) => {
            return {
                "tournament.id": id,
            }
        })

        if (player && team) {
            matches = matchesModel
                .find({
                    $or: query,
                    $or: [{ "playerP1.id": player }, { "playerP2.id": player }],
                    $or: [{ "teamP1.id": team }, { "teamP2.id": team }],
                })
                .limit(limit * 1)
                .skip(page * limit)

            amountOfTotalMatches = await matchesModel.countDocuments({
                $or: query,
                $or: [{ "playerP1.id": player }, { "playerP2.id": player }],
                $or: [{ "teamP1.id": team }, { "teamP2.id": team }],
            })
        } else if (player && !team) {
            matches = matchesModel
                .find({
                    $or: query,
                    $or: [{ "playerP1.id": player }, { "playerP2.id": player }],
                })
                .limit(limit * 1)
                .skip(page * limit)

            amountOfTotalMatches = await matchesModel.countDocuments({
                $or: query,
                $or: [{ "playerP1.id": player }, { "playerP2.id": player }],
            })
        } else {
            matches = matchesModel
                .find({
                    $or: query,
                })
                .limit(limit * 1)
                .skip(page * limit)

            amountOfTotalMatches = await matchesModel.countDocuments({
                $or: query,
            })
        }
    }

    return {
        matches,
        totalPages: Math.ceil(amountOfTotalMatches / limit),
        currentPage: Number(page),
    }
}

module.exports = findMatchesByTournamentIds

const matchesModel = require("./../models/matches.js")

const findFixtureByTournamentId = async (id, page, players, team, group) => {
    const limit = 10 // Here I define the amount of results per page //
    let matches = []
    let amountOfNotPlayedMatches
    let amountOfTotalMatches

    if (!players && !team && !group) {
        matches = await matchesModel
            .find({
                "tournament.id": id,
                type: "regular",
            })
            .sort({ played: 1, _id: -1 })
            .limit(limit * 1)
            .skip(page * limit)

        amountOfNotPlayedMatches = await matchesModel.countDocuments({
            "tournament.id": id,
            type: "regular",
            played: false,
        })

        amountOfTotalMatches = await matchesModel.countDocuments({
            "tournament.id": id,
            type: "regular",
        })
    } else if (!players && !team && group) {
        matches = await matchesModel
            .find({
                "tournament.id": id,
                group,
                type: "regular",
            })
            .sort({ played: 1, _id: -1 })
            .limit(limit * 1)
            .skip(page * limit)

        amountOfNotPlayedMatches = await matchesModel.countDocuments({
            "tournament.id": id,
            type: "regular",
            group,
            played: false,
        })

        amountOfTotalMatches = await matchesModel.countDocuments({
            "tournament.id": id,
            group,
            type: "regular",
        })
    } else if (!players && team) {
        matches = await matchesModel
            .find({
                $and: [
                    { "tournament.id": id },
                    { type: "regular" },
                    { $or: [{ "teamP1.id": team }, { "teamP2.id": team }] },
                ],
            })
            .sort({ played: 1, _id: -1 })
            .limit(limit * 1)
            .skip(page * limit)

        amountOfNotPlayedMatches = await matchesModel.countDocuments({
            $and: [
                { "tournament.id": id },
                { type: "regular" },
                { played: false },
                { $or: [{ "teamP1.id": team }, { "teamP2.id": team }] },
            ],
        })

        amountOfTotalMatches = await matchesModel.countDocuments({
            $and: [
                { "tournament.id": id },
                { type: "regular" },
                { $or: [{ "teamP1.id": team }, { "teamP2.id": team }] },
            ],
        })
    } else if (players.length == 1 && !team && !group) {
        matches = await matchesModel
            .find({
                $and: [
                    { "tournament.id": id },
                    { type: "regular" },
                    {
                        $or: [
                            { "playerP1.id": players },
                            { "playerP2.id": players },
                        ],
                    },
                ],
            })
            .sort({ played: 1, _id: -1 })
            .limit(limit * 1)
            .skip(page * limit)

        amountOfNotPlayedMatches = await matchesModel.countDocuments({
            $and: [
                { "tournament.id": id },
                { type: "regular" },
                { played: false },
                {
                    $or: [
                        { "playerP1.id": players },
                        { "playerP2.id": players },
                    ],
                },
            ],
        })

        amountOfTotalMatches = await matchesModel.countDocuments({
            $and: [
                { "tournament.id": id },
                { type: "regular" },
                {
                    $or: [
                        { "playerP1.id": players },
                        { "playerP2.id": players },
                    ],
                },
            ],
        })
    } else if (players.length == 1 && team) {
        matches = await matchesModel
            .find(
                {
                    $and: [
                        { "tournament.id": id },
                        { type: "regular" },
                        {
                            $or: [
                                { "playerP1.id": players },
                                { "playerP2.id": players },
                            ],
                        },
                        {
                            $or: [{ "teamP1.id": team }, { "teamP2.id": team }],
                        },
                    ],
                }
                // type: "regular", // Activar a futuro //
            )
            .sort({ played: 1, _id: -1 })
            .limit(limit * 1)
            .skip(page * limit)

        amountOfNotPlayedMatches = await matchesModel.countDocuments({
            $and: [
                { "tournament.id": id },
                { type: "regular" },
                { played: false },
                {
                    $or: [
                        { "playerP1.id": players },
                        { "playerP2.id": players },
                    ],
                },
                { $or: [{ "teamP1.id": team }, { "teamP2.id": team }] },
            ],
        })

        amountOfTotalMatches = await matchesModel.countDocuments({
            $and: [
                { "tournament.id": id },
                { type: "regular" },
                {
                    $or: [
                        { "playerP1.id": players },
                        { "playerP2.id": players },
                    ],
                },
                { $or: [{ "teamP1.id": team }, { "teamP2.id": team }] },
            ],
        })
    } else if (players.length == 1 && group) {
        matches = await matchesModel
            .find({
                $and: [
                    { "tournament.id": id },
                    { type: "regular" },
                    {
                        $or: [
                            { "playerP1.id": players },
                            { "playerP2.id": players },
                        ],
                    },
                    {
                        group,
                    },
                ],
            })
            .sort({ played: 1, _id: -1 })
            .limit(limit * 1)
            .skip(page * limit)

        amountOfNotPlayedMatches = await matchesModel.countDocuments({
            $and: [
                { "tournament.id": id },
                { type: "regular" },
                { played: false },
                {
                    $or: [
                        { "playerP1.id": players },
                        { "playerP2.id": players },
                    ],
                },
                {
                    group,
                },
            ],
        })

        amountOfTotalMatches = await matchesModel.countDocuments({
            $and: [
                { "tournament.id": id },
                { type: "regular" },
                {
                    $or: [
                        { "playerP1.id": players },
                        { "playerP2.id": players },
                    ],
                },
                {
                    group,
                },
            ],
        })
    } else if (players.length == 2 && !team && !group) {
        matches = await matchesModel
            .find({
                $and: [
                    { "tournament.id": id },
                    { type: "regular" },
                    {
                        $or: [
                            {
                                $and: [
                                    { "playerP1.id": players.at(0) },
                                    { "playerP2.id": players.at(1) },
                                ],
                            },
                            {
                                $and: [
                                    { "playerP1.id": players.at(1) },
                                    { "playerP2.id": players.at(0) },
                                ],
                            },
                        ],
                    },
                ],
            })
            .sort({ played: 1, _id: -1 })
            .limit(limit * 1)
            .skip(page * limit)

        amountOfNotPlayedMatches = await matchesModel.countDocuments({
            $and: [
                { "tournament.id": id },
                { type: "regular" },
                { played: false },
                {
                    $or: [
                        {
                            $and: [
                                { "playerP1.id": players.at(0) },
                                { "playerP2.id": players.at(1) },
                            ],
                        },
                        {
                            $and: [
                                { "playerP1.id": players.at(1) },
                                { "playerP2.id": players.at(0) },
                            ],
                        },
                    ],
                },
            ],
        })

        amountOfTotalMatches = await matchesModel.countDocuments({
            $and: [
                { "tournament.id": id },
                { type: "regular" },
                {
                    $or: [
                        {
                            $and: [
                                { "playerP1.id": players.at(0) },
                                { "playerP2.id": players.at(1) },
                            ],
                        },
                        {
                            $and: [
                                { "playerP1.id": players.at(1) },
                                { "playerP2.id": players.at(0) },
                            ],
                        },
                    ],
                },
            ],
        })
    } else if (players.length == 2 && team) {
        matches = await matchesModel
            .find(
                {
                    $and: [
                        { "tournament.id": id },
                        { type: "regular" },
                        {
                            $or: [
                                {
                                    $and: [
                                        { "playerP1.id": players.at(0) },
                                        { "playerP2.id": players.at(1) },
                                    ],
                                },
                                {
                                    $and: [
                                        { "playerP1.id": players.at(1) },
                                        { "playerP2.id": players.at(0) },
                                    ],
                                },
                            ],
                        },
                        {
                            $or: [{ "teamP1.id": team }, { "teamP2.id": team }],
                        },
                    ],
                }
                // type: "regular", // Activar a futuro //
            )
            .sort({ played: 1, _id: -1 })
            .limit(limit * 1)
            .skip(page * limit)

        amountOfNotPlayedMatches = await matchesModel.countDocuments({
            $and: [
                { "tournament.id": id },
                { type: "regular" },
                { played: false },
                {
                    $or: [
                        {
                            $and: [
                                { "playerP1.id": players.at(0) },
                                { "playerP2.id": players.at(1) },
                            ],
                        },
                        {
                            $and: [
                                { "playerP1.id": players.at(1) },
                                { "playerP2.id": players.at(0) },
                            ],
                        },
                    ],
                },
                { $or: [{ "teamP1.id": team }, { "teamP2.id": team }] },
            ],
        })

        amountOfTotalMatches = await matchesModel.countDocuments({
            $and: [
                { "tournament.id": id },
                { type: "regular" },
                {
                    $or: [
                        {
                            $and: [
                                { "playerP1.id": players.at(0) },
                                { "playerP2.id": players.at(1) },
                            ],
                        },
                        {
                            $and: [
                                { "playerP1.id": players.at(1) },
                                { "playerP2.id": players.at(0) },
                            ],
                        },
                    ],
                },
                { $or: [{ "teamP1.id": team }, { "teamP2.id": team }] },
            ],
        })
    } else {
        matches = await matchesModel
            .find({
                $and: [
                    { "tournament.id": id },
                    { type: "regular" },
                    {
                        $or: [
                            {
                                $and: [
                                    { "playerP1.id": players.at(0) },
                                    { "playerP2.id": players.at(1) },
                                ],
                            },
                            {
                                $and: [
                                    { "playerP1.id": players.at(1) },
                                    { "playerP2.id": players.at(0) },
                                ],
                            },
                        ],
                    },
                    {
                        group,
                    },
                ],
            })
            .sort({ played: 1, _id: -1 })
            .limit(limit * 1)
            .skip(page * limit)

        amountOfNotPlayedMatches = await matchesModel.countDocuments({
            $and: [
                { "tournament.id": id },
                { type: "regular" },
                { played: false },
                {
                    $or: [
                        {
                            $and: [
                                { "playerP1.id": players.at(0) },
                                { "playerP2.id": players.at(1) },
                            ],
                        },
                        {
                            $and: [
                                { "playerP1.id": players.at(1) },
                                { "playerP2.id": players.at(0) },
                            ],
                        },
                    ],
                },
                {
                    group,
                },
            ],
        })

        amountOfTotalMatches = await matchesModel.countDocuments({
            $and: [
                { "tournament.id": id },
                { type: "regular" },
                {
                    $or: [
                        {
                            $and: [
                                { "playerP1.id": players.at(0) },
                                { "playerP2.id": players.at(1) },
                            ],
                        },
                        {
                            $and: [
                                { "playerP1.id": players.at(1) },
                                { "playerP2.id": players.at(0) },
                            ],
                        },
                    ],
                },
                {
                    group,
                },
            ],
        })
    }
    return {
        matches,
        amountOfNotPlayedMatches,
        amountOfTotalMatches,
        totalPages: Math.ceil(amountOfTotalMatches / limit),
        currentPage: Number(page),
    }
}

module.exports = findFixtureByTournamentId

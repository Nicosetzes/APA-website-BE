const matchesModel = require("./../models/matches.js")

const findFixtureByTournamentId = async (id, page, players, team, group) => {
    const limit = 10 // Here I define the amount of results per page //
    let matches = []
    let amountOfTotalMatches
    if (!players && !team && !group) {
        matches = await matchesModel
            .find({
                "tournament.id": id,
                type: "regular",
            })
            .limit(limit * 1)
            .skip(page * limit)

        amountOfTotalMatches = await matchesModel.countDocuments({
            "tournament.id": id,
        })
    } else if (!players && !team && group) {
        matches = await matchesModel
            .find({
                "tournament.id": id,
                group,
                type: "regular",
            })
            .limit(limit * 1)
            .skip(page * limit)

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
            .limit(limit * 1)
            .skip(page * limit)

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
            .limit(limit * 1)
            .skip(page * limit)

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
            .limit(limit * 1)
            .skip(page * limit)

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
            .limit(limit * 1)
            .skip(page * limit)

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
            .limit(limit * 1)
            .skip(page * limit)

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
            .limit(limit * 1)
            .skip(page * limit)

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
            .limit(limit * 1)
            .skip(page * limit)

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
        totalPages: Math.ceil(amountOfTotalMatches / limit),
        currentPage: Number(page),
    }
}

module.exports = findFixtureByTournamentId

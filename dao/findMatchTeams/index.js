const matchesModel = require("./../models/matches.js")

const LISTED_MATCHES = { valid: { $ne: false }, played: { $ne: false } }

const findMatchTeams = async () =>
    matchesModel.aggregate([
        { $match: LISTED_MATCHES },
        {
            $project: {
                _id: 0,
                teams: [
                    { id: "$teamP1.id", name: "$teamP1.name" },
                    { id: "$teamP2.id", name: "$teamP2.name" },
                ],
            },
        },
        { $unwind: "$teams" },
        { $match: { "teams.name": { $type: "string" } } },
        { $group: { _id: "$teams.name", id: { $max: "$teams.id" } } },
        { $project: { _id: 0, id: 1, name: "$_id" } },
    ])

module.exports = findMatchTeams

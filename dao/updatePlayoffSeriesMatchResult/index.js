const matchesModel = require("../models/matches")

const updatePlayoffSeriesMatchResult = async (
    matchId,
    result,
    { session, requirePending = false } = {}
) =>
    matchesModel.findOneAndUpdate(
        {
            _id: matchId,
            ...(requirePending ? { played: false } : {}),
        },
        { $set: result },
        { new: true, session }
    )

module.exports = updatePlayoffSeriesMatchResult

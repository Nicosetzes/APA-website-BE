const matchesModel = require("./../models/matches.js")
const { getArgentinaRecapDayRange } = require("../../utils/argentinaDay")

const findTournamentIdsPlayedOnDate = async (date) => {
    const { start, end } = getArgentinaRecapDayRange(date)

    return matchesModel.distinct("tournament.id", {
        valid: { $ne: false },
        played: true,
        playedAt: { $gte: start, $lt: end },
    })
}

module.exports = findTournamentIdsPlayedOnDate

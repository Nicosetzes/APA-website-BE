const matchesModel = require("./../models/matches.js")
const { getArgentinaDayRange } = require("../../utils/argentinaDay")

const findTournamentIdsPlayedOnDate = async (date) => {
    const { start, end } = getArgentinaDayRange(date)

    return matchesModel.distinct("tournament.id", {
        valid: { $ne: false },
        played: true,
        playedAt: { $gte: start, $lt: end },
    })
}

module.exports = findTournamentIdsPlayedOnDate

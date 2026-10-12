const matchesModel = require("./../models/matches.js")

const ARGENTINA_OFFSET_MS = 3 * 60 * 60 * 1000

const findTournamentIdsPlayedOnDate = async (date) => {
    const [year, month, day] = date.split("-").map(Number)

    return matchesModel.distinct("tournament.id", {
        valid: { $ne: false },
        played: true,
        playedAt: {
            $gte: new Date(
                Date.UTC(year, month - 1, day) + ARGENTINA_OFFSET_MS
            ),
            $lt: new Date(
                Date.UTC(year, month - 1, day + 1) + ARGENTINA_OFFSET_MS
            ),
        },
    })
}

module.exports = findTournamentIdsPlayedOnDate

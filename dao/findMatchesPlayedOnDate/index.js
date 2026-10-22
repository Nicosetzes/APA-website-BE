const matchesModel = require("./../models/matches.js")
const { getArgentinaDayRange } = require("../../utils/argentinaDay")

const PROJECTION = [
    "tournament.id",
    "type",
    "playoff_id",
    "leg",
    "playedAt",
    "scoreP1",
    "scoreP2",
    "playerP1.id",
    "playerP1.name",
    "teamP1.id",
    "teamP1.name",
    "playerP2.id",
    "playerP2.name",
    "teamP2.id",
    "teamP2.name",
    "outcome.draw",
    "outcome.penalties",
    "outcome.playerThatWon.id",
    "outcome.teamThatWon.id",
].join(" ")

const findMatchesPlayedOnDate = async (date) => {
    const { start, end } = getArgentinaDayRange(date)

    return matchesModel
        .find(
            {
                played: true,
                valid: { $ne: false },
                playedAt: { $gte: start, $lt: end },
            },
            PROJECTION
        )
        .lean()
}

module.exports = findMatchesPlayedOnDate
module.exports.PROJECTION = PROJECTION

const matchesModel = require("./../models/matches.js")
const { comparePlayedAtDesc } = require("../../utils/playedAt")

const findAllMatches = async () => {
    const matches = await matchesModel.find(
        {
            played: { $ne: false },
            valid: { $ne: false },
        },
        "playerP1 teamP1 scoreP1 playerP2 teamP2 scoreP2 outcome tournament type playoff_id updatedAt playedAt playedAtPrecision"
    )

    // Orden `playedAt ?? updatedAt` desc en JS: no hay índice para esa clave.
    return Array.from(matches).sort(comparePlayedAtDesc)
}

module.exports = findAllMatches

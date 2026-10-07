const matchesModel = require("./../models/matches.js")
const { comparePlayedAtDesc } = require("../../utils/playedAt")

const findPlayerMatchesByTournamentId = async (tournament, player) => {
    const matches = await matchesModel.find(
        {
            "tournament.id": tournament,
            played: true,
            $or: [{ "playerP1.id": player }, { "playerP2.id": player }],
        },
        "playerP1 playerP2 teamP1 teamP2 scoreP1 scoreP2 outcome valid updatedAt playedAt playedAtPrecision"
    )

    // Orden `playedAt ?? updatedAt` desc en JS: no hay índice para esa clave.
    return Array.from(matches).sort(comparePlayedAtDesc)
}

module.exports = findPlayerMatchesByTournamentId

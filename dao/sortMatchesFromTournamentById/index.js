const matchesModel = require("./../models/matches.js")
const { comparePlayedAtDesc } = require("../../utils/playedAt")

const sortMatchesFromTournamentById = async (tournamentId, group) => {
    const filter = {
        "tournament.id": tournamentId,
        played: true,
        type: "regular",
    }
    if (group) filter.group = group

    const matches = await matchesModel.find(filter)

    // Orden `playedAt ?? updatedAt` desc en JS: no hay índice para esa clave.
    return Array.from(matches).sort(comparePlayedAtDesc)
}

module.exports = sortMatchesFromTournamentById

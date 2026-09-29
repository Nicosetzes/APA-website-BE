const matchesModel = require("./../models/matches.js")

const existsMatchByTournamentId = async (tournamentId, filter = {}) => {
    const match = await matchesModel.exists({
        "tournament.id": tournamentId,
        ...filter,
    })

    return Boolean(match)
}

module.exports = existsMatchByTournamentId

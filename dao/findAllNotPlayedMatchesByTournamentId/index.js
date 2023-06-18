const matchesModel = require("./../models/matches.js")

const findAllNotPlayedMatchesByTournamentId = async (tournament) => {
    let matches = await matchesModel.find(
        {
            "tournament.id": tournament,
            played: false,
        },
        "playerP1 playerP2"
    )
    return matches
}

module.exports = findAllNotPlayedMatchesByTournamentId

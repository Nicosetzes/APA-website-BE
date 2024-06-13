const matchesModel = require("./../models/matches.js")

const findAllNotPlayedMatchesByTournamentId = async (tournament, group) => {
    let matches = await matchesModel.find(
        {
            "tournament.id": tournament,
            played: false,
        },
        "playerP1 playerP2 teamP1 teamP2"
    )
    return matches
}

module.exports = findAllNotPlayedMatchesByTournamentId

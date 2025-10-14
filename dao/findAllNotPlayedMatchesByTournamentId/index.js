const matchesModel = require("./../models/matches.js")

const findAllNotPlayedMatchesByTournamentId = async (tournament, group) => {
    const filter = {
        "tournament.id": tournament,
        played: false,
        type: "regular",
    }
    if (group) filter.group = group
    const matches = await matchesModel.find(
        filter,
        "playerP1 playerP2 teamP1 teamP2"
    )
    return matches
}

module.exports = findAllNotPlayedMatchesByTournamentId

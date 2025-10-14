const { findAllNotPlayedMatchesByTournamentId } = require("./../../dao")

const retrieveAllNotPlayedMatchesByTournamentId = async (tournament, group) => {
    return await findAllNotPlayedMatchesByTournamentId(tournament, group)
}

module.exports = retrieveAllNotPlayedMatchesByTournamentId

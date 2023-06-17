const { findAllNotPlayedMatchesByTournamentId } = require("./../../dao")

const retrieveAllNotPlayedMatchesByTournamentId = async (tournament) => {
    return await findAllNotPlayedMatchesByTournamentId(tournament)
}

module.exports = retrieveAllNotPlayedMatchesByTournamentId

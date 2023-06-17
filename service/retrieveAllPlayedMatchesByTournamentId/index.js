const { findAllMatchesByTournamentId } = require("./../../dao")

const retrieveAllPlayedMatchesByTournamentId = async (tournament, invalid) => {
    return await findAllMatchesByTournamentId(tournament, invalid)
}

module.exports = retrieveAllPlayedMatchesByTournamentId

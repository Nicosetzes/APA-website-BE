const { findAllPlayedMatchesByTournamentId } = require("./../../dao")

const retrieveMatchesByTournamentId = async (tournament, team, qty) => {
    return await findAllPlayedMatchesByTournamentId(tournament, team, qty)
}

module.exports = retrieveMatchesByTournamentId

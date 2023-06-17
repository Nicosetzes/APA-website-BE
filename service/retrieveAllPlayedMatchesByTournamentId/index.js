const { findAllPlayedMatchesByTournamentId } = require("./../../dao")

const retrieveAllPlayedMatchesByTournamentId = async (
    tournament,
    team,
    qty
) => {
    return await findAllPlayedMatchesByTournamentId(tournament, team, qty)
}

module.exports = retrieveAllPlayedMatchesByTournamentId

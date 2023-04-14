const { findMatchesByTournamentId } = require("./../../dao")

const retrieveMatchesByTournamentId = async (tournament, team, qty) => {
    return await findMatchesByTournamentId(tournament, team, qty)
}

module.exports = retrieveMatchesByTournamentId

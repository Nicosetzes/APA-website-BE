const { findPlayerMatchesByTournamentId } = require("./../../dao")

const retrievePlayerMatchesByTournamentId = async (tournament, player) => {
    return await findPlayerMatchesByTournamentId(tournament, player)
}

module.exports = retrievePlayerMatchesByTournamentId

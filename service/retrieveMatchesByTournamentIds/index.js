const { findMatchesByTournamentIds } = require("./../../dao")

const retrieveMatchesByTournamentIds = async (id, page, player, team) => {
    return await findMatchesByTournamentIds(id, page, player, team)
}

module.exports = retrieveMatchesByTournamentIds

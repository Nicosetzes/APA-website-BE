const { findMatchesByTournamentIds } = require("./../../dao")

const retrieveMatchesByTournamentIds = async (ids, page, players, team) => {
    return await findMatchesByTournamentIds(ids, page, players, team)
}

module.exports = retrieveMatchesByTournamentIds

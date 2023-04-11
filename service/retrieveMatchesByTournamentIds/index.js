const { findMatchesByTournamentIds } = require("./../../dao")

const retrieveMatchesByTournamentIds = async (id) => {
    return await findMatchesByTournamentIds(id)
}

module.exports = retrieveMatchesByTournamentIds

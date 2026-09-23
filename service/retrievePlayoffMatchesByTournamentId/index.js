const { findPlayoffMatchesByTournamentId } = require("./../../dao")

const retrievePlayoffMatchesByTournamentId = async (id, options = {}) => {
    return findPlayoffMatchesByTournamentId(id, options)
}

module.exports = retrievePlayoffMatchesByTournamentId

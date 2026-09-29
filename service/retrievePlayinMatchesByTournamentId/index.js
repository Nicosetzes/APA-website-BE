const { findPlayinMatchesByTournamentId } = require("./../../dao")

const retrievePlayinMatchesByTournamentId = async (id, options = {}) => {
    return findPlayinMatchesByTournamentId(id, options)
}

module.exports = retrievePlayinMatchesByTournamentId

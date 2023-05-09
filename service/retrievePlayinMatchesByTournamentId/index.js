const { findPlayinMatchesByTournamentId } = require("./../../dao")

const retrievePlayinMatchesByTournamentId = async (id) => {
    return await findPlayinMatchesByTournamentId(id)
}

module.exports = retrievePlayinMatchesByTournamentId

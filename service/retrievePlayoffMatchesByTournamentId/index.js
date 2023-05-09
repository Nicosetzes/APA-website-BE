const { findPlayoffMatchesByTournamentId } = require("./../../dao")

const retrievePlayoffMatchesByTournamentId = async (id) => {
    return await findPlayoffMatchesByTournamentId(id)
}

module.exports = retrievePlayoffMatchesByTournamentId

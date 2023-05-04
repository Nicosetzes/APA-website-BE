const { findAllMatchesByTournamentId } = require("./../../dao")

const retrieveAllMatchesByTournamentId = async (tournament, invalid) => {
    return await findAllMatchesByTournamentId(tournament, invalid)
}

module.exports = retrieveAllMatchesByTournamentId

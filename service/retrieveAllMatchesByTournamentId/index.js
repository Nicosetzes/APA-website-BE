const { findAllMatchesByTournamentId } = require("./../../dao")

const retrieveAllMatchesByTournamentId = async (tournament) => {
    return await findAllMatchesByTournamentId(tournament)
}

module.exports = retrieveAllMatchesByTournamentId

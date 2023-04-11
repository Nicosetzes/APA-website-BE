const { findTournamentPlayersByTournamentId } = require("./../../dao")

const retrieveTournamentPlayersByTournamentId = async (id) => {
    return await findTournamentPlayersByTournamentId(id)
}

module.exports = retrieveTournamentPlayersByTournamentId

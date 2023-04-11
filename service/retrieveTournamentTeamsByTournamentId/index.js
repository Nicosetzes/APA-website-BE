const { findTournamentTeamsByTournamentId } = require("./../../dao")

const retrieveTournamentTeamsByTournamentId = async (id) => {
    return await findTournamentTeamsByTournamentId(id)
}

module.exports = retrieveTournamentTeamsByTournamentId

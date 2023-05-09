const { sortMatchesFromTournamentById } = require("./../../dao")

const orderMatchesFromTournamentById = async (tournamentId, group) => {
    return await sortMatchesFromTournamentById(tournamentId, group)
}

module.exports = orderMatchesFromTournamentById

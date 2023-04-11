const { sortMatchesFromTournamentById } = require("./../../dao")

const orderMatchesFromTournamentById = async (tournamentId) => {
    return await sortMatchesFromTournamentById(tournamentId)
}

module.exports = orderMatchesFromTournamentById

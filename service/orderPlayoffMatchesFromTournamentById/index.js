const { sortPlayoffMatchesFromTournamentById } = require("./../../dao")

const orderPlayoffMatchesFromTournamentById = async (tournamentId) => {
    return await sortPlayoffMatchesFromTournamentById(tournamentId)
}

module.exports = orderPlayoffMatchesFromTournamentById

const { getDailyRecapByTournamentId } = require("./../../dao")

const serviceGetDailyRecapByTournamentId = async (tournamentId, date) => {
    return await getDailyRecapByTournamentId(tournamentId, date)
}

module.exports = serviceGetDailyRecapByTournamentId

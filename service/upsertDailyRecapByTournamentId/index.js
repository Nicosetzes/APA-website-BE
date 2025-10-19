const { upsertDailyRecapByTournamentId } = require("./../../dao")

const serviceUpsertDailyRecapByTournamentId = async (
    tournamentId,
    date,
    content
) => {
    return await upsertDailyRecapByTournamentId(tournamentId, date, content)
}

module.exports = serviceUpsertDailyRecapByTournamentId

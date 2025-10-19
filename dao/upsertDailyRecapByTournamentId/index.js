const tournamentsModel = require("./../models/tournaments.js")

// Upsert daily recap for a tournament on a given date
// daily_recap is stored as an object keyed by ISO date (YYYY-MM-DD)
const upsertDailyRecapByTournamentId = async (tournamentId, date, content) => {
    const key = `daily_recap.${date}`
    const update = {
        $set: {
            [key]: {
                content,
                updatedAt: new Date(),
            },
        },
    }
    const options = { new: true }
    return await tournamentsModel.findByIdAndUpdate(
        tournamentId,
        update,
        options
    )
}

module.exports = upsertDailyRecapByTournamentId

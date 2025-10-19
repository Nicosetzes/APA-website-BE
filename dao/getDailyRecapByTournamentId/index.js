const tournamentsModel = require("./../models/tournaments.js")

// Retrieve a single daily recap entry for a tournament by date (YYYY-MM-DD)
// If date is not provided, return the most recent (max key) daily recap
const getDailyRecapByTournamentId = async (tournamentId, date) => {
    if (date) {
        const projection = { [`daily_recap.${date}`]: 1, name: 1 }
        const doc = await tournamentsModel
            .findById(tournamentId, projection)
            .lean()
        if (!doc) return null
        const recap = doc.daily_recap?.[date]
        if (!recap) return null
        return {
            tournament: { id: String(tournamentId), name: doc.name },
            date,
            content: recap.content,
            updatedAt: recap.updatedAt,
        }
    }

    // No date provided: fetch only the daily_recap field and name, then pick the latest key
    const doc = await tournamentsModel
        .findById(tournamentId, { daily_recap: 1, name: 1 })
        .lean()
    if (!doc || !doc.daily_recap) return null

    const keys = Object.keys(doc.daily_recap).filter((k) =>
        /\d{4}-\d{2}-\d{2}/.test(k)
    )
    if (keys.length === 0) return null

    // Since keys are YYYY-MM-DD, lexicographical sort works for latest
    const latestDate = keys.sort().at(-1)
    const latestRecap = doc.daily_recap[latestDate]
    if (!latestRecap) return null

    return {
        tournament: { id: String(tournamentId), name: doc.name },
        date: latestDate,
        content: latestRecap.content,
        updatedAt: latestRecap.updatedAt,
    }
}

module.exports = getDailyRecapByTournamentId

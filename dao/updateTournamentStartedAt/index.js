const tournamentsModel = require("./../models/tournaments.js")

// El filtro `startedAt: null` lo vuelve un no-op si el torneo ya empezó, así que
// un resultado posterior o la edición de uno viejo no lo mueven.
const updateTournamentStartedAt = async (tournamentId, match, options = {}) => {
    if (!match?.playedAt) return null

    return tournamentsModel.updateOne(
        { _id: tournamentId, startedAt: null },
        {
            $set: {
                startedAt: match.playedAt,
                startedAtPrecision: match.playedAtPrecision ?? "exact",
            },
        },
        options
    )
}

module.exports = updateTournamentStartedAt

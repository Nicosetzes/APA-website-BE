const matchesModel = require("./../models/matches.js")
const tournamentsModel = require("./../models/tournaments.js")

// Recalcula `startedAt` después de borrar un resultado jugado en
// `removedPlayedAt`. En el caso común es una sola consulta: el torneo empezó
// antes que el partido borrado y no hay nada que cambiar. Si el borrado era el
// primer partido son tres: ese chequeo, el partido jugado más viejo que queda y
// el `updateOne` que fija su fecha (o hace `$unset` si no queda ninguno).
const recomputeTournamentStartedAt = async (
    tournamentId,
    removedPlayedAt,
    options = {}
) => {
    if (!removedPlayedAt) return null

    const startedByRemoved = await tournamentsModel.findOne(
        { _id: tournamentId, startedAt: { $gte: removedPlayedAt } },
        { _id: 1 },
        { ...options, lean: true }
    )
    if (!startedByRemoved) return null

    const earliest = await matchesModel.findOne(
        {
            "tournament.id": String(tournamentId),
            played: true,
            playedAt: { $ne: null },
        },
        { playedAt: 1, playedAtPrecision: 1 },
        { ...options, sort: { playedAt: 1, _id: 1 }, lean: true }
    )

    return tournamentsModel.updateOne(
        { _id: tournamentId },
        earliest
            ? {
                  $set: {
                      startedAt: earliest.playedAt,
                      startedAtPrecision: earliest.playedAtPrecision,
                  },
              }
            : { $unset: { startedAt: 1, startedAtPrecision: 1 } },
        options
    )
}

module.exports = recomputeTournamentStartedAt

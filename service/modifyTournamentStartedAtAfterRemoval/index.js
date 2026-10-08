const { recomputeTournamentStartedAt } = require("./../../dao")

const modifyTournamentStartedAtAfterRemoval = async (
    tournamentId,
    removedPlayedAt,
    options = {}
) => {
    return recomputeTournamentStartedAt(tournamentId, removedPlayedAt, options)
}

module.exports = modifyTournamentStartedAtAfterRemoval

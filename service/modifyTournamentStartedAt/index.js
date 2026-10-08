const { updateTournamentStartedAt } = require("./../../dao")

const modifyTournamentStartedAt = async (tournamentId, match, options = {}) => {
    return updateTournamentStartedAt(tournamentId, match, options)
}

module.exports = modifyTournamentStartedAt

const { findTournamentMatchesForRecap } = require("./../../dao")
const { compareChronologically } = require("../playerRatings")

const retrieveTournamentMatchesForRecap = async (tournamentId) => {
    const matches = await findTournamentMatchesForRecap(tournamentId)

    return [...matches].sort(compareChronologically)
}

module.exports = retrieveTournamentMatchesForRecap

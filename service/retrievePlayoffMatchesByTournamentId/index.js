const { decoratePlayoffSeriesMatches } = require("../playoffSeries")
const {
    findPlayoffMatchesByTournamentId,
    findTournamentById,
} = require("./../../dao")

const retrievePlayoffMatchesByTournamentId = async (id, options = {}) => {
    const [tournament, matches] = await Promise.all([
        findTournamentById(id, options),
        findPlayoffMatchesByTournamentId(id, options),
    ])
    if (!tournament) return matches
    return decoratePlayoffSeriesMatches(tournament, matches)
}

module.exports = retrievePlayoffMatchesByTournamentId

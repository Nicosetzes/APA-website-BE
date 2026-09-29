const matchesModel = require("./../models/matches.js")

const findPlayinMatchesByTournamentId = async (id, options = {}) => {
    const query = matchesModel
        .find({
            "tournament.id": id,
            type: "playin",
        })
        .sort({ playoff_id: 1 })

    if (options.session) query.session(options.session)

    return query
}

module.exports = findPlayinMatchesByTournamentId

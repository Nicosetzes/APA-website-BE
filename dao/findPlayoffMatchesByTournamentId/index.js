const matchesModel = require("./../models/matches.js")

const findPlayoffMatchesByTournamentId = async (id, options = {}) => {
    const query = matchesModel
        .find({
            "tournament.id": id,
            type: "playoff",
        })
        .sort({ playoff_id: 1 })

    if (options.session) query.session(options.session)

    return query
}

module.exports = findPlayoffMatchesByTournamentId

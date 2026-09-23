const tournamentsModel = require("./../models/tournaments.js")

const findTournamentById = async (id, options = {}) => {
    const query = tournamentsModel.findById(id)

    if (options.session) query.session(options.session)

    return query
}

module.exports = findTournamentById

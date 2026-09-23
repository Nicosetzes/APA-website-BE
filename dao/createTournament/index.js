const tournamentsModel = require("./../models/tournaments.js")

const createTournament = async (tournament, options = {}) => {
    if (options.session) {
        const [newTournament] = await tournamentsModel.create(
            [tournament],
            options
        )
        return newTournament
    }

    return tournamentsModel.create(tournament)
}

module.exports = createTournament

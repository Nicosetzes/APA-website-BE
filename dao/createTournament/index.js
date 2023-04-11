const tournamentsModel = require("./../models/tournaments.js")

const createTournament = async (tournament) => {
    const newTournament = await tournamentsModel.create(tournament)
    return newTournament
}

module.exports = createTournament

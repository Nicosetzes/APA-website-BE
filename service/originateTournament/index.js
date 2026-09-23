const { createTournament } = require("./../../dao")

const originateTournament = async (tournament, options = {}) => {
    return createTournament(tournament, options)
}

module.exports = originateTournament

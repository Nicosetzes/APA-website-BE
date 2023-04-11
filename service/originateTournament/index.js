const { createTournament } = require("./../../dao")

const originateTournament = async (tournament) => {
    return await createTournament(tournament)
}

module.exports = originateTournament

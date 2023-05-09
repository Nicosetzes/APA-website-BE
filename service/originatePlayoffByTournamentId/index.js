const { createPlayoffByTournamentId } = require("./../../dao")

const originatePlayoffByTournamentId = async (matches) => {
    return await createPlayoffByTournamentId(matches)
}

module.exports = originatePlayoffByTournamentId

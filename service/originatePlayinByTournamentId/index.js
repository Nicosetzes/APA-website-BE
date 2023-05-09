const { createPlayinByTournamentId } = require("./../../dao")

const originatePlayinByTournamentId = async (matches) => {
    return await createPlayinByTournamentId(matches)
}

module.exports = originatePlayinByTournamentId

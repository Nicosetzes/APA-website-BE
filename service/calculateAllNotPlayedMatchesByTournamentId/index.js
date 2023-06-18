const { countAllNotPlayedMatchesByTournamentId } = require("./../../dao")

const calculateAllNotPlayedMatchesByTournamentId = async (id, players) => {
    return await countAllNotPlayedMatchesByTournamentId(id, players)
}

module.exports = calculateAllNotPlayedMatchesByTournamentId

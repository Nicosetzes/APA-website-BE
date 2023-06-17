const { countAllMatchesByTournamentId } = require("./../../dao")

const calculateAllMatchesByTournamentId = async (id) => {
    return await countAllMatchesByTournamentId(id)
}

module.exports = calculateAllMatchesByTournamentId

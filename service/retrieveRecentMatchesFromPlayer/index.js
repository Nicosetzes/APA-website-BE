const { findRecentMatchesFromPlayer } = require("./../../dao")

const retrieveRecentMatchesFromPlayer = async (player) => {
    return await findRecentMatchesFromPlayer(player)
}

module.exports = retrieveRecentMatchesFromPlayer

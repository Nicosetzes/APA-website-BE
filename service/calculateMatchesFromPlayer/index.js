const { countMatchesFromPlayer } = require("./../../dao")

const calculateMatchesFromPlayer = async (id) => {
    return await countMatchesFromPlayer(id)
}

module.exports = calculateMatchesFromPlayer

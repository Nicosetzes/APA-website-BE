const { countMatchLossesFromPlayer } = require("./../../dao")

const calculateMatchLossesFromPlayer = async (id) => {
    return await countMatchLossesFromPlayer(id)
}

module.exports = calculateMatchLossesFromPlayer

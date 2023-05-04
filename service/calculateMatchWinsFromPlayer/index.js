const { countMatchWinsFromPlayer } = require("./../../dao")

const calculateMatchWinsFromPlayer = async (id) => {
    return await countMatchWinsFromPlayer(id)
}

module.exports = calculateMatchWinsFromPlayer

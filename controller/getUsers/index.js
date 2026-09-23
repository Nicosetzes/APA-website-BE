const { retrieveAllUsers } = require("./../../service")

const createGetUsers = (dependencies = {}) => {
    const retrieveUsers = dependencies.retrieveAllUsers || retrieveAllUsers

    return async (req, res) => {
        const allPlayers = (await retrieveUsers()) || []
        const players = allPlayers.map(({ _id, nickname }) => {
            return {
                id: _id,
                name: nickname,
            }
        })

        return res.status(200).json(players)
    }
}

const getUsers = createGetUsers()

module.exports = getUsers
module.exports.createGetUsers = createGetUsers

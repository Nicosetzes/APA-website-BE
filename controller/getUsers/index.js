const { retrieveAllUsers } = require("./../../service")

const getUsers = async (req, res) => {
    // const { query } = req.query
    try {
        const allPlayers = await retrieveAllUsers()
        const players = allPlayers.map(({ _id, nickname }) => {
            return {
                id: _id,
                name: nickname,
            }
        })
        res.json(players)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getUsers

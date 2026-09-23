const { retrieveTournaments } = require("./../../service")

const createGetTournaments = (dependencies = {}) => {
    const retrieve = dependencies.retrieveTournaments || retrieveTournaments

    return async (req, res) => {
        const { legacy, status } = req.query
        const tournaments = await retrieve(legacy, status)

        return res.status(200).json(tournaments)
    }
}

const getTournaments = createGetTournaments()

module.exports = getTournaments
module.exports.createGetTournaments = createGetTournaments

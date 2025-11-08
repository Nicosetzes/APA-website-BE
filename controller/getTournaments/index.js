const { retrieveTournaments } = require("./../../service")

const getTournaments = async (req, res) => {
    const { status } = req.query

    try {
        const tournamentsFromDB = await retrieveTournaments(status)
        res.status(200).json(tournamentsFromDB)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getTournaments

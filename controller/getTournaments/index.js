const { retrieveTournaments } = require("./../../service")

const getTournaments = async (req, res) => {
    const { status } = req.query

    try {
        let finalized

        if (status == "finalized") {
            finalized = true
        }

        const tournamentsFromDB = await retrieveTournaments(finalized)

        // res.status(200).json({ activeTournaments, inactiveTournaments })

        res.status(200).json(tournamentsFromDB)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getTournaments

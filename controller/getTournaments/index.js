const { retrieveTournaments } = require("./../../service")

const getTournaments = async (req, res) => {
    try {
        const tournaments = await retrieveTournaments()

        const activeTournaments = tournaments.filter(({ ongoing }) => ongoing)
        const inactiveTournaments = tournaments.filter(
            ({ ongoing }) => !ongoing
        )

        res.status(200).json({ activeTournaments, inactiveTournaments })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getTournaments

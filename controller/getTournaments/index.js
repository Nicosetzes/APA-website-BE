const { retrieveTournaments } = require("./../../service")

const getTournaments = async (req, res) => {
    const { active, inactive } = req.query

    try {
        let activeTournaments
        let inactiveTournaments

        if (active)
            activeTournaments = await retrieveTournaments({
                ongoing: true,
            })
        if (inactive)
            inactiveTournaments = await retrieveTournaments({
                ongoing: false,
            })

        res.status(200).json({ activeTournaments, inactiveTournaments })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getTournaments

const { originateTournament } = require("./../../service")

const postTournaments = async (req, res) => {
    const { name, format, players, teams } = req.body

    try {
        let groups
        let newTournament

        if (
            format == "world_cup" ||
            format == "league_playin_playoff" ||
            format == "champions_league"
        ) {
            groups = Array.from(new Set(teams.map(({ group }) => group)))

            newTournament = await originateTournament({
                name,
                players,
                teams,
                format,
                groups,
            })
        } else {
            newTournament = await originateTournament({
                name,
                players,
                teams,
                format,
            })
        }

        res.status(200).json(newTournament)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = postTournaments

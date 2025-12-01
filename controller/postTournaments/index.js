const {
    originateTournament,
    originatePlayoffByTournamentId,
} = require("./../../service")

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
                .filter(Boolean)
                .sort((a, b) => String(a).localeCompare(String(b)))

            newTournament = await originateTournament({
                name,
                players,
                teams,
                format,
                groups,
            })
        } else if (format == "playoff") {
            // Create tournament first
            newTournament = await originateTournament({
                name,
                players,
                teams,
                format,
            })
            // Generate Round of 32 playoff matches
            await originatePlayoffByTournamentId(newTournament, teams)
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

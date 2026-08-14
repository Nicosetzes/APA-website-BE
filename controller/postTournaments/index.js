const {
    originateTournament,
    originatePlayoffByTournamentId,
} = require("./../../service")

const postTournaments = async (req, res) => {
    const { cloudinary_id, format, name, players, teams } = req.body

    try {
        let groups
        let newTournament

        if (
            format == "champions_league" ||
            format == "league_playin_playoff" ||
            format == "super_cup" ||
            format == "world_cup" ||
            format == "world_cup_2026"
        ) {
            groups = Array.from(new Set(teams.map(({ group }) => group)))
                .filter(Boolean)
                .sort((a, b) => String(a).localeCompare(String(b)))

            newTournament = await originateTournament({
                cloudinary_id: cloudinary_id ?? null,
                format,
                groups,
                name,
                players,
                teams,
            })
        } else if (format == "playoff") {
            // Create tournament first
            newTournament = await originateTournament({
                cloudinary_id: cloudinary_id ?? null,
                format,
                name,
                players,
                teams,
            })
            // Generate Round of 32 playoff matches
            await originatePlayoffByTournamentId(newTournament, teams)
        } else {
            newTournament = await originateTournament({
                cloudinary_id: cloudinary_id ?? null,
                format,
                name,
                players,
                teams,
            })
        }

        res.status(200).json(newTournament)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = postTournaments

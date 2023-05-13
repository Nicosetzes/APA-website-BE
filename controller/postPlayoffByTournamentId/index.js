const {
    orderMatchesFromTournamentById,
    originatePlayoffWithPlayinByTournamentId,
    originateWorldCupPlayoffByTournamentId,
    retrieveTournamentById,
    retrievePlayinMatchesByTournamentId,
} = require("./../../service")

const postPlayoffByTournamentId = async (req, res) => {
    const { tournament } = req.params

    try {
        const { id, name, format, teams } = await retrieveTournamentById(
            tournament
        )

        const tournamentForPlayoffGeneration = { id, name }

        const regularMatchesForPlayoffGeneration =
            await orderMatchesFromTournamentById(tournament)

        let playoff

        if (format == "league_playin_playoff") {
            const playinMatchesForPlayoffGeneration =
                await retrievePlayinMatchesByTournamentId(tournament)

            const haveAllPlayinMatchesBeenPlayed =
                playinMatchesForPlayoffGeneration.filter(
                    ({ outcome }) => outcome
                ).length == 6
                    ? true
                    : false

            if (!haveAllPlayinMatchesBeenPlayed)
                return res
                    .status(500)
                    .json({ message: "Aún restan partidos de Playin" })

            const teamsForPlayoffGeneration = {
                teamsFromGroupA: teams.filter((team) => team.group == "A"),
                teamsFromGroupB: teams.filter((team) => team.group == "B"),
            }

            playoff = await originatePlayoffWithPlayinByTournamentId(
                tournamentForPlayoffGeneration,
                teamsForPlayoffGeneration,
                regularMatchesForPlayoffGeneration,
                playinMatchesForPlayoffGeneration
            )
        } else {
            // El formato es world_cup //
            const teamsForPlayoffGeneration = {
                teamsFromGroupA: teams.filter((team) => team.group == "A"),
                teamsFromGroupB: teams.filter((team) => team.group == "B"),
                teamsFromGroupC: teams.filter((team) => team.group == "C"),
                teamsFromGroupD: teams.filter((team) => team.group == "D"),
                teamsFromGroupE: teams.filter((team) => team.group == "E"),
                teamsFromGroupF: teams.filter((team) => team.group == "F"),
                teamsFromGroupG: teams.filter((team) => team.group == "G"),
                teamsFromGroupH: teams.filter((team) => team.group == "H"),
            }
            playoff = await originateWorldCupPlayoffByTournamentId(
                tournamentForPlayoffGeneration,
                teamsForPlayoffGeneration,
                regularMatchesForPlayoffGeneration
            )
        }

        res.status(200).json({ playoff })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = postPlayoffByTournamentId

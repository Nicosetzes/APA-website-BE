const { createPlayoffByTournamentId } = require("./../../dao")
const { groupBy } = require("es-toolkit/array")

const {
    calculate2026WorldCupPlayoffByTournamentId,
    orderMatchesFromTournamentById,
    originateChampionsLeaguePlayoffByTournamentId,
    originatePlayoffWithPlayinByTournamentId,
    originateWorldCupPlayoffByTournamentId,
    retrievePlayinMatchesByTournamentId,
    retrieveTournamentById,
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

        const teamsForPlayoffGeneration = groupBy(teams, (t) => t.group)

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

            playoff = await originatePlayoffWithPlayinByTournamentId(
                tournamentForPlayoffGeneration,
                teamsForPlayoffGeneration,
                regularMatchesForPlayoffGeneration,
                playinMatchesForPlayoffGeneration
            )
        } else if (format == "world_cup") {
            playoff = await originateWorldCupPlayoffByTournamentId(
                tournamentForPlayoffGeneration,
                teamsForPlayoffGeneration,
                regularMatchesForPlayoffGeneration
            )
        } else if (format === "world_cup_2026") {
            const { playoffMatches } =
                calculate2026WorldCupPlayoffByTournamentId(
                    teamsForPlayoffGeneration,
                    regularMatchesForPlayoffGeneration
                )
            playoff = await createPlayoffByTournamentId(
                playoffMatches.map((match, index) => ({
                    ...match,
                    played: false,
                    tournament: tournamentForPlayoffGeneration,
                    type: "playoff",
                }))
            )
        } else {
            playoff = await originateChampionsLeaguePlayoffByTournamentId(
                tournamentForPlayoffGeneration,
                teamsForPlayoffGeneration,
                regularMatchesForPlayoffGeneration
            )
        }

        res.status(200).json(playoff)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = postPlayoffByTournamentId

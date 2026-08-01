const { groupBy } = require("es-toolkit/array")

const {
    calculate2026WorldCupPlayoffByTournamentId,
    orderMatchesFromTournamentById,
    retrieveTournamentById,
} = require("./../../service")

const getPlayoffsPreviewByTournamentId = async (req, res) => {
    const { tournament } = req.params

    try {
        const { id, name, format, teams } = await retrieveTournamentById(
            tournament
        )

        const tournamentForPlayoffGeneration = { id, name }

        const regularMatchesForPlayoffGeneration =
            await orderMatchesFromTournamentById(tournament)

        const teamsForPlayoffGeneration = groupBy(teams, (t) => t.group)

        const { playoffMatches, thirdsTable } =
            await calculate2026WorldCupPlayoffByTournamentId(
                teamsForPlayoffGeneration,
                regularMatchesForPlayoffGeneration
            )

        return res.status(200).json({
            bracketPreview: playoffMatches,
            thirdsTable,
        })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getPlayoffsPreviewByTournamentId

const {
    originateChampionsLeaguePlayoffUpdateByTournamentId,
    originatePlayoffUpdateByTournamentId,
    generate32TeamPlayoffUpdate,
    retrieveTournamentById,
    retrievePlayoffMatchesByTournamentId,
} = require("./../../service")

const postPlayoffUpdateByTournamentId = async (req, res) => {
    const { round } = req.body
    const { tournament } = req.params

    try {
        const { id, name, format } = await retrieveTournamentById(tournament)

        const tournamentForService = { id, name }

        const matches = await retrievePlayoffMatchesByTournamentId(tournament)

        let updatedMatches

        if (format == "champions_league") {
            updatedMatches =
                await originateChampionsLeaguePlayoffUpdateByTournamentId(
                    round,
                    tournamentForService,
                    matches
                )
        } else if (format == "playoff") {
            // For the new 32-team playoff format, generate next round matches
            updatedMatches = await generate32TeamPlayoffUpdate(
                round,
                tournamentForService,
                matches
            )
        } else {
            updatedMatches = await originatePlayoffUpdateByTournamentId(
                round,
                tournamentForService,
                matches
            )
        }

        updatedMatches.length
            ? res.status(200).json({
                  matches: updatedMatches,
                  message: `Se han generado partidos nuevos (${updatedMatches.length})`,
              })
            : res.status(200).json({
                  matches: updatedMatches,
                  message: `No hay partidos nuevos para generar`,
              })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = postPlayoffUpdateByTournamentId

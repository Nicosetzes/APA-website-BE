const {
    originatePlayoffUpdateByTournamentId,
    retrieveTournamentById,
    retrievePlayoffMatchesByTournamentId,
} = require("./../../service")

const postPlayoffUpdateByTournamentId = async (req, res) => {
    const { round } = req.body
    const { tournament } = req.params

    try {
        const { id, name } = await retrieveTournamentById(tournament)

        const tournamentForService = { id, name }

        const matches = await retrievePlayoffMatchesByTournamentId(tournament)

        const updatedMatches = await originatePlayoffUpdateByTournamentId(
            round,
            tournamentForService,
            matches
        )

        updatedMatches.length
            ? res.status(200).json({
                  matches: updatedMatches,
                  message: `Se han generado partidos nuevos (${updatedMatches.length})`,
              })
            : res
                  .status(200)
                  .json({
                      matches: updatedMatches,
                      message: `No hay partidos nuevos para generar`,
                  })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = postPlayoffUpdateByTournamentId

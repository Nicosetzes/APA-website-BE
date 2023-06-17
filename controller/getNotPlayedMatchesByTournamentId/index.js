const {
    calculateAllMatchesByTournamentId,
    retrieveTournamentById,
    retrieveAllNotPlayedMatchesByTournamentId,
} = require("./../../service")

const getNotPlayedMatchesByTournamentId = async (req, res) => {
    try {
        const { tournament } = req.params

        const { players } = await retrieveTournamentById(tournament)

        const allNotPlayedMatches =
            await retrieveAllNotPlayedMatchesByTournamentId(tournament)

        const amountOfTotalMatches = await calculateAllMatchesByTournamentId(
            tournament
        )

        const remainingMatchesInTotal = {
            total: amountOfTotalMatches,
            remaining: allNotPlayedMatches.length,
        }

        const remainingMatchesByPlayer = players.map(({ id, name }) => {
            return {
                id,
                name,
                amount: allNotPlayedMatches.filter(
                    ({ playerP1, playerP2 }) =>
                        playerP1.id == id || playerP2.id == id
                ).length,
            }
        })

        res.status(200).json({
            remainingMatchesInTotal,
            remainingMatchesByPlayer,
        })
        // Agregar excepción en caso de error
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getNotPlayedMatchesByTournamentId

const {
    calculateAllMatchesByTournamentId,
    calculateAllNotPlayedMatchesByTournamentId,
    retrieveTournamentPlayersByTournamentId,
} = require("./../../service")

const getNotPlayedMatchesByTournamentId = async (req, res) => {
    try {
        const { tournament } = req.params

        const selectedPlayers = req.query.players
            ? JSON.parse(req.query.players)
            : []

        const amountOfTotalMatches = await calculateAllMatchesByTournamentId(
            tournament
        )

        const amountOfAllNotPlayedMatches =
            await calculateAllNotPlayedMatchesByTournamentId(tournament)

        const remainingMatchesInTotal = {
            total: amountOfTotalMatches,
            remaining: amountOfAllNotPlayedMatches,
        }

        const players = await retrieveTournamentPlayersByTournamentId(
            tournament
        )

        let remainingMatchesByPlayer

        if (!selectedPlayers.length) {
            // Calculo los partidos restantes para todos los jugadores del torneo //

            const playerIDs = players.map(({ id }) => id)

            const amounts = await calculateAllNotPlayedMatchesByTournamentId(
                tournament,
                playerIDs
            )

            remainingMatchesByPlayer = players.map(({ id, name }, index) => {
                return {
                    id,
                    name,
                    amount: amounts[index],
                }
            })
        } else {
            // Calculo partidos pendientes para los jugadores seleccionados //
            const value = await calculateAllNotPlayedMatchesByTournamentId(
                tournament,
                selectedPlayers
            )
            // console.log(value)
            // Ejecuto el .map //
            remainingMatchesByPlayer = selectedPlayers.map((id) => {
                return {
                    id,
                    name: players.filter((player) => player.id == id).at(0)
                        .name,
                    amount: value,
                }
            })
        }

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

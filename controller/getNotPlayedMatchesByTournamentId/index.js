const {
    calculateAllMatchesByTournamentId,
    retrieveTournamentById,
    retrieveAllNotPlayedMatchesByTournamentId,
} = require("./../../service")

const getNotPlayedMatchesByTournamentId = async (req, res) => {
    try {
        const { tournament } = req.params

        const selectedPlayers = req.query.players
            ? JSON.parse(req.query.players)
            : []

        const { players } = await retrieveTournamentById(tournament)

        let completeSelectedPlayers

        if (selectedPlayers.length) {
            completeSelectedPlayers = selectedPlayers.map((id) => {
                return {
                    id,
                    name: players.filter((player) => player.id == id).at(0)
                        .name,
                }
            })
        }

        const allNotPlayedMatches =
            await retrieveAllNotPlayedMatchesByTournamentId(tournament)

        const amountOfTotalMatches = await calculateAllMatchesByTournamentId(
            tournament
        )

        const remainingMatchesInTotal = {
            total: amountOfTotalMatches,
            remaining: allNotPlayedMatches.length,
        }

        let remainingMatchesByPlayer

        if (!selectedPlayers.length) {
            // Calculo los partidos restantes para todos los jugadores del torneo //
            remainingMatchesByPlayer = players.map(({ id, name }) => {
                return {
                    id,
                    name,
                    amount: allNotPlayedMatches.filter(
                        ({ playerP1, playerP2 }) =>
                            playerP1.id == id || playerP2.id == id
                    ).length,
                }
            })
        } else if (selectedPlayers.length == 1) {
            // Calculo partidos pendientes para los jugadores seleccionados //
            remainingMatchesByPlayer = completeSelectedPlayers.map(
                ({ id, name }) => {
                    return {
                        id,
                        name,
                        amount: allNotPlayedMatches.filter(
                            ({ playerP1, playerP2 }) =>
                                playerP1.id == id || playerP2.id == id
                        ).length,
                    }
                }
            )
        } else {
            // Calculo partidos pendientes entre los 2 jugadores seleccionados //
            remainingMatchesByPlayer = completeSelectedPlayers.map(
                ({ id, name }, index) => {
                    if (index == 0)
                        return {
                            id,
                            name,
                            amount: allNotPlayedMatches.filter(
                                ({ playerP1, playerP2 }) =>
                                    (playerP1.id == id &&
                                        playerP2.id ==
                                            completeSelectedPlayers.at(1).id) ||
                                    (playerP1.id ==
                                        completeSelectedPlayers.at(1).id &&
                                        playerP2.id == id)
                            ).length,
                        }
                    else
                        return {
                            id,
                            name,
                            amount: allNotPlayedMatches.filter(
                                ({ playerP1, playerP2 }) =>
                                    (playerP1.id == id &&
                                        playerP2.id ==
                                            completeSelectedPlayers.at(0).id) ||
                                    (playerP1.id ==
                                        completeSelectedPlayers.at(0).id &&
                                        playerP2.id == id)
                            ).length,
                        }
                }
            )
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

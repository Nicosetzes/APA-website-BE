const {
    orderMatchesFromTournamentById,
    retrieveTournamentById,
} = require("./../../service")

const getStandingsPlayerInfoByTournamentId = async (req, res) => {
    const { tournament } = req.params

    try {
        const tournamentFromDB = await retrieveTournamentById(tournament)
        const matches = await orderMatchesFromTournamentById(tournament)

        const { players, _id } = tournamentFromDB
        const tournamentName = tournamentFromDB.name

        const playerStats = []

        players.forEach((player) => {
            let played = matches.filter(
                ({ playerP1, playerP2 }) =>
                    playerP1.id == player.id || playerP2.id == player.id
            ).length

            let wins = matches.filter(
                (match) => match.outcome?.playerThatWon?.id === player.id
            ).length

            let losses = matches.filter(
                (match) => match.outcome?.playerThatLost?.id === player.id
            ).length

            let draws = played - wins - losses

            let points = wins * 3 + draws

            let streak = matches
                .filter(
                    ({ playerP1, playerP2 }) =>
                        playerP1.id == player.id || playerP2.id == player.id
                )
                .splice(0, 10) // REVISAR //
                .map(
                    ({
                        outcome,
                        id,
                        playerP1,
                        teamP1,
                        scoreP1,
                        playerP2,
                        teamP2,
                        scoreP2,
                        updatedAt,
                    }) => {
                        const { playerThatWon } = outcome
                        const { playerThatLost } = outcome
                        const { teamThatWon } = outcome
                        const { scoreFromTeamThatWon } = outcome
                        const { teamThatLost } = outcome
                        const { scoreFromTeamThatLost } = outcome
                        if (playerThatWon && playerThatWon.id == player.id)
                            return {
                                outcome: "w",
                                playerP1: playerThatWon,
                                teamP1: teamThatWon,
                                scoreP1: scoreFromTeamThatWon,
                                playerP2: playerThatLost,
                                teamP2: teamThatLost,
                                scoreP2: scoreFromTeamThatLost,
                                date: updatedAt
                                    ? new Date(updatedAt).toLocaleString()
                                    : new Date(
                                          parseInt(id.substring(0, 8), 16) *
                                              1000
                                      ).toLocaleDateString(),
                            }
                        if (playerThatLost && playerThatLost.id == player.id)
                            return {
                                outcome: "l",
                                playerP1: playerThatLost,
                                teamP1: teamThatLost,
                                scoreP1: scoreFromTeamThatLost,
                                playerP2: playerThatWon,
                                teamP2: teamThatWon,
                                scoreP2: scoreFromTeamThatWon,
                                date: updatedAt
                                    ? new Date(updatedAt).toLocaleString()
                                    : new Date(
                                          parseInt(id.substring(0, 8), 16) *
                                              1000
                                      ).toLocaleDateString(),
                            }
                        if (outcome.draw)
                            return {
                                outcome: "d",
                                playerP1,
                                teamP1,
                                scoreP1,
                                playerP2,
                                teamP2,
                                scoreP2,
                                date: updatedAt
                                    ? new Date(updatedAt).toLocaleString()
                                    : new Date(
                                          parseInt(id.substring(0, 8), 16) *
                                              1000
                                      ).toLocaleDateString(),
                            }
                    }
                )
                .reverse()

            playerStats.push({
                player: { name: player.name, id: player.id },
                tournament: { name: tournamentName, id: _id },
                played,
                wins,
                draws,
                losses,
                points,
                streak,
            })
        })
        res.send(playerStats)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getStandingsPlayerInfoByTournamentId
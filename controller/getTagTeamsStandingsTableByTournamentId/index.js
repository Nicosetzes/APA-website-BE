const {
    retrieveTournamentById,
    orderMatchesFromTournamentById,
} = require("./../../service")

const getTagTeamsStandingsTableByTournamentId = async (req, res) => {
    const { tournament } = req.params

    try {
        const standings = []

        const { id, name, players } = await retrieveTournamentById(tournament)

        const matches = await orderMatchesFromTournamentById(tournament)

        players.forEach(async ({ id, name }) => {
            let played = matches.filter(
                ({ playerP1, playerP2, playerP3, playerP4 }) =>
                    playerP1.id == id ||
                    playerP2.id == id ||
                    playerP3.id == id ||
                    playerP4?.id == id
            ).length
            let wins = matches.filter(({ outcome }) =>
                outcome?.playerThatWon
                    ?.filter((player) => player.id == id)
                    .at(0)
            ).length
            let draws = matches.filter(
                ({ playerP1, playerP2, playerP3, playerP4, outcome }) =>
                    (playerP1.id == id ||
                        playerP2.id == id ||
                        playerP3.id == id ||
                        playerP4?.id == id) &&
                    outcome?.draw
            ).length
            let losses = matches.filter(({ outcome }) =>
                outcome?.playerThatLost
                    ?.filter((player) => player.id == id)
                    .at(0)
            ).length
            let goalsFor =
                matches
                    .filter(
                        ({ playerP1, playerP2 }) =>
                            playerP1.id == id || playerP2.id == id
                    )
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0) +
                matches
                    .filter(
                        ({ playerP3, playerP4 }) =>
                            playerP3.id == id || playerP4?.id == id
                    )
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0)
            let goalsAgainst =
                matches
                    .filter(
                        ({ playerP1, playerP2 }) =>
                            playerP1.id == id || playerP2.id == id
                    )
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0) +
                matches
                    .filter(
                        ({ playerP3, playerP4 }) =>
                            playerP3.id == id || playerP4?.id == id
                    )
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0)
            let scoringDifference = goalsFor - goalsAgainst
            let points = wins * 3 + draws
            let streak = matches
                .filter(
                    ({ playerP1, playerP2, playerP3, playerP4 }) =>
                        playerP1.id == id ||
                        playerP2.id == id ||
                        playerP3.id == id ||
                        playerP4?.id == id
                )
                .splice(0, 5) // REVISAR //
                .map(
                    ({
                        outcome,
                        playerP1,
                        playerP2,
                        playerP3,
                        playerP4,
                        teamP1,
                        teamP2,
                        scoreP1,
                        scoreP2,
                        updatedAt,
                    }) => {
                        if (
                            outcome?.playerThatWon
                                ?.filter((player) => player.id == id)
                                .at(0)?.id == id
                        )
                            return {
                                outcome: "w",
                                playerP1,
                                playerP2,
                                playerP3,
                                playerP4,
                                teamP1,
                                teamP2,
                                scoreP1,
                                scoreP2,
                                date: updatedAt
                                    ? new Date(updatedAt).toLocaleString()
                                    : new Date(
                                          parseInt(id.substring(0, 8), 16) *
                                              1000
                                      ).toLocaleDateString(),
                            }
                        if (
                            outcome?.playerThatLost
                                ?.filter((player) => player.id == id)
                                .at(0)?.id == id
                        )
                            return {
                                outcome: "l",
                                playerP1,
                                playerP2,
                                playerP3,
                                playerP4,
                                teamP1,
                                teamP2,
                                scoreP1,
                                scoreP2,
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
                                playerP2,
                                playerP3,
                                playerP4,
                                teamP1,
                                teamP2,
                                scoreP1,
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

            standings.push({
                player: { id, name },
                played,
                wins,
                draws,
                losses,
                goalsFor,
                goalsAgainst,
                scoringDifference,
                points,
                streak,
            })
        })

        let sortedStandings = standings.sort(function (a, b) {
            if (a.points > b.points) return -1
            if (a.points < b.points) return 1

            if (a.scoringDifference > b.scoringDifference) return -1
            if (a.scoringDifference < b.scoringDifference) return 1

            if (a.goalsFor > b.goalsFor) return -1
            if (a.goalsFor < b.goalsFor) return 1

            if (a.goalsAgainst > b.goalsAgainst) return 1
            if (a.goalsAgainst < b.goalsAgainst) return -1
        })

        res.status(200).send({
            id,
            name,
            standings: sortedStandings,
        })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getTagTeamsStandingsTableByTournamentId

const { retrieveAllUsers, retrieveMatches } = require("./../../service")

const getStatistics = async (req, res) => {
    try {
        const players = await retrieveAllUsers()
        const response = {
            playerStats: [],
            recentMatches: [],
            accolades: {},
        }
        let count = 0

        const playerWins = []
        const playerDraws = []
        const playerLosses = []

        const matches = await retrieveMatches({})

        const amountOfRecentMatchesToDisplay = 8

        for (let {
            playerP1,
            playerP2,
            teamP1,
            teamP2,
            scoreP1,
            scoreP2,
            tournament,
            id,
            updatedAt,
        } of matches) {
            response.recentMatches.push({
                playerP1,
                playerP2,
                teamP1,
                teamP2,
                scoreP1,
                scoreP2,
                tournament: tournament.name,
                date: updatedAt
                    ? new Date(updatedAt).toLocaleString()
                    : new Date(
                          parseInt(id.substring(0, 8), 16) * 1000
                      ).toLocaleDateString(),
            })
            if (
                response.recentMatches.length === amountOfRecentMatchesToDisplay
            )
                break
        }

        players.forEach(async ({ nickname, _id }) => {
            let totalMatches = matches.filter(
                ({ playerP1, playerP2 }) =>
                    playerP1.name === nickname || playerP2.name === nickname
            ).length

            let wins = matches.filter(
                ({ outcome }) => outcome?.playerThatWon?.name === nickname
            ).length

            let losses = matches.filter(
                ({ outcome }) => outcome?.playerThatLost?.name === nickname
            ).length

            let draws = totalMatches - wins - losses

            playerWins.push({
                player: nickname,
                wins,
            })

            playerDraws.push({
                player: nickname,
                draws,
            })

            playerLosses.push({
                player: nickname,
                losses,
            })

            response.playerStats.push({
                player: nickname,
                wins,
                draws,
                losses,
                totalMatches,
                effectiveness: Number(
                    (((wins * 3 + draws) / (totalMatches * 3)) * 100).toFixed(2)
                ),
            })

            count++
            if (count === players.length) {
                let sortedPlayerWins = playerWins.sort((a, b) =>
                    a.wins > b.wins ? -1 : 1
                )
                let sortedPlayerDraws = playerDraws.sort((a, b) =>
                    a.draws > b.draws ? -1 : 1
                )
                let sortedPlayerLosses = playerLosses.sort((a, b) =>
                    a.losses > b.losses ? -1 : 1
                )
                response.accolades.mostWins = {
                    player: sortedPlayerWins[0].player,
                    wins: sortedPlayerWins[0].wins,
                }
                response.accolades.mostDraws = {
                    player: sortedPlayerDraws[0].player,
                    draws: sortedPlayerDraws[0].draws,
                }
                response.accolades.mostLosses = {
                    player: sortedPlayerLosses[0].player,
                    losses: sortedPlayerLosses[0].losses,
                }
                res.status(200).send(response)
            }
        })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getStatistics

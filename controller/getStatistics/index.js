const {
    // calculateMatchesFromPlayer,
    // calculateMatchLossesFromPlayer,
    // calculateMatchWinsFromPlayer,
    retrieveAllUsers,
    retrieveAllMatches,
} = require("./../../service")

const getStatistics = async (req, res) => {
    try {
        const players = await retrieveAllUsers()
        const playerStats = []
        let count = 0

        const playerWins = []
        const playerDraws = []
        const playerLosses = []

        const matches = await retrieveAllMatches()

        players.forEach(async ({ nickname, id }) => {
            let totalMatches = matches.filter(
                ({ playerP1, playerP2 }) =>
                    playerP1.id === id || playerP2.id === id
            ).length

            let wins = matches.filter(
                ({ outcome }) => outcome?.playerThatWon?.id === id
            ).length

            let losses = matches.filter(
                ({ outcome }) => outcome?.playerThatLost?.id === id
            ).length

            let draws = totalMatches - wins - losses

            playerWins.push({
                player: { id, name: nickname },
                wins,
            })

            playerDraws.push({
                player: { id, name: nickname },
                draws,
            })

            playerLosses.push({
                player: { id, name: nickname },
                losses,
            })

            playerStats.push({
                player: { id, name: nickname },
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
                res.status(200).send({ playerStats })
            }
        })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getStatistics

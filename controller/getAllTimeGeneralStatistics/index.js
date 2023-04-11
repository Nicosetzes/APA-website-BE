const { retrieveAllUsers, retrieveMatches } = require("./../../service")

const getAllTimeGeneralStatistics = async (req, res) => {
    try {
        const players = await retrieveAllUsers()
        const matches = await retrieveMatches()

        const stats = []

        players.forEach(({ nickname, _id }) => {
            let played = matches.filter(
                ({ playerP1, playerP2 }) =>
                    playerP1.id == _id || playerP2.id == _id
            ).length
            let bestWin = matches
                .filter(({ outcome }) => outcome.playerThatWon?.id == _id)
                .sort((a, b) =>
                    a.outcome.scoringDifference > b.outcome.scoringDifference
                        ? -1
                        : 1
                )
                .at(0)
            let worstLoss = matches
                .filter(({ outcome }) => outcome.playerThatLost?.id == _id)
                .sort((a, b) =>
                    a.outcome.scoringDifference > b.outcome.scoringDifference
                        ? -1
                        : 1
                )
                .at(0)
            let bestTeam = matches
                .filter(({ outcome }) => outcome.playerThatWon?.id == _id)
                .map(({ outcome }) => outcome.teamThatWon.name)
                .reduce((acc, curr) => {
                    return acc[curr] ? ++acc[curr] : (acc[curr] = 1), acc
                }, {})

            stats.push({
                player: { name: nickname, id: _id },
                played,
                bestWin,
                worstLoss,
                bestTeam,
            })
        })

        res.status(200).send(stats)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getAllTimeGeneralStatistics

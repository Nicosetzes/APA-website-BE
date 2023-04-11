const {
    retrieveTournamentById,
    retrieveMatchesByTournamentIds,
} = require("./../../service")

const getPlayoffsPlayerInfoByTournamentId = async (req, res) => {
    const { tournament } = req.params

    try {
        const playoffs = await retrieveTournamentById(tournament)

        const { parents, players } = playoffs

        const idsFromParents = parents.map(({ id }) => id)

        const matches = await retrieveMatchesByTournamentIds([tournament])

        const playoffsPlayerStats = []

        players.forEach(({ id, name }) => {
            let played = matches.filter(
                ({ playerP1, playerP2 }) =>
                    playerP1.id == id || playerP2.id == id
            ).length

            let wins = matches.filter(
                ({ outcome }) => outcome?.playerThatWon?.id == id
            ).length

            let losses = matches.filter(
                ({ outcome }) => outcome?.playerThatLost?.id == id
            ).length

            let draws = played - wins - losses

            let points = wins * 3 + draws

            playoffsPlayerStats.push({
                player: { name, id },
                played,
                wins,
                draws,
                losses,
                points,
            })
            if (playoffsPlayerStats.length == players.length)
                res.send(playoffsPlayerStats)
        })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getPlayoffsPlayerInfoByTournamentId

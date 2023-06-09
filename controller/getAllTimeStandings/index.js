const { retrieveAllUsers, retrieveAllMatches } = require("./../../service")

const getAllTimeStandings = async (req, res) => {
    try {
        const players = await retrieveAllUsers()
        const matches = await retrieveAllMatches()

        const standings = []

        players.forEach(({ nickname, _id }) => {
            let played = matches.filter(
                ({ playerP1, playerP2 }) =>
                    playerP1.id == _id || playerP2.id == _id
            ).length
            let wins = matches.filter(
                ({ outcome }) => outcome.playerThatWon?.id == _id
            ).length
            let draws = matches.filter(
                ({ playerP1, playerP2, outcome }) =>
                    outcome.draw &&
                    !outcome.penalties &&
                    (playerP1.id == _id || playerP2.id == _id)
            ).length
            let losses = matches.filter(
                ({ outcome }) => outcome.playerThatLost?.id == _id
            ).length
            let goalsFor =
                matches
                    .filter(({ playerP1 }) => playerP1.id == _id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0) +
                matches
                    .filter(({ playerP2 }) => playerP2.id == _id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0)
            let goalsAgainst =
                matches
                    .filter(({ playerP1 }) => playerP1.id == _id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0) +
                matches
                    .filter(({ playerP2 }) => playerP2.id == _id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0)
            let scoringDifference = goalsFor - goalsAgainst
            let effectiveness = Number(
                (((wins * 3 + draws) / (played * 3)) * 100).toFixed(2)
            )
            let points = wins * 3 + draws

            standings.push({
                player: { name: nickname, id: _id },
                played,
                wins,
                draws,
                losses,
                goalsFor,
                goalsAgainst,
                scoringDifference,
                effectiveness,
                points,
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

        res.status(200).send(sortedStandings)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getAllTimeStandings

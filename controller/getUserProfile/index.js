const {
    retrieveAllMatchesByUserId,
    retrieveUserById,
} = require("./../../service")

const getUsers = async (req, res) => {
    const { id } = req.query
    try {
        // const stats = {}
        const user = await retrieveUserById(id)
        const matches = await retrieveAllMatchesByUserId(id)
        let wins = matches
            .filter(
                ({ outcome }) =>
                    !outcome.penalties && outcome.playerThatWon?.id == id
            )
            .map(({ _id }) => {
                return { id: _id }
            })
        // .map(({ outcome, updatedAt, type }) => {
        //     return { outcome, updatedAt, type }
        // })

        let winsByPenalties = matches
            .filter(
                ({ outcome }) =>
                    outcome.penalties && outcome.playerThatWon?.id == id
            )
            .map(({ _id }) => {
                return { id: _id }
            })
        // .map(({ scoreP1, outcome, updatedAt, type }) => {
        //     return { drawScore: scoreP1, outcome, updatedAt, type }
        // })

        let draws = matches
            .filter(({ outcome }) => !outcome.penalties && outcome.draw)
            .map(({ _id }) => {
                return { id: _id }
            })
        // .map(({ outcome, updatedAt, type }) => {
        //     return { outcome, updatedAt, type }
        // })

        let losses = matches
            .filter(
                ({ outcome }) =>
                    !outcome.penalties && outcome.playerThatLost?.id == id
            )
            .map(({ _id }) => {
                return { id: _id }
            })
        // .map(({ outcome, updatedAt, type }) => {
        //     return { outcome, updatedAt, type }
        // })

        let lossesByPenalties = matches
            .filter(
                ({ outcome }) =>
                    outcome.penalties && outcome.playerThatLost?.id == id
            )
            .map(({ _id }) => {
                return { id: _id }
            })
        // .map(({ scoreP1, outcome, updatedAt, type }) => {
        //     return { drawScore: scoreP1, outcome, updatedAt, type }
        // })

        let goalsFor =
            matches
                .filter(({ playerP1 }) => playerP1.id == id)
                .reduce((acc, curr) => {
                    return acc + curr.scoreP1
                }, 0) +
            matches
                .filter(({ playerP2 }) => playerP2.id == id)
                .reduce((acc, curr) => {
                    return acc + curr.scoreP2
                }, 0)
        let goalsAgainst =
            matches
                .filter(({ playerP1 }) => playerP1.id == id)
                .reduce((acc, curr) => {
                    return acc + curr.scoreP2
                }, 0) +
            matches
                .filter(({ playerP2 }) => playerP2.id == id)
                .reduce((acc, curr) => {
                    return acc + curr.scoreP1
                }, 0)
        let scoringDifference = goalsFor - goalsAgainst

        res.status(200).json({
            user,
            stats: {
                total: matches.length,
                wins: {
                    matches: wins,
                    amount: wins.length,
                },
                winsByPenalties: {
                    matches: winsByPenalties,
                    amount: winsByPenalties.length,
                },
                draws: {
                    matches: draws,
                    amount: draws.length,
                },
                losses: {
                    matches: losses,
                    amount: losses.length,
                },
                lossesByPenalties: {
                    matches: lossesByPenalties,
                    amount: lossesByPenalties.length,
                },
                goalsFor,
                goalsAgainst,
                scoringDifference,
            },
        })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getUsers

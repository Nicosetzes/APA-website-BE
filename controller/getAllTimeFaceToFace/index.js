const { retrieveAllUsers, retrieveAllMatches } = require("./../../service")

const getAllTimeFaceToFace = async (req, res) => {
    try {
        const players = await retrieveAllUsers()
        const matches = await retrieveAllMatches()

        const allMatchups = players.flatMap((v, i) =>
            players.slice(i + 1).map((w) => {
                return {
                    p1: { id: w.id, name: w.nickname },
                    p2: { id: v.id, name: v.nickname },
                }
            })
        )

        let firstPlayerWins
        let firstPlayerAmountOfWins
        let firstPlayerBestWin
        let firstPlayerDraws
        let firstPlayerLosses
        let firstPlayerAmountOfLosses
        let firstPlayerWorstLoss
        let firstPlayerAmountOfMatches
        let firstPlayerGoalsFor
        let firstPlayerGoalsAgainst
        let firstPlayerScoringDifference

        const faceToFace = []

        allMatchups.forEach(({ p1, p2 }) => {
            const selectedMatches = matches.filter(
                ({ playerP1, playerP2 }) =>
                    (playerP1.id == p1.id && playerP2.id == p2.id) ||
                    (playerP2.id == p1.id && playerP1.id == p2.id)
            )

            firstPlayerWins = selectedMatches.filter(({ outcome }) => {
                let { playerThatWon } = outcome
                return playerThatWon && playerThatWon.id == p1.id
            })

            // firstPlayerBestWin = firstPlayerWins.sort((a, b) =>
            //     a.outcome.scoringDifference > b.outcome.scoringDifference
            //         ? -1
            //         : 1
            // )[0].outcome

            firstPlayerBestWin = firstPlayerWins.sort(function (a, b) {
                if (a.outcome.scoringDifference > b.outcome.scoringDifference)
                    return -1
                if (a.outcome.scoringDifference < b.outcome.scoringDifference)
                    return 1

                if (
                    a.outcome.scoreFromTeamThatWon >
                    b.outcome.scoreFromTeamThatWon
                )
                    return -1
                if (
                    a.outcome.scoreFromTeamThatWon <
                    b.outcome.scoreFromTeamThatWon
                )
                    return 1

                if (a.updatedAt > b.updatedAt) return 1
                if (a.updatedAt < b.updatedAt) return -1
            })[0].outcome

            firstPlayerAmountOfWins = firstPlayerWins.length

            firstPlayerDraws = selectedMatches.filter(({ outcome }) => {
                let { draw } = outcome
                return draw
            }).length

            firstPlayerLosses = selectedMatches.filter(({ outcome }) => {
                let { playerThatLost } = outcome
                return playerThatLost && playerThatLost.id == p1.id
            })

            firstPlayerWorstLoss = firstPlayerLosses.sort(function (a, b) {
                if (a.outcome.scoringDifference > b.outcome.scoringDifference)
                    return -1
                if (a.outcome.scoringDifference < b.outcome.scoringDifference)
                    return 1

                if (
                    a.outcome.scoreFromTeamThatLost >
                    b.outcome.scoreFromTeamThatLost
                )
                    return -1
                if (
                    a.outcome.scoreFromTeamThatLost <
                    b.outcome.scoreFromTeamThatLost
                )
                    return 1

                if (a.updatedAt > b.updatedAt) return 1
                if (a.updatedAt < b.updatedAt) return -1
            })[0].outcome

            firstPlayerAmountOfLosses = firstPlayerLosses.length

            firstPlayerGoalsFor =
                selectedMatches
                    .filter(({ playerP1 }) => playerP1.id == p1.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0) +
                selectedMatches
                    .filter(({ playerP2 }) => playerP2.id == p1.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0)

            firstPlayerGoalsAgainst =
                selectedMatches
                    .filter(({ playerP1 }) => playerP1.id == p1.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0) +
                selectedMatches
                    .filter(({ playerP2 }) => playerP2.id == p1.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0)

            firstPlayerScoringDifference =
                firstPlayerGoalsFor - firstPlayerGoalsAgainst

            faceToFace.push({
                p1: {
                    id: p1.id,
                    name: p1.name,
                    played:
                        firstPlayerAmountOfWins +
                        firstPlayerDraws +
                        firstPlayerAmountOfLosses,
                    wins: firstPlayerAmountOfWins,
                    bestWin: firstPlayerBestWin,
                    draws: firstPlayerDraws,
                    losses: firstPlayerAmountOfLosses,
                    goalsFor: firstPlayerGoalsFor,
                    goalsAgainst: firstPlayerGoalsAgainst,
                    scoringDifference: firstPlayerScoringDifference,
                },
                p2: {
                    id: p2.id,
                    name: p2.name,
                    played:
                        firstPlayerAmountOfWins +
                        firstPlayerDraws +
                        firstPlayerAmountOfLosses,
                    wins: firstPlayerAmountOfLosses,
                    bestWin: firstPlayerWorstLoss,
                    draws: firstPlayerDraws,
                    losses: firstPlayerAmountOfWins,
                    goalsFor: firstPlayerGoalsAgainst,
                    goalsAgainst: firstPlayerGoalsFor,
                    scoringDifference:
                        firstPlayerGoalsAgainst - firstPlayerGoalsFor,
                },
            })
        })

        res.status(200).send(faceToFace)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getAllTimeFaceToFace

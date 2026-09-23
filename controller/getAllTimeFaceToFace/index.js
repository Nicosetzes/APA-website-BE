const { retrieveAllUsers, retrieveAllMatches } = require("./../../service")

const createGetAllTimeFaceToFace = (dependencies = {}) => {
    const retrieveUsers = dependencies.retrieveAllUsers || retrieveAllUsers
    const retrieveMatches =
        dependencies.retrieveAllMatches || retrieveAllMatches

    return async (req, res) => {
        const players = (await retrieveUsers()) || []
        const matches = (await retrieveMatches()) || []

        const allMatchups = players.flatMap((v, i) =>
            players.slice(i + 1).map((w) => {
                return {
                    p1: { id: w.id, name: w.nickname },
                    p2: { id: v.id, name: v.nickname },
                }
            })
        )

        const faceToFace = []

        allMatchups.forEach(({ p1, p2 }) => {
            // Los acumuladores viven dentro del loop: antes eran variables del
            // scope exterior y un cruce sin victorias heredaba los valores del
            // cruce anterior.
            let firstPlayerAmountOfWins = 0
            let firstPlayerBestWin = null
            let firstPlayerAmountOfLosses = 0
            let firstPlayerWorstLoss = null

            const selectedMatches = matches.filter(
                ({ playerP1, playerP2 }) =>
                    (playerP1?.id == p1.id && playerP2?.id == p2.id) ||
                    (playerP2?.id == p1.id && playerP1?.id == p2.id)
            )

            const firstPlayerWins = selectedMatches.filter(({ outcome }) => {
                const { draw, playerThatWon } = outcome || {}
                return playerThatWon && !draw && playerThatWon.id == p1.id
            })

            if (firstPlayerWins.length) {
                /* If user hasn't won any matches, it will still be included (otherwise it breaks) */
                firstPlayerBestWin = firstPlayerWins.sort(function (a, b) {
                    if (
                        a.outcome.scoringDifference >
                        b.outcome.scoringDifference
                    )
                        return -1
                    if (
                        a.outcome.scoringDifference <
                        b.outcome.scoringDifference
                    )
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
            }

            const firstPlayerDraws = selectedMatches.filter(({ outcome }) => {
                const { draw } = outcome || {}
                return draw
            }).length

            const firstPlayerLosses = selectedMatches.filter(({ outcome }) => {
                const { draw, playerThatLost } = outcome || {}
                return playerThatLost && !draw && playerThatLost.id == p1.id
            })

            if (firstPlayerLosses.length) {
                /* If user hasn't lost any matches, it will still be included (otherwise it breaks) */
                firstPlayerWorstLoss = firstPlayerLosses.sort(function (a, b) {
                    if (
                        a.outcome.scoringDifference >
                        b.outcome.scoringDifference
                    )
                        return -1
                    if (
                        a.outcome.scoringDifference <
                        b.outcome.scoringDifference
                    )
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
            }

            const firstPlayerGoalsFor =
                selectedMatches
                    .filter(({ playerP1 }) => playerP1?.id == p1.id)
                    .reduce((acc, curr) => {
                        return acc + (Number(curr.scoreP1) || 0)
                    }, 0) +
                selectedMatches
                    .filter(({ playerP2 }) => playerP2?.id == p1.id)
                    .reduce((acc, curr) => {
                        return acc + (Number(curr.scoreP2) || 0)
                    }, 0)

            const firstPlayerGoalsAgainst =
                selectedMatches
                    .filter(({ playerP1 }) => playerP1?.id == p1.id)
                    .reduce((acc, curr) => {
                        return acc + (Number(curr.scoreP2) || 0)
                    }, 0) +
                selectedMatches
                    .filter(({ playerP2 }) => playerP2?.id == p1.id)
                    .reduce((acc, curr) => {
                        return acc + (Number(curr.scoreP1) || 0)
                    }, 0)

            const firstPlayerScoringDifference =
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

        return res.status(200).send(faceToFace)
    }
}

const getAllTimeFaceToFace = createGetAllTimeFaceToFace()

module.exports = getAllTimeFaceToFace
module.exports.createGetAllTimeFaceToFace = createGetAllTimeFaceToFace

const {
    retrieveAllUsers,
    retrieveRecentMatchesFromPlayer,
} = require("./../../service")

const getStreaks = async (req, res) => {
    try {
        const players = await retrieveAllUsers()
        const response = {
            playerStreaks: [],
        }

        let count = 0

        players.forEach(async ({ nickname }) => {
            let recentMatches = await retrieveRecentMatchesFromPlayer(nickname)

            let streak = recentMatches
                .map(
                    ({
                        playerP1,
                        teamP1,
                        scoreP1,
                        playerP2,
                        teamP2,
                        scoreP2,
                        outcome,
                        id,
                        tournament,
                        updatedAt,
                    }) => {
                        const { playerThatWon } = outcome
                        const { playerThatLost } = outcome

                        if (playerThatWon && playerThatWon.name == nickname)
                            return {
                                outcome: "w",
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
                                tournament: tournament.name,
                            }
                        else if (
                            playerThatLost &&
                            playerThatLost.name == nickname
                        )
                            return {
                                outcome: "l",
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
                                tournament: tournament.name,
                            }
                        else
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
                                tournament: tournament.name,
                            }
                    }
                )
                .reverse()

            response.playerStreaks.push({
                player: nickname,
                streak,
            })

            count++

            if (count === players.length) {
                res.status(200).send(response)
            }
        })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getStreaks

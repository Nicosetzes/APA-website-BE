const { modifyMatchResult } = require("./../../service")

const putTagTeamsMatchByTournamentId = async (req, res) => {
    const { match } = req.params

    try {
        const {
            playerP1,
            playerP2,
            playerP3,
            playerP4,
            teamP1,
            teamP2,
            scoreP1,
            scoreP2,
        } = req.body

        let outcome

        if (!playerP4) {
            // Fue 2 vs 1
            if (scoreP1 - scoreP2 !== 0) {
                scoreP1 > scoreP2
                    ? (outcome = {
                          playerThatWon: [playerP1, playerP2],
                          teamThatWon: teamP1,
                          scoreFromTeamThatWon: scoreP1,
                          playerThatLost: [playerP3],
                          teamThatLost: teamP2,
                          scoreFromTeamThatLost: scoreP2,
                          draw: false,
                          scoringDifference: Math.abs(scoreP1 - scoreP2),
                      })
                    : (outcome = {
                          playerThatWon: [playerP3],
                          teamThatWon: teamP2,
                          scoreFromTeamThatWon: scoreP2,
                          playerThatLost: [playerP1, playerP2],
                          teamThatLost: teamP1,
                          scoreFromTeamThatLost: scoreP1,
                          draw: false,
                          scoringDifference: Math.abs(scoreP1 - scoreP2),
                      })
            } else {
                // Empate
                outcome = {
                    draw: true,
                    penalties: false,
                }
            }
        } else {
            // Fue 2 vs 2
            if (scoreP1 - scoreP2 !== 0) {
                scoreP1 > scoreP2
                    ? (outcome = {
                          playerThatWon: [playerP1, playerP2],
                          teamThatWon: teamP1,
                          scoreFromTeamThatWon: scoreP1,
                          playerThatLost: [playerP3, playerP4],
                          teamThatLost: teamP2,
                          scoreFromTeamThatLost: scoreP2,
                          draw: false,
                          scoringDifference: Math.abs(scoreP1 - scoreP2),
                      })
                    : (outcome = {
                          playerThatWon: [playerP3, playerP4],
                          teamThatWon: teamP2,
                          scoreFromTeamThatWon: scoreP2,
                          playerThatLost: [playerP1, playerP2],
                          teamThatLost: teamP1,
                          scoreFromTeamThatLost: scoreP1,
                          draw: false,
                          scoringDifference: Math.abs(scoreP1 - scoreP2),
                      })
            } else {
                // Empate
                outcome = {
                    draw: true,
                    penalties: false,
                }
            }
        }

        const uploadedMatch = await modifyMatchResult(
            match,
            scoreP1,
            scoreP2,
            outcome
        )

        uploadedMatch
            ? res.status(200).send(uploadedMatch)
            : res.status(500).send({ error: "Match wasn't found in the DB" })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = putTagTeamsMatchByTournamentId

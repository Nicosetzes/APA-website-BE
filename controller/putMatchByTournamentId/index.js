const { modifyMatchResult } = require("./../../service")

const putMatchByTournamentId = async (req, res) => {
    const { match } = req.params
    try {
        const {
            playerP1,
            teamP1,
            seedP1,
            scoreP1,
            penaltyScoreP1,
            playerP2,
            teamP2,
            seedP2,
            scoreP2,
            penaltyScoreP2,
            valid,
        } = req.body

        let outcome

        if (!seedP1 || !seedP2) {
            // El partido es de temporada regular (sin seed en outcome, no puede haber penales) //
            if (scoreP1 - scoreP2 !== 0) {
                scoreP1 > scoreP2
                    ? (outcome = {
                          playerThatWon: playerP1,
                          teamThatWon: teamP1,
                          scoreFromTeamThatWon: scoreP1,
                          playerThatLost: playerP2,
                          teamThatLost: teamP2,
                          scoreFromTeamThatLost: scoreP2,
                          draw: false,
                          scoringDifference: Math.abs(scoreP1 - scoreP2), // Es indistinto el orden, pues calculo valor absoluto.
                      })
                    : (outcome = {
                          playerThatWon: playerP2,
                          teamThatWon: teamP2,
                          scoreFromTeamThatWon: scoreP2,
                          playerThatLost: playerP1,
                          teamThatLost: teamP1,
                          scoreFromTeamThatLost: scoreP1,
                          draw: false,
                          scoringDifference: Math.abs(scoreP1 - scoreP2), // Es indistinto el orden, pues calculo valor absoluto.
                      })
            } else {
                // Empate, pero no hubo penales!
                outcome = {
                    draw: true,
                    penalties: false,
                }
            }
        } else {
            // El partido es de playin o de playoffs (le agrego seed en outcome, puede haber penales) //
            if (scoreP1 - scoreP2 !== 0) {
                scoreP1 > scoreP2
                    ? (outcome = {
                          playerThatWon: playerP1,
                          teamThatWon: teamP1,
                          seedFromTeamThatWon: seedP1,
                          scoreFromTeamThatWon: scoreP1,
                          playerThatLost: playerP2,
                          teamThatLost: teamP2,
                          seedFromTeamThatLost: seedP2,
                          scoreFromTeamThatLost: scoreP2,
                          draw: false,
                          scoringDifference: Math.abs(scoreP1 - scoreP2), // Es indistinto el orden, pues calculo valor absoluto.
                      })
                    : (outcome = {
                          playerThatWon: playerP2,
                          teamThatWon: teamP2,
                          seedFromTeamThatWon: seedP2,
                          scoreFromTeamThatWon: scoreP2,
                          playerThatLost: playerP1,
                          teamThatLost: teamP1,
                          seedFromTeamThatLost: seedP1,
                          scoreFromTeamThatLost: scoreP1,
                          draw: false,
                          scoringDifference: Math.abs(scoreP1 - scoreP2), // Es indistinto el orden, pues calculo valor absoluto.
                      })
            } else {
                // Empate, y hubo penales (no puede haber empate sin penales) //
                penaltyScoreP1 > penaltyScoreP2
                    ? (outcome = {
                          playerThatWon: playerP1,
                          teamThatWon: teamP1,
                          seedFromTeamThatWon: seedP1,
                          scoreFromTeamThatWon: penaltyScoreP1,
                          playerThatLost: playerP2,
                          teamThatLost: teamP2,
                          seedFromTeamThatLost: seedP2,
                          scoreFromTeamThatLost: penaltyScoreP2,
                          draw: true,
                          penalties: true,
                      })
                    : (outcome = {
                          playerThatWon: playerP2,
                          teamThatWon: teamP2,
                          seedFromTeamThatWon: seedP2,
                          scoreFromTeamThatWon: penaltyScoreP2,
                          playerThatLost: playerP1,
                          teamThatLost: teamP1,
                          seedFromTeamThatLost: seedP1,
                          scoreFromTeamThatLost: penaltyScoreP1,
                          draw: true,
                          penalties: true,
                      })
            }
        }

        const uploadedMatch = await modifyMatchResult(
            match,
            scoreP1,
            scoreP2,
            outcome,
            valid
        )

        uploadedMatch
            ? res.status(200).send(uploadedMatch)
            : res.status(500).send({ error: "Match wasn't found in the DB" })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = putMatchByTournamentId

const { modifyMatchResult } = require("./../../service")

const putMatchByTournamentId = async (req, res) => {
    //TODO: Accomodate matches inside each tournament, maybe?
    const matchId = req.params.match
    try {
        // const tournament = await retrieveTournamentById(tournamentId)

        let {
            playerP1,
            playerP2,
            teamP1,
            teamP2,
            scoreP1,
            scoreP2,
            penaltyScoreP1,
            penaltyScoreP2,
        } = req.body

        let outcome

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
        } else if (
            scoreP1 - scoreP2 === 0 &&
            penaltyScoreP1 &&
            penaltyScoreP2
        ) {
            // Empate, y hubo penales
            penaltyScoreP1 > penaltyScoreP2
                ? (outcome = {
                      playerThatWon: playerP1,
                      teamThatWon: teamP1,
                      scoreFromTeamThatWon: penaltyScoreP1,
                      playerThatLost: playerP2,
                      teamThatLost: teamP2,
                      scoreFromTeamThatLost: penaltyScoreP2,
                      draw: true,
                      penalties: true,
                      scoringDifference: 0,
                  })
                : (outcome = {
                      playerThatWon: playerP2,
                      teamThatWon: teamP2,
                      scoreFromTeamThatWon: penaltyScoreP2,
                      playerThatLost: playerP1,
                      teamThatLost: teamP1,
                      scoreFromTeamThatLost: penaltyScoreP1,
                      draw: true,
                      penalties: true,
                      scoringDifference: 0,
                  })
        } else {
            // Empate, pero no hubo penales!
            outcome = {
                draw: true,
                penalties: false,
            }
        }

        const uploadedMatch = await modifyMatchResult(
            matchId,
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

module.exports = putMatchByTournamentId

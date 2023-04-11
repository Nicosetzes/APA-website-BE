const { originateMatch, retrieveTournamentById } = require("./../../service")

const postMatchByTournamentId = async (req, res) => {
    const tournamentId = req.params.id

    try {
        const tournament = await retrieveTournamentById(tournamentId)

        let {
            playerP1,
            teamP1,
            scoreP1,
            playerP2,
            teamP2,
            scoreP2,
            penaltyScoreP1,
            penaltyScoreP2,
            type,
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

        const match = {
            playerP1,
            teamP1,
            scoreP1,
            playerP2,
            teamP2,
            scoreP2,
            outcome,
            type,
            tournament: {
                name: tournament.name,
                id: tournament.id,
            },
        }

        const createdMatch = await originateMatch(match)

        createdMatch && res.status(200).send(createdMatch)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = postMatchByTournamentId

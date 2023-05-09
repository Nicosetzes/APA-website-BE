const {
    originatePlayinByTournamentId,
    retrieveTournamentById,
    retrievePlayinMatchesByTournamentId,
} = require("./../../service")

const postPlayinUpdateByTournamentId = async (req, res) => {
    const { round } = req.body
    const { tournament } = req.params

    try {
        const { id, name } = await retrieveTournamentById(tournament)

        const matches = await retrievePlayinMatchesByTournamentId(tournament)

        const newMatches = []

        if (round == 2) {
            const playedMatches = matches
                .filter(({ played }) => played)
                .map(({ playoff_id }) => playoff_id)

            if (playedMatches.includes(1) && playedMatches.includes(2)) {
                // Primero chequeo que, a pesar de cumplirse estas condiciones, el partido no se haya generado con anterioridad //
                !matches.filter(({ playoff_id }) => playoff_id == 5).length &&
                    newMatches.push({
                        playerP1: matches.at(0).outcome.playerThatLost,
                        teamP1: matches.at(0).outcome.teamThatLost,
                        seedP1: matches.at(0).outcome.seedFromTeamThatLost,
                        playerP2: matches.at(1).outcome.playerThatWon,
                        teamP2: matches.at(1).outcome.teamThatWon,
                        seedP2: matches.at(1).outcome.seedFromTeamThatWon,
                        type: "playin",
                        tournament: { id, name },
                        played: false,
                        playoff_id: 5,
                        group: matches.at(0).group,
                    })
            }

            if (playedMatches.includes(3) && playedMatches.includes(4)) {
                // Primero chequeo que, a pesar de cumplirse estas condiciones, el partido no se haya generado con anterioridad //
                !matches.filter(({ playoff_id }) => playoff_id == 6).length &&
                    newMatches.push({
                        playerP1: matches.at(2).outcome.playerThatLost,
                        teamP1: matches.at(2).outcome.teamThatLost,
                        seedP1: matches.at(2).outcome.seedFromTeamThatLost,
                        playerP2: matches.at(3).outcome.playerThatWon,
                        teamP2: matches.at(3).outcome.teamThatWon,
                        seedP2: matches.at(3).outcome.seedFromTeamThatWon,
                        type: "playin",
                        tournament: { id, name },
                        played: false,
                        playoff_id: 6,
                        group: matches.at(2).group,
                    })
            }

            let newPlayinMatches
            if (newMatches.length) {
                newPlayinMatches = await originatePlayinByTournamentId(
                    newMatches
                )
                return res.status(200).json(newPlayinMatches)
            } else
                return res.status(500).json({
                    message: "No hay partidos nuevos para generar",
                })
        }
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = postPlayinUpdateByTournamentId

const {
    retrieveAllMatchesByTournamentId,
    retrieveTournamentById,
} = require("./../../service")

const getPlayoffsUpdatedWinsByTournamentId = async (req, res) => {
    const { tournament } = req.params

    try {
        const playoffs = await retrieveTournamentById(tournament)

        const { teams } = playoffs

        const matches = await retrieveAllMatchesByTournamentId(tournament)

        const winsByTeam = []

        if (matches.length) {
            teams.forEach(({ team, player, seed }) => {
                const matchesFromTeam = matches.filter(
                    ({ teamP1, teamP2 }) =>
                        teamP1.id == team.id || teamP2.id == team.id
                )
                if (matchesFromTeam.length) {
                    const wins = matchesFromTeam.filter(
                        ({ outcome }) => outcome.teamThatWon?.id == team.id
                    ).length
                    winsByTeam.push({
                        team,
                        player,
                        seed,
                        tournament: {
                            name: tournament.name,
                            id: tournament.id,
                        },
                        wins,
                    })
                } else {
                    winsByTeam.push({
                        team,
                        player,
                        seed,
                        tournament: {
                            name: tournament.name,
                            id: tournament.id,
                        },
                        wins: 0,
                    })
                }
            })
        }
        res.status(200).send({ winsByTeam, playoffsMatches: matches })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getPlayoffsUpdatedWinsByTournamentId

const { retrieveAllMatches } = require("./../../service")

const getAllTimeTeams = async (req, res) => {
    try {
        const matches = await retrieveAllMatches()

        const allTeamsWithPlayers = []

        matches.forEach(
            ({ playerP1, playerP2, teamP1, teamP2, tournament }) => {
                // The .add method adds a value to a Set, if value is repeated, then it's omitted
                allTeamsWithPlayers.push({
                    player: { id: playerP1.id, name: playerP1.name },
                    team: { id: teamP1.id, name: teamP1.name },
                    tournament,
                })
                allTeamsWithPlayers.push({
                    player: { id: playerP2.id, name: playerP2.name },
                    team: { id: teamP2.id, name: teamP2.name },
                    tournament,
                })
            }
        )

        const uniqueTeamsWithPlayers = [
            ...new Set(allTeamsWithPlayers.map((o) => JSON.stringify(o))),
        ].map((string) => JSON.parse(string))

        const initialStats = uniqueTeamsWithPlayers.map(
            ({ player, team, tournament }) => {
                return {
                    player,
                    team,
                    wins: matches.filter((match) => {
                        let { outcome } = match
                        let { playerThatWon, teamThatWon } = outcome
                        if (
                            match.tournament.id == tournament.id &&
                            playerThatWon &&
                            playerThatWon.id == player.id &&
                            teamThatWon.id == team.id
                        )
                            return "win"
                    }).length,
                    draws: matches.filter((match) => {
                        let { playerP1, teamP1, playerP2, teamP2, outcome } =
                            match
                        let { draw } = outcome
                        if (
                            match.tournament.id == tournament.id &&
                            draw &&
                            !outcome.penalties &&
                            ((playerP1.id == player.id &&
                                teamP1.id == team.id) ||
                                (playerP2.id == player.id &&
                                    teamP2.id == team.id))
                        )
                            return "draw"
                    }).length,
                    losses: matches.filter((match) => {
                        let { outcome } = match
                        let { playerThatLost, teamThatLost } = outcome
                        if (
                            match.tournament.id == tournament.id &&
                            playerThatLost &&
                            playerThatLost.id == player.id &&
                            teamThatLost.id == team.id
                        )
                            return "loss"
                    }).length,
                    tournament,
                }
            }
        )

        const completeStats = initialStats
            .map(({ player, team, wins, draws, losses, tournament }) => {
                let played = wins + draws + losses
                return {
                    player,
                    team,
                    played,
                    wins,
                    points: wins * 3 + draws,
                    effectiveness: Number(
                        (((wins * 3 + draws) / (played * 3)) * 100).toFixed(2)
                    ),
                    tournament,
                }
            })
            .filter(({ played }) => played > 10)

        const completeStatsByPoints = completeStats
            .sort((a, b) => {
                if (a.points > b.points) return -1
                if (a.points < b.points) return 1
                if (a.effectiveness > b.effectiveness) return -1
                if (a.effectiveness < b.effectiveness) return 1
            })
            .slice(0, 10)

        const completeStatsByEffectiveness = completeStats
            .sort((a, b) => {
                if (a.effectiveness > b.effectiveness) return -1
                if (a.effectiveness < b.effectiveness) return 1
                if (a.points > b.points) return -1
                if (a.points < b.points) return 1
            })
            .slice(0, 10)

        res.status(200).json({
            completeStatsByPoints,
            completeStatsByEffectiveness,
        })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getAllTimeTeams

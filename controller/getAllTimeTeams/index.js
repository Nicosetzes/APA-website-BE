const { retrieveAllMatches } = require("./../../service")

const getAllTimeTeams = async (req, res) => {
    try {
        const matches = await retrieveAllMatches()

        const allTeamsWithPlayers = []

        matches.forEach(({ playerP1, playerP2, teamP1, teamP2 }) => {
            // The .add method adds a value to a Set, if value is repeated, then it's omitted
            allTeamsWithPlayers.push({
                player: { id: playerP1.id, name: playerP1.name },
                team: { id: teamP1.id, name: teamP1.name },
            })
            allTeamsWithPlayers.push({
                player: { id: playerP2.id, name: playerP2.name },
                team: { id: teamP2.id, name: teamP2.name },
            })
        })

        const uniqueTeamsWithPlayers = [
            ...new Set(allTeamsWithPlayers.map((o) => JSON.stringify(o))),
        ].map((string) => JSON.parse(string))

        const initialStats = uniqueTeamsWithPlayers.map(({ player, team }) => {
            return {
                player,
                team,
                wins: matches.filter(({ outcome }) => {
                    let { playerThatWon, teamThatWon } = outcome
                    if (
                        playerThatWon &&
                        playerThatWon.id == player.id &&
                        teamThatWon.id == team.id
                    )
                        return "win"
                }).length,
                draws: matches.filter(
                    ({ playerP1, teamP1, playerP2, teamP2, outcome }) => {
                        let { draw } = outcome
                        if (
                            draw &&
                            !outcome.penalties &&
                            ((playerP1.id == player.id &&
                                teamP1.id == team.id) ||
                                (playerP2.id == player.id &&
                                    teamP2.id == team.id))
                        )
                            return "draw"
                    }
                ).length,
                losses: matches.filter(({ outcome }) => {
                    let { playerThatLost, teamThatLost } = outcome
                    if (
                        playerThatLost &&
                        playerThatLost.id == player.id &&
                        teamThatLost.id == team.id
                    )
                        return "loss"
                }).length,
            }
        })

        const completeStats = initialStats
            .map(({ player, team, wins, draws, losses }) => {
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
                }
            })
            .filter(({ played }) => played > 10)

        const completeStatsByPoints = completeStats
            .sort((a, b) => (a.points > b.points ? -1 : 1))
            .slice(0, 10)

        const completeStatsByEffectiveness = completeStats
            .sort((a, b) => (a.effectiveness > b.effectiveness ? -1 : 1))
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

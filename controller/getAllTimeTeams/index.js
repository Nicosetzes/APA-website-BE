const { retrieveAllMatches } = require("./../../service")

const getAllTimeTeams = async (req, res) => {
    try {
        const matches = await retrieveAllMatches()

        const allTeams = []
        const allTeamsWithPlayers = []

        matches.forEach(
            ({ playerP1, playerP2, teamP1, teamP2, tournament }) => {
                // The .add method adds a value to a Set, if value is repeated, then it's omitted
                allTeams.push({
                    team: { id: teamP1.id, name: teamP1.name },
                })
                allTeams.push({
                    team: { id: teamP2.id, name: teamP2.name },
                })
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

        const uniqueTeams = [
            ...new Set(allTeams.map((o) => JSON.stringify(o))),
        ].map((string) => JSON.parse(string))

        const uniqueTeamsWithPlayers = [
            ...new Set(allTeamsWithPlayers.map((o) => JSON.stringify(o))),
        ].map((string) => JSON.parse(string))

        const initialStatsForTotalPoints = uniqueTeams.map(({ team }) => {
            return {
                team,
                wins: matches.filter((match) => {
                    let { outcome } = match
                    let { teamThatWon } = outcome
                    if (
                        teamThatWon &&
                        teamThatWon.id == team.id &&
                        !outcome.penalties
                    )
                        return "win"
                }).length,
                draws: matches.filter((match) => {
                    let { teamP1, teamP2, outcome } = match
                    let { draw } = outcome
                    if (draw && (teamP1.id == team.id || teamP2.id == team.id))
                        return "draw"
                }).length,
                losses: matches.filter((match) => {
                    let { outcome } = match
                    let { teamThatLost } = outcome
                    if (
                        teamThatLost &&
                        teamThatLost.id == team.id &&
                        !outcome.penalties
                    )
                        return "loss"
                }).length,
            }
        })

        const initialStatsForEffectiveness = uniqueTeamsWithPlayers.map(
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
                            teamThatWon.id == team.id &&
                            !outcome.penalties
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
                            teamThatLost.id == team.id &&
                            !outcome.penalties
                        )
                            return "loss"
                    }).length,
                    tournament,
                }
            }
        )

        const completeStatsByTotalPoints = initialStatsForTotalPoints
            .map(({ team, wins, draws, losses }) => {
                let played = wins + draws + losses
                return {
                    team,
                    played,
                    wins,
                    draws,
                    losses,
                    points: wins * 3 + draws,
                    effectiveness: Number(
                        (((wins * 3 + draws) / (played * 3)) * 100).toFixed(2)
                    ),
                }
            })
            .sort((a, b) => {
                if (a.points > b.points) return -1
                if (a.points < b.points) return 1
                if (a.effectiveness > b.effectiveness) return -1
                if (a.effectiveness < b.effectiveness) return 1
                if (a.wins > b.wins) return -1
                if (a.wins < b.wins) return 1
            })
            .slice(0, 10)

        const completeStatsByEffectiveness = initialStatsForEffectiveness
            .map(({ player, team, wins, draws, losses, tournament }) => {
                let played = wins + draws + losses
                return {
                    player,
                    team,
                    played,
                    wins,
                    draws,
                    losses,
                    points: wins * 3 + draws,
                    effectiveness: Number(
                        (((wins * 3 + draws) / (played * 3)) * 100).toFixed(2)
                    ),
                    tournament,
                }
            })
            .filter(({ played }) => played > 10)
            .sort((a, b) => {
                if (a.effectiveness > b.effectiveness) return -1
                if (a.effectiveness < b.effectiveness) return 1
                if (a.points > b.points) return -1
                if (a.points < b.points) return 1
                if (a.wins > b.wins) return -1
                if (a.wins < b.wins) return 1
            })
            .slice(0, 10)

        res.status(200).json({
            completeStatsByTotalPoints,
            completeStatsByEffectiveness,
        })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getAllTimeTeams

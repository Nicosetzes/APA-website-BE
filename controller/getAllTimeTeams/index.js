const { retrieveAllMatches } = require("./../../service")

const getAllTimeTeams = async (req, res) => {
    try {
        const matches = await retrieveAllMatches()

        // Use Maps for O(1) lookups instead of repeated array filters
        const teamStats = new Map() // team.id -> { team, wins, draws, losses }
        const playerTeamStats = new Map() // "playerId|teamId|tournamentId" -> stats
        const uniqueTeams = new Set()
        const uniquePlayerTeamTournaments = new Map()

        // Single pass through matches to aggregate all stats
        for (const match of matches) {
            const { playerP1, playerP2, teamP1, teamP2, tournament, outcome } =
                match
            const isPenalty = outcome?.penalties || false

            // Track unique teams
            uniqueTeams.add(
                JSON.stringify({ id: teamP1.id, name: teamP1.name })
            )
            uniqueTeams.add(
                JSON.stringify({ id: teamP2.id, name: teamP2.name })
            )

            // Helper to update team stats (for total points leaderboard)
            const updateTeamStats = (team, result) => {
                const key = team.id
                if (!teamStats.has(key)) {
                    teamStats.set(key, {
                        team: { id: team.id, name: team.name },
                        wins: 0,
                        draws: 0,
                        losses: 0,
                    })
                }
                const stats = teamStats.get(key)
                if (result === "win") stats.wins++
                else if (result === "draw") stats.draws++
                else if (result === "loss") stats.losses++
            }

            // Helper to update player+team+tournament stats (for effectiveness leaderboard)
            const updatePlayerTeamStats = (
                player,
                team,
                tournamentData,
                result
            ) => {
                const key = `${player.id}|${team.id}|${tournamentData.id}`
                if (!playerTeamStats.has(key)) {
                    playerTeamStats.set(key, {
                        player: { id: player.id, name: player.name },
                        team: { id: team.id, name: team.name },
                        tournament: tournamentData,
                        wins: 0,
                        draws: 0,
                        losses: 0,
                    })
                    uniquePlayerTeamTournaments.set(key, true)
                }
                const stats = playerTeamStats.get(key)
                if (result === "win") stats.wins++
                else if (result === "draw") stats.draws++
                else if (result === "loss") stats.losses++
            }

            // Process outcome (excluding penalty shootout wins/losses from regular W/L)
            if (outcome?.draw) {
                updateTeamStats(teamP1, "draw")
                updateTeamStats(teamP2, "draw")
                updatePlayerTeamStats(playerP1, teamP1, tournament, "draw")
                updatePlayerTeamStats(playerP2, teamP2, tournament, "draw")
            } else if (outcome?.teamThatWon && !isPenalty) {
                const winningTeam = outcome.teamThatWon
                const losingTeam = outcome.teamThatLost
                const winningPlayer = outcome.playerThatWon
                const losingPlayer = outcome.playerThatLost

                updateTeamStats(winningTeam, "win")
                updateTeamStats(losingTeam, "loss")

                // Match player to correct team
                if (winningPlayer.id === playerP1.id) {
                    updatePlayerTeamStats(playerP1, teamP1, tournament, "win")
                    updatePlayerTeamStats(playerP2, teamP2, tournament, "loss")
                } else {
                    updatePlayerTeamStats(playerP2, teamP2, tournament, "win")
                    updatePlayerTeamStats(playerP1, teamP1, tournament, "loss")
                }
            }
        }

        // Build final stats arrays
        const completeStatsByTotalPoints = Array.from(teamStats.values())
            .map(({ team, wins, draws, losses }) => {
                const played = wins + draws + losses
                return {
                    team,
                    played,
                    wins,
                    draws,
                    losses,
                    points: wins * 3 + draws,
                    effectiveness:
                        played > 0
                            ? Number(
                                  (
                                      ((wins * 3 + draws) / (played * 3)) *
                                      100
                                  ).toFixed(2)
                              )
                            : 0,
                }
            })
            .sort((a, b) => {
                if (a.points !== b.points) return b.points - a.points
                if (a.effectiveness !== b.effectiveness)
                    return b.effectiveness - a.effectiveness
                return b.wins - a.wins
            })
            .slice(0, 10)

        const completeStatsByEffectiveness = Array.from(
            playerTeamStats.values()
        )
            .map(({ player, team, tournament, wins, draws, losses }) => {
                const played = wins + draws + losses
                return {
                    player,
                    team,
                    played,
                    wins,
                    draws,
                    losses,
                    points: wins * 3 + draws,
                    effectiveness:
                        played > 0
                            ? Number(
                                  (
                                      ((wins * 3 + draws) / (played * 3)) *
                                      100
                                  ).toFixed(2)
                              )
                            : 0,
                    tournament,
                }
            })
            .filter(({ played }) => played >= 10)
            .sort((a, b) => {
                if (a.effectiveness !== b.effectiveness)
                    return b.effectiveness - a.effectiveness
                if (a.points !== b.points) return b.points - a.points
                return b.wins - a.wins
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

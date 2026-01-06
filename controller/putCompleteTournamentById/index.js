const {
    retrieveTournamentById,
    retrieveAllPlayedMatchesByTournamentId,
} = require("./../../service")
const { modifyTournamentOutcome } = require("./../../service")

// Helper to compute champion and finalist for league format
const computeLeagueOutcome = (matches, teams) => {
    const statsMap = new Map()
    const teamInfoMap = new Map()
    // Build team info map for id->{id, name}, and player info for id->{id, name}
    teams.forEach(({ team, player }) => {
        teamInfoMap.set(team.id, { id: team.id, name: team.name })
        if (player)
            teamInfoMap.set(`player_${player.id}`, {
                id: player.id,
                name: player.name,
            })
    })
    const ensureTeam = (teamObj, playerObj) => {
        if (!statsMap.has(teamObj.id)) {
            statsMap.set(teamObj.id, {
                id: teamObj.id,
                team: { id: teamObj.id, name: teamObj.name },
                player: playerObj
                    ? { id: playerObj.id, name: playerObj.name }
                    : null,
                played: 0,
                wins: 0,
                draws: 0,
                losses: 0,
                goalsFor: 0,
                goalsAgainst: 0,
                points: 0,
            })
        }
        return statsMap.get(teamObj.id)
    }
    for (const m of matches) {
        const {
            teamP1,
            teamP2,
            playerP1,
            playerP2,
            scoreP1 = 0,
            scoreP2 = 0,
            outcome,
        } = m
        const t1 = ensureTeam(teamP1, playerP1)
        const t2 = ensureTeam(teamP2, playerP2)
        t1.played += 1
        t2.played += 1
        t1.goalsFor += Number(scoreP1) || 0
        t1.goalsAgainst += Number(scoreP2) || 0
        t2.goalsFor += Number(scoreP2) || 0
        t2.goalsAgainst += Number(scoreP1) || 0
        if (outcome?.draw || scoreP1 === scoreP2) {
            t1.draws += 1
            t2.draws += 1
            t1.points += 1
            t2.points += 1
        } else if (
            outcome?.teamThatWon?.id === teamP1.id ||
            scoreP1 > scoreP2
        ) {
            t1.wins += 1
            t2.losses += 1
            t1.points += 3
        } else {
            t2.wins += 1
            t1.losses += 1
            t2.points += 3
        }
    }

    const statsArr = Array.from(statsMap.values())
    statsArr.sort(
        (a, b) =>
            b.points - a.points ||
            b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
            b.goalsFor - a.goalsFor ||
            a.goalsAgainst - b.goalsAgainst
    )
    const championStats = statsArr[0]
    const finalistStats = statsArr[1]
    return {
        champion: championStats
            ? {
                  team: {
                      id: championStats.team.id,
                      name: championStats.team.name,
                  },
                  player: championStats.player
                      ? {
                            id: championStats.player.id,
                            name: championStats.player.name,
                        }
                      : null,
              }
            : null,
        finalist: finalistStats
            ? {
                  team: {
                      id: finalistStats.team.id,
                      name: finalistStats.team.name,
                  },
                  player: finalistStats.player
                      ? {
                            id: finalistStats.player.id,
                            name: finalistStats.player.name,
                        }
                      : null,
              }
            : null,
    }
}

const putCompleteTournamentById = async (req, res) => {
    const tournamentId = req.params.tournament
    try {
        const tournament = await retrieveTournamentById(tournamentId)
        if (!tournament) return res.status(404).send("Tournament not found")
        if (tournament.format !== "league") {
            return res
                .status(400)
                .send(
                    "Only league format tournaments can be completed with this endpoint"
                )
        }
        if (!tournament.ongoing) {
            return res.status(400).send("Tournament is already completed")
        }
        const matches = await retrieveAllPlayedMatchesByTournamentId(
            tournamentId
        )
        const teams = tournament.teams || []
        const { champion, finalist } = computeLeagueOutcome(matches, teams)
        await modifyTournamentOutcome(tournamentId, champion, finalist)
        res.status(200).json({
            message: "Tournament marked as completed",
            outcome: { champion, finalist },
        })
    } catch (err) {
        res.status(500).send("Something went wrong! " + err)
    }
}

module.exports = putCompleteTournamentById

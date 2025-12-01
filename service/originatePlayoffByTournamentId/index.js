const { createPlayoffByTournamentId } = require("./../../dao")

const originatePlayoffByTournamentId = async (tournament, teams) => {
    // Extract only id and name from tournament object
    const tournamentRef = {
        id: String(tournament._id || tournament.id),
        name: tournament.name,
    }

    // Group teams by playoff_id
    const teamsByPlayoffId = {}

    teams.forEach(({ team, player, playoff_id }) => {
        if (!teamsByPlayoffId[playoff_id]) {
            teamsByPlayoffId[playoff_id] = []
        }
        teamsByPlayoffId[playoff_id].push({ team, player })
    })

    // Create playoff matches (Round of 32)
    const playoffMatches = []

    // For each playoff_id, create a match between the two teams
    Object.keys(teamsByPlayoffId)
        .sort((a, b) => Number(a) - Number(b))
        .forEach((playoff_id) => {
            const teamsInMatch = teamsByPlayoffId[playoff_id]

            if (teamsInMatch.length === 2) {
                playoffMatches.push({
                    playerP1: teamsInMatch[0].player,
                    teamP1: teamsInMatch[0].team,
                    seedP1: `${playoff_id}A`,
                    playerP2: teamsInMatch[1].player,
                    teamP2: teamsInMatch[1].team,
                    seedP2: `${playoff_id}B`,
                    type: "playoff",
                    tournament: tournamentRef,
                    played: false,
                    playoff_id: Number(playoff_id),
                })
            }
        })

    return await createPlayoffByTournamentId(playoffMatches)
}

module.exports = originatePlayoffByTournamentId

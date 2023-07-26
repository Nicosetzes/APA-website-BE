const { findTournamentById, sortMatchesFromTournamentById } = require("./../../dao")

const retrieveStandingsForCalculatorByTournamentId = async (tournamentId) => {

        const { id, name, format, players, teams, groups } =  await findTournamentById(tournamentId)

        const matches = await sortMatchesFromTournamentById(tournamentId)
    
        const standings = []
    
        teams.forEach(async ({ team, player }) => {
            let played = matches.filter(
                ({ teamP1, teamP2 }) =>
                    teamP1.id == team.id || teamP2.id == team.id
            ).length
            let wins = matches.filter(
                ({ outcome }) => outcome?.teamThatWon?.id == team.id
            ).length
            let draws = matches.filter(
                ({ teamP1, teamP2, outcome }) =>
                    (teamP1.id == team.id || teamP2.id == team.id) &&
                    outcome?.draw
            ).length
            let losses = matches.filter(
                ({ outcome }) => outcome?.teamThatLost?.id == team.id
            ).length
            let points = wins * 3 + draws
    
            standings.push({
                team,
                player,
                played,
                wins,
                draws,
                losses,
                points,
            })
        })

return standings
    
}

module.exports = retrieveStandingsForCalculatorByTournamentId

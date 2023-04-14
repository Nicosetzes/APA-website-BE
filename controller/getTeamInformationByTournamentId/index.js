const {
    retrieveTournamentById,
    retrieveMatchesByTournamentId,
    orderMatchesFromTournamentById,
} = require("./../../service")

const getTeamInformationByTournamentId = async (req, res) => {
    try {
        const qty = 5 // 5 matches //
        const { tournament, team } = req.params
        const { teams } = await retrieveTournamentById(tournament)
        const tournamentMatchesFromDB = await orderMatchesFromTournamentById(
            tournament
        )

        const standings = []

        teams.forEach(async ({ team, player }) => {
            let played = tournamentMatchesFromDB.filter(
                ({ teamP1, teamP2 }) =>
                    teamP1.id == team.id || teamP2.id == team.id
            ).length
            let wins = tournamentMatchesFromDB.filter(
                ({ outcome }) => outcome?.teamThatWon?.id == team.id
            ).length
            let draws = tournamentMatchesFromDB.filter(
                ({ teamP1, teamP2, outcome }) =>
                    (teamP1.id == team.id || teamP2.id == team.id) &&
                    outcome?.draw
            ).length
            let losses = tournamentMatchesFromDB.filter(
                ({ outcome }) => outcome?.teamThatLost?.id == team.id
            ).length
            let goalsFor =
                tournamentMatchesFromDB
                    .filter(({ teamP1 }) => teamP1.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0) +
                tournamentMatchesFromDB
                    .filter(({ teamP2 }) => teamP2.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0)
            let goalsAgainst =
                tournamentMatchesFromDB
                    .filter(({ teamP1 }) => teamP1.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0) +
                tournamentMatchesFromDB
                    .filter(({ teamP2 }) => teamP2.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0)
            let scoringDifference = goalsFor - goalsAgainst
            let points = wins * 3 + draws

            standings.push({
                team,
                player,
                played,
                wins,
                draws,
                losses,
                goalsFor,
                goalsAgainst,
                scoringDifference,
                points,
            })
        })

        let sortedStandings = standings
            .sort(function (a, b) {
                if (a.points > b.points) return -1
                if (a.points < b.points) return 1

                if (a.scoringDifference > b.scoringDifference) return -1
                if (a.scoringDifference < b.scoringDifference) return 1

                if (a.goalsFor > b.goalsFor) return -1
                if (a.goalsFor < b.goalsFor) return 1

                if (a.goalsAgainst > b.goalsAgainst) return 1
                if (a.goalsAgainst < b.goalsAgainst) return -1
            })
            .map(
                (
                    { team, player, played, wins, draws, losses, points },
                    index
                ) => {
                    return {
                        team,
                        player,
                        played,
                        wins,
                        draws,
                        losses,
                        points,
                        position: index + 1,
                    }
                }
            )

        const teamPosition = sortedStandings.findIndex(
            (teamFromStandings) => teamFromStandings.team.id == team
        )

        let shortStandings

        if (teamPosition >= 2 && teamPosition <= sortedStandings.length - 3) {
            // El equipo tiene al menos 2 equipos por encima y dos por debajo //
            // Revisar si filter es el método más adecuado, ya que NO utilizo el primer param en el callback //
            shortStandings = sortedStandings.filter(
                (team, index) =>
                    index == teamPosition - 2 ||
                    index == teamPosition - 1 ||
                    index == teamPosition ||
                    index == teamPosition + 1 ||
                    index == teamPosition + 2
            )
        } else if (teamPosition == 0) {
            // El equipo está primero //
            // Revisar si filter es el método más adecuado, ya que NO utilizo el primer param en el callback //
            shortStandings = sortedStandings.filter(
                (team, index) =>
                    index == teamPosition ||
                    index == teamPosition + 1 ||
                    index == teamPosition + 2 ||
                    index == teamPosition + 3 ||
                    index == teamPosition + 4
            )
        } else if (teamPosition == 1) {
            // El equipo está segundo //
            // Revisar si filter es el método más adecuado, ya que NO utilizo el primer param en el callback //
            shortStandings = sortedStandings.filter(
                (team, index) =>
                    index == teamPosition - 1 ||
                    index == teamPosition ||
                    index == teamPosition + 1 ||
                    index == teamPosition + 2 ||
                    index == teamPosition + 3
            )
        } else if (teamPosition == sortedStandings.length - 1) {
            // El equipo está último //
            // Revisar si filter es el método más adecuado, ya que NO utilizo el primer param en el callback //
            shortStandings = sortedStandings.filter(
                (team, index) =>
                    index == teamPosition ||
                    index == teamPosition - 1 ||
                    index == teamPosition - 2 ||
                    index == teamPosition - 3 ||
                    index == teamPosition - 4
            )
        } else if (teamPosition == sortedStandings.length - 2) {
            // El equipo está ante-último //
            // Revisar si filter es el método más adecuado, ya que NO utilizo el primer param en el callback //
            shortStandings = sortedStandings.filter(
                (team, index) =>
                    index == teamPosition + 1 ||
                    index == teamPosition ||
                    index == teamPosition - 1 ||
                    index == teamPosition - 2 ||
                    index == teamPosition - 3
            )
        }

        const matchesFromDB = await retrieveMatchesByTournamentId(
            tournament,
            team,
            qty
        )

        const teamFromDB = teams
            .filter((teamFromDB) => teamFromDB.team.id == team)
            .map(({ team }) => {
                return {
                    id: team.id,
                    name: team.name,
                    position: teamPosition + 1,
                }
            })
            .at(0)

        const playerFromDB = teams
            .filter((teamFromDB) => teamFromDB.team.id == team)
            .map(({ player }) => {
                return {
                    id: player.id,
                    name: player.name,
                }
            })
            .at(0)

        res.status(200).json({
            team: teamFromDB,
            player: playerFromDB,
            standings: shortStandings,
            matches: matchesFromDB,
        })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getTeamInformationByTournamentId

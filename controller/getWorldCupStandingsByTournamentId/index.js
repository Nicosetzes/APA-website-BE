const {
    orderMatchesFromTournamentById,
    retrieveTournamentById,
} = require("./../../service")

const getWorldCupStandingsByTournamentId = async (req, res) => {
    const { tournament } = req.params
    try {
        const tournamentFromDB = await retrieveTournamentById(tournament)
        const matches = await orderMatchesFromTournamentById(tournament)
        const teamsFromTournament = tournamentFromDB.teams
        const standings = []

        teamsFromTournament.forEach(async ({ team, player }) => {
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
            let goalsFor =
                matches
                    .filter(({ teamP1 }) => teamP1.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0) +
                matches
                    .filter(({ teamP2 }) => teamP2.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0)
            let goalsAgainst =
                matches
                    .filter(({ teamP1 }) => teamP1.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0) +
                matches
                    .filter(({ teamP2 }) => teamP2.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0)
            let scoringDifference = goalsFor - goalsAgainst
            let points = wins * 3 + draws

            standings.push({
                team,
                player, // REVISAR
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
        const sortedStandings = standings.sort(function (a, b) {
            if (a.points > b.points) return -1
            if (a.points < b.points) return 1

            if (a.scoringDifference > b.scoringDifference) return -1
            if (a.scoringDifference < b.scoringDifference) return 1

            if (a.goalsFor > b.goalsFor) return -1
            if (a.goalsFor < b.goalsFor) return 1

            if (a.goalsAgainst > b.goalsAgainst) return 1
            if (a.goalsAgainst < b.goalsAgainst) return -1
        })

        res.status(200).send(sortedStandings)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getWorldCupStandingsByTournamentId

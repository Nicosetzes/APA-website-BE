const {
    retrieveTournamentById,
    orderMatchesFromTournamentById,
} = require("./../../service")

const getPlayoffsTableByTournamentId = async (req, res) => {
    const { tournament } = req.params

    try {
        const playoffs = await retrieveTournamentById(tournament)

        const { parents, teams } = playoffs

        let tournamentData = parents.map(async ({ id }) => {
            return await retrieveTournamentById(id)
        })

        Promise.all(tournamentData)
            .then((values) => {
                return values
            })
            .then((tournaments) => {
                const allTeams = []

                let counter = 0

                tournaments.forEach(async (tournament) => {
                    let matches = await orderMatchesFromTournamentById(
                        tournament.id
                    )

                    teams.forEach(({ team, player }) => {
                        let played = matches.filter(
                            ({ teamP1, teamP2 }) =>
                                teamP1.id == team.id || teamP2.id == team.id
                        ).length
                        let wins = matches.filter(
                            ({ outcome }) => outcome?.teamThatWon?.id == team.id
                        ).length
                        let draws = matches.filter(
                            ({ teamP1, teamP2, outcome }) =>
                                (teamP1.id == team.id ||
                                    teamP2.id == team.id) &&
                                outcome.draw
                        ).length
                        let losses = matches.filter(
                            ({ outcome }) =>
                                outcome?.teamThatLost?.id == team.id
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

                        allTeams.push({
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

                    counter++

                    if (counter === tournaments.length) {
                        let sortedPlayoffsTeams = allTeams.sort(function (
                            a,
                            b
                        ) {
                            if (a.points > b.points) return -1
                            if (a.points < b.points) return 1

                            if (a.scoringDifference > b.scoringDifference)
                                return -1
                            if (a.scoringDifference < b.scoringDifference)
                                return 1

                            if (a.goalsFor > b.goalsFor) return -1
                            if (a.goalsFor < b.goalsFor) return 1

                            if (a.goalsAgainst > b.goalsAgainst) return 1
                            if (a.goalsAgainst < b.goalsAgainst) return -1
                        })

                        const definitiveSortedPlayoffsTeams =
                            sortedPlayoffsTeams.filter((match) => match.played)
                        res.status(200).json(definitiveSortedPlayoffsTeams)
                    }
                })
            })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getPlayoffsTableByTournamentId

const {
    retrieveTournamentById,
    orderMatchesFromTournamentById,
} = require("./../../service")

const getPlayoffsTableByTournamentId = async (req, res) => {
    const { tournament } = req.params

    try {
        const { teams, format } = await retrieveTournamentById(tournament)

        const matches = await orderMatchesFromTournamentById(tournament)

        if (format == "league_playin_playoff") {
            const teamsFromGroupA = teams.filter(({ group }) => group == "A")

            const teamsFromGroupB = teams.filter(({ group }) => group == "B")

            const standingsFromGroupA = []

            const standingsFromGroupB = []

            teamsFromGroupA.forEach(async ({ team, player }) => {
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
                let losses = played - wins - draws
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

                standingsFromGroupA.push({
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

            teamsFromGroupB.forEach(async ({ team, player }) => {
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
                let losses = played - wins - draws
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

                standingsFromGroupB.push({
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

            const sortedStandingsFromGroupA = standingsFromGroupA.sort(
                (a, b) => {
                    if (a.points > b.points) return -1
                    if (a.points < b.points) return 1

                    if (a.scoringDifference > b.scoringDifference) return -1
                    if (a.scoringDifference < b.scoringDifference) return 1

                    if (a.goalsFor > b.goalsFor) return -1
                    if (a.goalsFor < b.goalsFor) return 1

                    if (a.goalsAgainst > b.goalsAgainst) return 1
                    if (a.goalsAgainst < b.goalsAgainst) return -1
                }
            )

            const sortedStandingsFromGroupB = standingsFromGroupB.sort(
                (a, b) => {
                    if (a.points > b.points) return -1
                    if (a.points < b.points) return 1

                    if (a.scoringDifference > b.scoringDifference) return -1
                    if (a.scoringDifference < b.scoringDifference) return 1

                    if (a.goalsFor > b.goalsFor) return -1
                    if (a.goalsFor < b.goalsFor) return 1

                    if (a.goalsAgainst > b.goalsAgainst) return 1
                    if (a.goalsAgainst < b.goalsAgainst) return -1
                }
            )

            const allPlayoffTeams = [
                sortedStandingsFromGroupA.at(0),
                sortedStandingsFromGroupA.at(1),
                sortedStandingsFromGroupA.at(2),
                sortedStandingsFromGroupA.at(3),
                sortedStandingsFromGroupA.at(4),
                sortedStandingsFromGroupA.at(5),
                sortedStandingsFromGroupB.at(0),
                sortedStandingsFromGroupB.at(1),
                sortedStandingsFromGroupB.at(2),
                sortedStandingsFromGroupB.at(3),
                sortedStandingsFromGroupB.at(4),
                sortedStandingsFromGroupB.at(5),
            ]

            const allPlayoffTeamsSorted = allPlayoffTeams.sort((a, b) => {
                if (a.points > b.points) return -1
                if (a.points < b.points) return 1

                if (a.scoringDifference > b.scoringDifference) return -1
                if (a.scoringDifference < b.scoringDifference) return 1

                if (a.goalsFor > b.goalsFor) return -1
                if (a.goalsFor < b.goalsFor) return 1

                if (a.goalsAgainst > b.goalsAgainst) return 1
                if (a.goalsAgainst < b.goalsAgainst) return -1
            })

            return res.status(200).json({ standings: allPlayoffTeamsSorted })
        } else {
            /* No se devuelve */
            return res.status(200).json({ standings: [] })
        }
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getPlayoffsTableByTournamentId

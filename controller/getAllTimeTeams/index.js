const { retrieveAllMatches } = require("./../../service")

const getAllTimeTeams = async (req, res) => {
    try {
        const matches = await retrieveAllMatches()

        const allTeams = []

        matches.forEach(({ teamP1, teamP2 }) => {
            // The .add method adds a value to a Set, if value is repeated, then it's omitted
            allTeams.push({ id: teamP1.id, name: teamP1.name })
            allTeams.push({ id: teamP2.id, name: teamP2.name })
        })

        const uniqueTeams = [
            ...new Set(allTeams.map((o) => JSON.stringify(o))),
        ].map((string) => JSON.parse(string))

        const initialStats = uniqueTeams.map(({ id, name }) => {
            return {
                id,
                name,
                wins: matches.filter(({ teamP1, teamP2, outcome }) => {
                    let { teamThatWon } = outcome
                    if (teamThatWon && teamThatWon.id == id) return "win"
                }).length,
                draws: matches.filter(({ teamP1, teamP2, outcome }) => {
                    let { draw } = outcome
                    if (
                        draw &&
                        !outcome.penalties &&
                        (teamP1.id == id || teamP2.id == id)
                    )
                        return "draw"
                }).length,
                losses: matches.filter(({ teamP1, teamP2, outcome }) => {
                    let { teamThatLost } = outcome
                    if (teamThatLost && teamThatLost.id == id) return "loss"
                }).length,
            }
        })

        const completeStats = initialStats
            .map(({ id, name, wins, draws, losses }) => {
                let played = wins + draws + losses
                return {
                    id,
                    name,
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

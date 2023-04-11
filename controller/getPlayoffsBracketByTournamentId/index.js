const { retrieveTournamentById } = require("./../../service")

const getPlayoffsBracketByTournamentId = async (req, res) => {
    const { tournament } = req.params

    try {
        const playoffs = await retrieveTournamentById(tournament)

        const teamsSortedBySeed = playoffs.teams
            .map(({ team, player, seed }) => {
                return {
                    team,
                    player,
                    seed,
                    tournament: { name: playoffs.name, id: playoffs.id },
                }
            })
            .sort((a, b) => (a.seed > b.seed ? 1 : -1))

        res.status(200).send(teamsSortedBySeed)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getPlayoffsBracketByTournamentId

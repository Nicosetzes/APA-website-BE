const { retrieveTournamentById } = require("./../../service")

const getTeamsByTournamentId = async (req, res) => {
    try {
        const { tournament } = req.params
        let { player } = req.query

        const { teams } = await retrieveTournamentById(tournament)

        let teamsFromDB

        if (player)
            teamsFromDB = teams
                .filter((teamFromDB) => teamFromDB.player.id == player)
                .map(({ team, player }) => {
                    return { team, player }
                })
        else
            teamsFromDB = teams.map(({ team, player }) => {
                return { team, player }
            })

        res.status(200).json({
            teams: teamsFromDB,
        })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getTeamsByTournamentId

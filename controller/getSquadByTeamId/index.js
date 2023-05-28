const { retrieveTournamentById } = require("./../../service")

const getSquadByTeamId = async (req, res) => {
    try {
        const { tournament, team } = req.params

        const { teams } = await retrieveTournamentById(tournament)

        const teamFromDB = teams
            .filter((eachTeam) => eachTeam.team.id == team)
            .at(0)

        const { squad } = teamFromDB

        if (squad) {
            const ids = squad.map(({ id }) => id)
            res.status(200).json({
                squad,
                ids,
            })
        } else {
            res.status(200).json({
                squad: [],
                ids: [],
            })
        }
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getSquadByTeamId

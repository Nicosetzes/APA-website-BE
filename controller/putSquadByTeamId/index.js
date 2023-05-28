const { retrieveTournamentById, modifySquad } = require("./../../service")

const putSquadByTeamId = async (req, res) => {
    try {
        const { tournament, team } = req.params
        const { squad } = req.body

        const { teams } = await retrieveTournamentById(tournament)

        const teamsWithUpdatedSquad = teams.map((eachTeam) => {
            if (eachTeam.team.id == team) {
                return {
                    ...eachTeam,
                    squad,
                }
            } else {
                return { ...eachTeam }
            }
        })

        const uploadedSquad = await modifySquad(
            tournament,
            teamsWithUpdatedSquad
        )

        uploadedSquad
            ? res.status(200).send(uploadedSquad)
            : res.status(500).send({ error: "Squad couldn't be updated" })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = putSquadByTeamId

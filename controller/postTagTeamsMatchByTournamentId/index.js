const { originateMatch, retrieveTournamentById } = require("./../../service")

const postTagTeamsdMatchByTournamentId = async (req, res) => {
    const tournamentId = req.params.tournament

    try {
        const { name, id } = await retrieveTournamentById(tournamentId)

        let { playerP1, playerP2, playerP3, playerP4, teamP1, teamP2 } =
            req.body

        let match

        if (!playerP4) {
            match = {
                playerP1,
                playerP2,
                playerP3,
                teamP1,
                teamP2,
                type: "regular",
                tournament: {
                    id,
                    name,
                },
                valid: false, // Para torneos de duplas (tag_teams), no contará para la estadística
            }
        } else {
            match = {
                playerP1,
                playerP2,
                playerP3,
                playerP4,
                teamP1,
                teamP2,
                type: "regular",
                tournament: {
                    id,
                    name,
                },
                valid: false, // Para torneos de duplas (tag_teams), no contará para la estadística
            }
        }

        const createdMatch = await originateMatch(match)

        createdMatch && res.status(200).send(createdMatch)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = postTagTeamsdMatchByTournamentId

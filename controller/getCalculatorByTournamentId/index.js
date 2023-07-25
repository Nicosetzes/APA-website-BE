const {
    retrieveTeamRemainingMatchesByTournamentId,
} = require("./../../service")

const getCalculatorByTournamentId = async (req, res) => {
    try {
        const { tournament } = req.params
        let teamIDs
        if (req.query.teams) teamIDs = JSON.parse(req.query.teams)

        // console.log(teamIDs)

        // Necesito calcular los partidos restantes de cada uno de los equipos seleccionados

        const teams = await retrieveTeamRemainingMatchesByTournamentId(
            tournament,
            teamIDs
        )

        // console.log(teams)

        res.status(200).json({ teams, standings: "standings" })
        // Agregar excepción en caso de error
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getCalculatorByTournamentId

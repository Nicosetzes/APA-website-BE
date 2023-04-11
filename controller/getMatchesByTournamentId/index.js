const { retrieveMatchesByTournamentIds } = require("./../../service")

const getMatchesByTournamentId = async (req, res) => {
    const { tournament } = req.params
    try {
        // AHORA DEBO TRAER LOS PARTIDOS DE UN TORNEO ESPECÍFICO //
        const matches = await retrieveMatchesByTournamentIds([tournament])
        res.status(200).json(matches)
        // Agregar excepción en caso de error
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getMatchesByTournamentId

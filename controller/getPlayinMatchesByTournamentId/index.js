const { retrievePlayinMatchesByTournamentId } = require("./../../service")

const getPlayinMatchesByTournamentId = async (req, res) => {
    try {
        // AHORA DEBO TRAER LOS PARTIDOS DE UN TORNEO
        const { tournament } = req.params

        const matches = await retrievePlayinMatchesByTournamentId(tournament)

        res.status(200).json({ matches })
        // Agregar excepción en caso de error
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getPlayinMatchesByTournamentId

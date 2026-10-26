const {
    createGetStandingsTableByTournamentId,
} = require("../getStandingsTableByTournamentId")
const { retrieveAssistantStandings } = require("./../../service")

// Corre el controller de la tabla de posiciones y devuelve el cuerpo que
// respondería, sin pasar por HTTP. Así el asistente usa exactamente el mismo
// cálculo (puntos, desempates, clasificados) que la vista Clasificación en lugar
// de repetirlo. Si el controller lanza (torneo inexistente) el error sube.
const captureStandings =
    (handler) =>
    async ({ tournamentId, group }) => {
        let body

        const response = {
            status() {
                return response
            },
            send(payload) {
                body = payload
                return response
            },
            json(payload) {
                body = payload
                return response
            },
        }

        await handler(
            { params: { tournament: tournamentId }, query: { group } },
            response
        )

        return body
    }

const createGetAssistantStandings = (dependencies = {}) => {
    const retrieveStandings = captureStandings(
        dependencies.standingsHandler || createGetStandingsTableByTournamentId()
    )
    const retrieve =
        dependencies.retrieveAssistantStandings || retrieveAssistantStandings

    return async (req, res) => {
        const { tournamentId, group, playerId } = req.query
        const standings = await retrieve(
            { tournamentId, group, playerId },
            { retrieveStandings }
        )

        return res.status(200).json({ success: true, data: standings })
    }
}

const getAssistantStandings = createGetAssistantStandings()

module.exports = getAssistantStandings
module.exports.createGetAssistantStandings = createGetAssistantStandings
module.exports.captureStandings = captureStandings

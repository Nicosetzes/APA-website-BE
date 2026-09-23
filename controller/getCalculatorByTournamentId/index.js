const {
    retrieveStandingsForCalculatorByTournamentId,
    retrieveTeamRemainingMatchesByTournamentId,
} = require("./../../service")

const createGetCalculatorByTournamentId = (dependencies = {}) => {
    const retrieveTeamRemainingMatches =
        dependencies.retrieveTeamRemainingMatchesByTournamentId ||
        retrieveTeamRemainingMatchesByTournamentId
    const retrieveStandings =
        dependencies.retrieveStandingsForCalculatorByTournamentId ||
        retrieveStandingsForCalculatorByTournamentId

    return async (req, res) => {
        const { tournament } = req.params
        // Joi ya parseó y acotó el JSON de `teams`.
        const teamIDs = req.query.teams

        // Partidos restantes de cada equipo seleccionado y tabla del torneo
        // con PJ, PG, PE, PP y PTS.
        const [teams, standings] = await Promise.all([
            retrieveTeamRemainingMatches(tournament, teamIDs),
            retrieveStandings(tournament),
        ])

        return res.status(200).json({ teams, standings })
    }
}

const getCalculatorByTournamentId = createGetCalculatorByTournamentId()

module.exports = getCalculatorByTournamentId
module.exports.createGetCalculatorByTournamentId =
    createGetCalculatorByTournamentId

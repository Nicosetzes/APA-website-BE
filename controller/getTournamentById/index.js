const { retrieveTournamentById } = require("./../../service")
const { HttpError } = require("../../middleware/httpErrors")

const createGetTournamentById = (dependencies = {}) => {
    const retrieveTournament =
        dependencies.retrieveTournamentById || retrieveTournamentById

    return async (req, res) => {
        const tournament = await retrieveTournament(req.params.tournament)

        if (!tournament) {
            throw new HttpError(
                404,
                "TOURNAMENT_NOT_FOUND",
                "No se encontró el torneo"
            )
        }

        return res.status(200).json(tournament)
    }
}

const getTournamentById = createGetTournamentById()

module.exports = getTournamentById
module.exports.createGetTournamentById = createGetTournamentById

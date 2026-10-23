const { HttpError } = require("../../middleware/httpErrors")
const tournamentRecapsModel = require("../../dao/models/tournamentRecaps")

const PUBLIC_FIELDS = "-_id -__v"

const findTournamentRecap = (tournamentId) =>
    tournamentRecapsModel.findOne({ tournamentId }).select(PUBLIC_FIELDS).lean()

const createGetTournamentRecap = (dependencies = {}) => {
    const retrieveRecap =
        dependencies.findTournamentRecap || findTournamentRecap

    return async (req, res) => {
        const tournamentId = req.params.tournament
        const recap = await retrieveRecap(tournamentId)

        if (!recap) {
            throw new HttpError(
                404,
                "TOURNAMENT_RECAP_NOT_FOUND",
                "Todavía no hay recap para este torneo"
            )
        }

        return res.json({ success: true, data: recap })
    }
}

const getTournamentRecap = createGetTournamentRecap()

module.exports = getTournamentRecap
module.exports.createGetTournamentRecap = createGetTournamentRecap

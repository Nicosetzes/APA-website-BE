const upsertDailyRecapByTournamentId = require("./../../service/upsertDailyRecapByTournamentId")
const { HttpError } = require("../../middleware/httpErrors")

const createPostDailyRecapByTournamentId = (dependencies = {}) => {
    const upsertDailyRecap =
        dependencies.upsertDailyRecapByTournamentId ||
        upsertDailyRecapByTournamentId

    return async (req, res) => {
        const { tournament } = req.params
        const { date, content } = req.body
        const updatedTournament = await upsertDailyRecap(
            tournament,
            date,
            content
        )

        if (!updatedTournament) {
            throw new HttpError(
                404,
                "TOURNAMENT_NOT_FOUND",
                "No se encontró el torneo"
            )
        }

        return res.status(200).json({
            ok: true,
            tournament: updatedTournament,
        })
    }
}

const postDailyRecapByTournamentId = createPostDailyRecapByTournamentId()

module.exports = postDailyRecapByTournamentId
module.exports.createPostDailyRecapByTournamentId =
    createPostDailyRecapByTournamentId

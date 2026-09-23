const getDailyRecapByTournamentId = require("./../../service/getDailyRecapByTournamentId")
const { HttpError } = require("../../middleware/httpErrors")

const createGetDailyRecapByTournamentId = (dependencies = {}) => {
    const getDailyRecap =
        dependencies.getDailyRecapByTournamentId || getDailyRecapByTournamentId

    return async (req, res) => {
        const { tournament } = req.params
        const { date } = req.query
        const recap = await getDailyRecap(tournament, date)

        if (!recap) {
            throw new HttpError(
                404,
                "DAILY_RECAP_NOT_FOUND",
                "No se encontró el resumen solicitado"
            )
        }

        return res.status(200).json(recap)
    }
}

const controllerGetDailyRecapByTournamentId =
    createGetDailyRecapByTournamentId()

module.exports = controllerGetDailyRecapByTournamentId
module.exports.createGetDailyRecapByTournamentId =
    createGetDailyRecapByTournamentId

const getDailyRecapByTournamentId = require("./../../service/getDailyRecapByTournamentId")

const controllerGetDailyRecapByTournamentId = async (req, res) => {
    try {
        const { tournament } = req.params
        const { date } = req.query

        // Validate format only if a date was provided; otherwise default to latest
        if (date) {
            const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/
            if (!isoDateRegex.test(date)) {
                return res
                    .status(400)
                    .send("Invalid date format. Use YYYY-MM-DD")
            }
        }

        const recap = await getDailyRecapByTournamentId(tournament, date)
        if (!recap) return res.status(404).send("Daily recap not found")
        return res.status(200).json(recap)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = controllerGetDailyRecapByTournamentId

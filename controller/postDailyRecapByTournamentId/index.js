const upsertDailyRecapByTournamentId = require("./../../service/upsertDailyRecapByTournamentId")

const postDailyRecapByTournamentId = async (req, res) => {
    try {
        const { tournament } = req.params
        const { date, content } = req.body || {}

        if (!date || !content) {
            return res
                .status(400)
                .send("Missing required fields: date, content")
        }

        // Basic date validation: expect YYYY-MM-DD
        const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/
        if (!isoDateRegex.test(date)) {
            return res.status(400).send("Invalid date format. Use YYYY-MM-DD")
        }

        const updated = await upsertDailyRecapByTournamentId(
            tournament,
            date,
            content
        )
        return res.status(200).json({ ok: true, tournament: updated })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = postDailyRecapByTournamentId

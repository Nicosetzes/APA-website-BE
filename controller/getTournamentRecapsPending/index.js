const { retrieveTournamentsPendingRecap } = require("./../../service")

const createGetTournamentRecapsPending = (dependencies = {}) => {
    const retrievePending =
        dependencies.retrieveTournamentsPendingRecap ||
        retrieveTournamentsPendingRecap

    return async (req, res) => {
        const { closedAfter, limit } = req.query
        const pending = await retrievePending({
            closedAfter,
            limit,
            now: dependencies.now?.(),
        })

        return res.json({ success: true, ...pending })
    }
}

const getTournamentRecapsPending = createGetTournamentRecapsPending()

module.exports = getTournamentRecapsPending
module.exports.createGetTournamentRecapsPending =
    createGetTournamentRecapsPending

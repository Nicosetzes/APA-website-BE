const { retrieveAssistantPendingMatches } = require("./../../service")

const createGetAssistantPendingMatches = (dependencies = {}) => {
    const retrievePending =
        dependencies.retrieveAssistantPendingMatches ||
        retrieveAssistantPendingMatches

    return async (req, res) => {
        const { players, scope, tournamentId, stage, limit } = req.query
        const pending = await retrievePending({
            players,
            scope,
            tournamentId,
            stage,
            limit,
        })

        return res.status(200).json({ success: true, data: pending })
    }
}

const getAssistantPendingMatches = createGetAssistantPendingMatches()

module.exports = getAssistantPendingMatches
module.exports.createGetAssistantPendingMatches =
    createGetAssistantPendingMatches

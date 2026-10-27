const {
    decorateMatchesWithRatingChange,
} = require("../../service/ratingsReadModel/decorateMatchesWithRatingChange")
const defaultLogger = require("../../utils/logger")
const {
    retrieveAssistantRecentMatches,
    retrieveRatingChanges,
} = require("./../../service")

const createGetAssistantRecentMatches = (dependencies = {}) => {
    const retrieveRecentMatches =
        dependencies.retrieveAssistantRecentMatches ||
        retrieveAssistantRecentMatches
    const logger = dependencies.logger || defaultLogger
    const retrieveChanges =
        dependencies.retrieveRatingChanges ??
        (dependencies.retrieveAssistantRecentMatches
            ? undefined
            : retrieveRatingChanges)

    // Mismo adorno que `GET /api/matches`: nunca rechaza; si falla, los
    // partidos quedan sin `ratingChange`.
    const addRatingChanges = retrieveChanges
        ? async (matches) =>
              (
                  await decorateMatchesWithRatingChange({
                      payload: { matches },
                      retrieveRatingChanges: retrieveChanges,
                      readModelEnabled: dependencies.readModelEnabled,
                      logger,
                  })
              ).matches
        : undefined

    return async (req, res) => {
        const { player, stage, tournamentId, limit } = req.query
        const recentMatches = await retrieveRecentMatches(
            { player, stage, tournamentId, limit },
            { addRatingChanges }
        )

        return res.status(200).json({ success: true, data: recentMatches })
    }
}

const getAssistantRecentMatches = createGetAssistantRecentMatches()

module.exports = getAssistantRecentMatches
module.exports.createGetAssistantRecentMatches = createGetAssistantRecentMatches

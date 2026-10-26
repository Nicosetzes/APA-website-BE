const {
    decorateMatchesWithRatingChange,
} = require("../../service/ratingsReadModel/decorateMatchesWithRatingChange")
const defaultLogger = require("../../utils/logger")
const {
    retrieveAssistantHeadToHead,
    retrieveRatingChanges,
} = require("./../../service")

const createGetAssistantHeadToHead = (dependencies = {}) => {
    const retrieveHeadToHead =
        dependencies.retrieveAssistantHeadToHead || retrieveAssistantHeadToHead
    const logger = dependencies.logger || defaultLogger
    const retrieveChanges =
        dependencies.retrieveRatingChanges ??
        (dependencies.retrieveAssistantHeadToHead
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
        const { playerA, playerB, stage, tournamentId, limit } = req.query
        const headToHead = await retrieveHeadToHead(
            { playerA, playerB, stage, tournamentId, limit },
            { addRatingChanges }
        )

        return res.status(200).json({ success: true, data: headToHead })
    }
}

const getAssistantHeadToHead = createGetAssistantHeadToHead()

module.exports = getAssistantHeadToHead
module.exports.createGetAssistantHeadToHead = createGetAssistantHeadToHead

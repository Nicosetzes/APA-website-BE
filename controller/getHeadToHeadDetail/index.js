const {
    decorateMatchesWithRatingChange,
} = require("../../service/ratingsReadModel/decorateMatchesWithRatingChange")
const retrieveHeadToHead = require("../../service/retrieveHeadToHead")
const { retrieveRatingChanges } = require("./../../service")
const defaultLogger = require("../../utils/logger")

const createGetHeadToHeadDetail = (dependencies = {}) => {
    const retrieve = dependencies.retrieveHeadToHead || retrieveHeadToHead
    const logger = dependencies.logger || defaultLogger
    const retrieveChanges =
        dependencies.retrieveRatingChanges ??
        (dependencies.retrieveHeadToHead ? undefined : retrieveRatingChanges)

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
        const { playerA, playerB } = req.params
        const { stage, tournamentId, dateFrom, dateTo, limit } = req.query
        const detail = await retrieve(
            {
                playerA,
                playerB,
                stage,
                tournamentId,
                dateFrom,
                dateTo,
                limit,
            },
            { addRatingChanges }
        )
        return res.status(200).json(detail)
    }
}

const getHeadToHeadDetail = createGetHeadToHeadDetail()

module.exports = getHeadToHeadDetail
module.exports.createGetHeadToHeadDetail = createGetHeadToHeadDetail

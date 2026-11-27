const { isReadModelEnabled } = require("../../config/ratingReadModel")
const retrieveHeadToHead = require("../../service/retrieveHeadToHead")
const { retrieveRatingChanges } = require("./../../service")
const defaultLogger = require("../../utils/logger")

const createGetHeadToHeadDetail = (dependencies = {}) => {
    const retrieve = dependencies.retrieveHeadToHead || retrieveHeadToHead
    const logger = dependencies.logger || defaultLogger
    const readModelEnabled = dependencies.readModelEnabled || isReadModelEnabled
    const retrieveChanges =
        dependencies.retrieveRatingChanges ??
        (dependencies.retrieveHeadToHead ? undefined : retrieveRatingChanges)

    // La comparación es un adorno del historial. Si el read model está apagado,
    // stale o falla, se omite junto con los cambios por partido y el cara a cara
    // conserva su respuesta principal.
    const loadRatingData = retrieveChanges
        ? async ({ matches, playerA, playerB }) => {
              let reason = "disabled"
              try {
                  if (!readModelEnabled()) return null
                  const result = await retrieveChanges({
                      matchIds: matches.map((match) => String(match._id)),
                      playerA,
                      playerB,
                  })
                  if (!(result?.changes instanceof Map) || !result.comparison) {
                      reason = result?.stale || "unavailable"
                      return null
                  }
                  reason = "ok"
                  return result
              } catch (error) {
                  reason = "error"
                  try {
                      logger?.warn?.("head_to_head_rating_comparison", {
                          source: "none",
                          reason,
                          errorName: error?.name,
                          matches: matches.length,
                      })
                  } catch {
                      // El log no puede romper el historial.
                  }
                  return null
              } finally {
                  if (reason !== "error") {
                      try {
                          logger?.info?.("head_to_head_rating_comparison", {
                              source: reason === "ok" ? "stored" : "none",
                              reason,
                              matches: matches.length,
                          })
                      } catch {
                          // El log no puede romper el historial.
                      }
                  }
              }
          }
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
            { loadRatingData }
        )
        return res.status(200).json(detail)
    }
}

const getHeadToHeadDetail = createGetHeadToHeadDetail()

module.exports = getHeadToHeadDetail
module.exports.createGetHeadToHeadDetail = createGetHeadToHeadDetail

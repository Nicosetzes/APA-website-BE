const {
    decorateMatchesWithPrediction,
} = require("../../service/playerRatings/prediction")
const defaultLogger = require("../../utils/logger")
const {
    retrieveAssistantPendingMatches,
    retrieveRatingMatches,
    retrieveStoredPredictionIndex,
} = require("./../../service")

// Comparte entre torneos una sola lectura (de lo guardado o del historial en
// vivo): los pendientes no tienen eventos, así que todas las llamadas piden lo
// mismo (`matchIds: []`). Se crea por pedido, nunca se guarda entre pedidos.
const once = (read) => {
    let pending
    return (...args) =>
        (pending ??= Promise.resolve().then(() => read(...args)))
}

const createGetAssistantPendingMatches = (dependencies = {}) => {
    const retrievePending =
        dependencies.retrieveAssistantPendingMatches ||
        retrieveAssistantPendingMatches
    const retrieveEveryMatch =
        dependencies.retrieveAllMatches || retrieveRatingMatches
    const logger = dependencies.logger || defaultLogger
    // Lector de ratings persistidos por defecto, salvo que se inyecte el lector
    // en vivo o el servicio: así los tests no tocan el DAO real.
    const retrieveStoredIndex =
        dependencies.retrieveStoredPredictionIndex ??
        (dependencies.retrieveAllMatches ||
        dependencies.retrieveAssistantPendingMatches
            ? undefined
            : retrieveStoredPredictionIndex)

    return async (req, res) => {
        const { players, scope, tournamentId, stage, limit } = req.query
        const storedOnce = retrieveStoredIndex
            ? once(retrieveStoredIndex)
            : undefined
        const liveOnce = once(retrieveEveryMatch)
        // Adorno (como `ratingChange` en el cara a cara): agrega `favorite` a
        // los partidos devueltos con la predicción del APA Rating 2.0, sin
        // cambiar el motor. Nunca rechaza: si falla, salen sin `favorite`.
        const addPredictions = ({ matches, tournament }) =>
            decorateMatchesWithPrediction({
                matches,
                tournament,
                retrieveAllMatches: liveOnce,
                retrieveStoredIndex: storedOnce,
                readModelEnabled: dependencies.readModelEnabled,
                logger,
                options: dependencies.predictionOptions,
            })
        const pending = await retrievePending(
            { players, scope, tournamentId, stage, limit },
            { addPredictions, logger }
        )
        return res.status(200).json({ success: true, data: pending })
    }
}

const getAssistantPendingMatches = createGetAssistantPendingMatches()

module.exports = getAssistantPendingMatches
module.exports.createGetAssistantPendingMatches =
    createGetAssistantPendingMatches

const { buildRatingsTimeline } = require("../playerRatings/timeline")
const { buildRatingDocuments } = require("./buildRatingDocuments")
const { computeFingerprint } = require("./fingerprint")

// Única computación de los ratings persistidos: motor de producción, fingerprint
// y documentos. La usan los dos scripts (recompute y verify) y la actualización
// al escribir (service/ratingsSync) a través de `pipeline.js`.
//
// Módulo puro: no lee ni escribe la base. `sourceStats` (opcional) se pasa tal
// cual al builder para que cada jugador guarde su `source`.
const computeRatingsState = (
    matches,
    { now = new Date(), sourceStats = null } = {}
) => {
    const timeline = buildRatingsTimeline(matches)
    const fingerprint = computeFingerprint({ config: timeline.config })
    const computed = buildRatingDocuments(timeline, {
        fingerprint,
        computedAt: now,
        sourceStats,
    })
    return {
        ratingVersion: timeline.config.version,
        fingerprint,
        computed,
        matchCount: Array.isArray(matches) ? matches.length : 0,
        timeline,
    }
}

module.exports = { computeRatingsState }

const { buildRatingsTimeline } = require("../playerRatings/timeline")
const { buildRatingDocuments } = require("./buildRatingDocuments")
const constants = require("./constants")
const { checkRatingsDrift } = require("./drift")
const diff = require("./diff")
const { computeFingerprint } = require("./fingerprint")
const freshness = require("./freshness")
const { formatSummary, summarizeDiff } = require("./summary")
const { canonicalStringify } = require("./canonicalJson")

// Única computación de los ratings persistidos: motor de producción, fingerprint
// y documentos. La usan los dos scripts (recompute y verify).
//
// Módulo puro: no lee ni escribe la base. Lo usan solo los scripts de
// recompute y verify; la app no carga este barrel (el camino de lectura importa
// únicamente los módulos que necesita). `sourceStats` (opcional) se pasa tal
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

module.exports = {
    ...constants,
    ...diff,
    ...freshness,
    buildRatingDocuments,
    canonicalStringify,
    checkRatingsDrift,
    computeFingerprint,
    computeRatingsState,
    formatSummary,
    summarizeDiff,
}

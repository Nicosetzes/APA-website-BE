const { buildRatingDocuments } = require("./buildRatingDocuments")
const { computeRatingsState } = require("./computeState")
const constants = require("./constants")
const { checkRatingsDrift } = require("./drift")
const diff = require("./diff")
const { computeFingerprint } = require("./fingerprint")
const freshness = require("./freshness")
const pipeline = require("./pipeline")
const { formatSummary, summarizeDiff } = require("./summary")
const { canonicalStringify } = require("./canonicalJson")

// Barrel de los ratings persistidos. Módulos puros: no leen ni escriben la base.
// Lo usan los scripts de recompute y verify y la actualización al escribir
// (service/ratingsSync); el camino de lectura de la app (dao/index.js y
// service/index.js) NO carga este barrel, importa únicamente los módulos que
// necesita (freshness, fingerprint). La computación vive en `computeState.js` y
// la orquestación de lecturas + diff en `pipeline.js`.
module.exports = {
    ...constants,
    ...diff,
    ...freshness,
    ...pipeline,
    buildRatingDocuments,
    canonicalStringify,
    checkRatingsDrift,
    computeFingerprint,
    computeRatingsState,
    formatSummary,
    summarizeDiff,
}

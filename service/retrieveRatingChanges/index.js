const {
    findPlayerRatings,
    findRatingChangesByMatchIds,
    findRatingSourceStats,
} = require("./../../dao")
const { computeFingerprint } = require("../ratingsStore/fingerprint")
const {
    createRetrieveRatingChanges,
} = require("../ratingsReadModel/createRetrieveRatingChanges")

// Variación de rating por partido leída de los ratings persistidos (ver
// service/ratingsReadModel). Cablea los DAOs reales. La huella actual se calcula
// una sola vez por proceso: depende de la config y de data/teamRatings.json, que
// son estáticos.
let currentFingerprint = null
const getCurrentFingerprint = () => {
    if (currentFingerprint === null) currentFingerprint = computeFingerprint()
    return currentFingerprint
}

const retrieveRatingChanges = createRetrieveRatingChanges({
    findRatingSourceStats,
    findPlayerRatings,
    findRatingChangesByMatchIds,
    getCurrentFingerprint,
})

module.exports = retrieveRatingChanges

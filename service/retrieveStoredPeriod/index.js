const {
    findRankingPlayerRatings,
    findRatingBoundaryEvents,
    findRatingEventsInRange,
    findRatingSourceStats,
} = require("./../../dao")
const { computeFingerprint } = require("../ratingsStore/fingerprint")
const {
    createRetrieveStoredPeriod,
} = require("../ratingsReadModel/createRetrieveStoredPeriod")

// Período leído de los ratings persistidos (ver service/ratingsReadModel).
// Cablea los DAOs reales. La huella actual se calcula una sola vez por proceso:
// depende de la config y de data/teamRatings.json, que son estáticos.
let currentFingerprint = null
const getCurrentFingerprint = () => {
    if (currentFingerprint === null) currentFingerprint = computeFingerprint()
    return currentFingerprint
}

const retrieveStoredPeriod = createRetrieveStoredPeriod({
    findRatingSourceStats,
    findRankingPlayerRatings,
    findRatingEventsInRange,
    findRatingBoundaryEvents,
    getCurrentFingerprint,
})

module.exports = retrieveStoredPeriod

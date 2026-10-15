const {
    findPlayerRatings,
    findRatingEventsByMatchIds,
    findRatingSourceStats,
} = require("./../../dao")
const { computeFingerprint } = require("../ratingsStore/fingerprint")
const { createRetrieveStoredPredictionIndex } = require("../ratingsReadModel")
// Índice de predicción leído de los ratings persistidos (ver
// service/ratingsReadModel). Cablea los DAOs reales.
//
// La huella actual se calcula una sola vez por proceso: depende de la config de
// ratings y de data/teamRatings.json, que son estáticos (un SHA-256 por request
// sería trabajo repetido). Se importa `fingerprint.js` por archivo y no el
// barrel de `ratingsStore`, que arrastra el camino de escritura.
let currentFingerprint = null
const getCurrentFingerprint = () => {
    if (currentFingerprint === null) currentFingerprint = computeFingerprint()
    return currentFingerprint
}

const retrieveStoredPredictionIndex = createRetrieveStoredPredictionIndex({
    findRatingSourceStats,
    findPlayerRatings,
    findRatingEventsByMatchIds,
    getCurrentFingerprint,
})

module.exports = retrieveStoredPredictionIndex

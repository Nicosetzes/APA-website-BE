const { RATING_MATCHES_CACHE_TTL_MS } = require("../../config/cache")
const { createSingleFlightCache } = require("../../utils/singleFlightCache")
const { findRatingMatches } = require("./../../dao")

// Historial liviano que alimenta el motor de ratings. Es el mismo para todos los
// endpoints de rating, así que se guarda en memoria unos segundos (ver
// config/cache.js): pedidos simultáneos comparten una lectura y los siguientes
// dentro del TTL no tocan la base. Se invalida cuando entra una escritura
// (middleware/invalidateRatingCache.js).
//
// El arreglo devuelto está congelado y lo comparten todos los llamadores: no se
// puede modificar (los consumidores lo filtran y ordenan en copias).
const cache = createSingleFlightCache({
    read: async () => Object.freeze(await findRatingMatches()),
    ttlMs: RATING_MATCHES_CACHE_TTL_MS,
})

const retrieveRatingMatches = async () => cache.get()

module.exports = retrieveRatingMatches
module.exports.invalidate = cache.invalidate

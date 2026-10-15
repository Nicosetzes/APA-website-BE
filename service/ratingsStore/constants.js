// Constantes de los ratings persistidos (etapa 1). Módulo puro: sin DB.

// Subir cuando cambie la FORMA de los documentos guardados (campos nuevos,
// renombrados o con otro significado). Entra al fingerprint, así que todo lo
// guardado queda marcado como desactualizado y hay que re-correr recompute.
const RATINGS_STORE_SCHEMA_VERSION = 1

// Subir cuando cambie la lógica del motor (service/playerRatings) sin tocar
// config/ratings.js ni data/teamRatings.json: esos dos ya entran al fingerprint,
// pero un cambio de código no.
const RATINGS_ENGINE_VERSION = "engine-1"

const PLAYER_RATINGS_COLLECTION = "player-ratings"
const RATING_EVENTS_COLLECTION = "rating-events"

// Únicas colecciones en las que se puede escribir desde estos scripts.
const ALLOWED_COLLECTIONS = Object.freeze([
    PLAYER_RATINGS_COLLECTION,
    RATING_EVENTS_COLLECTION,
])

// Tolerancia al comparar números guardados contra los recalculados.
const NUMERIC_TOLERANCE = 1e-9

// Operaciones por llamada a bulkWrite.
const DEFAULT_BATCH_SIZE = 500

module.exports = {
    ALLOWED_COLLECTIONS,
    DEFAULT_BATCH_SIZE,
    NUMERIC_TOLERANCE,
    PLAYER_RATINGS_COLLECTION,
    RATINGS_ENGINE_VERSION,
    RATINGS_STORE_SCHEMA_VERSION,
    RATING_EVENTS_COLLECTION,
}

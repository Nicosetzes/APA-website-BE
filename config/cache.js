// Caché en memoria del historial de partidos que usan los ratings
// (service/retrieveRatingMatches).
//
// Es por instancia del servidor: en Vercel cada instancia serverless tiene el
// suyo y se pierde cuando se enfría. Una escritura (POST, PUT, PATCH o DELETE) lo
// invalida en la instancia que la atendió; las demás instancias se actualizan
// cuando vence el TTL. Por eso el TTL es el atraso máximo que puede ver alguien
// en otra instancia después de cargar un resultado.
//
// `RATING_MATCHES_CACHE_TTL_MS` lo cambia desde el entorno; 0 lo desactiva.
const DEFAULT_RATING_MATCHES_CACHE_TTL_MS = 30000

const parseTtl = (value) => {
    if (value === undefined || value === "") {
        return DEFAULT_RATING_MATCHES_CACHE_TTL_MS
    }
    const ttl = Number(value)
    return Number.isFinite(ttl) && ttl >= 0
        ? ttl
        : DEFAULT_RATING_MATCHES_CACHE_TTL_MS
}

module.exports = {
    DEFAULT_RATING_MATCHES_CACHE_TTL_MS,
    RATING_MATCHES_CACHE_TTL_MS: parseTtl(
        process.env.RATING_MATCHES_CACHE_TTL_MS
    ),
    parseTtl,
}

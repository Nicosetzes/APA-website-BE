// Interruptor del read-model de ratings (ratings persistidos en `player-ratings`
// y `rating-events`, que los endpoints de predicción usan en lugar de recalcular
// el historial completo).
//
// Variable: `RATING_READ_MODEL`. Solo `off`, `0` y `false` (sin importar
// mayúsculas ni espacios alrededor) lo apagan; ausente, vacía o con cualquier
// otro valor queda ENCENDIDO. Efecto de apagarlo: los endpoints fuerzan el camino
// en vivo (calculan desde `matches`, como antes del read-model) sin leer las
// colecciones persistidas.
//
// A diferencia de `config/cache.js`, no es una constante que se fija al cargar el
// módulo: `isReadModelEnabled` lee el entorno en cada llamada.
const OFF_VALUES = ["off", "0", "false"]

const parseReadModelEnabled = (value) => {
    if (typeof value !== "string") return true
    return !OFF_VALUES.includes(value.trim().toLowerCase())
}

const isReadModelEnabled = (env = process.env) =>
    parseReadModelEnabled(env.RATING_READ_MODEL)

module.exports = { isReadModelEnabled, parseReadModelEnabled }

// Ajustes de la actualización de los ratings persistidos al escribir un
// resultado (etapa 3: service/ratingsSync). Tres variables de entorno:
//
// - `RATING_SYNC_ON_WRITE`: interruptor. Solo `off`, `0` y `false` (sin importar
//   mayúsculas ni espacios alrededor) lo apagan; ausente, vacía o con cualquier
//   otro valor queda ENCENDIDO. Apagado, cargar o borrar un resultado no toca
//   `player-ratings` ni `rating-events` (los lectores caen al camino en vivo por
//   el chequeo de frescura) y hay que correr `npm run recompute:ratings -- --apply`.
// - `RATING_SYNC_TIMEOUT_MS`: presupuesto de tiempo de la sincronización dentro
//   del request (default 5000). Vencido, la respuesta sale igual y se loguea
//   `timeout`.
// - `RATING_SYNC_MAX_CHANGES`: máximo de documentos (eventos + jugadores, de las
//   dos colecciones) que se aplican en línea (default 300). Un diff mayor se
//   saltea (`skipped` / `large_diff`) y queda para el script.
//
// Los dos números aceptan solo enteros positivos escritos como tal. Un valor
// vacío, ausente, decimal, negativo, cero o no numérico cae al default: `0` NO
// significa "sin límite" ni "sin tiempo"; para apagar está el interruptor.
//
// Igual que `config/ratingReadModel.js`, no son constantes fijadas al cargar el
// módulo: `getRatingSyncSettings` lee el entorno en cada llamada.
const DEFAULT_RATING_SYNC_TIMEOUT_MS = 5000
const DEFAULT_RATING_SYNC_MAX_CHANGES = 300
const OFF_VALUES = ["off", "0", "false"]

const parseSyncEnabled = (value) => {
    if (typeof value !== "string") return true
    return !OFF_VALUES.includes(value.trim().toLowerCase())
}

// `setTimeout` de Node dispara a 1 ms cualquier demora mayor a 2^31-1: el
// presupuesto de tiempo no puede pasar de ahí.
const MAX_TIMER_MS = 2147483647

const parsePositiveInteger = (
    value,
    fallback,
    max = Number.MAX_SAFE_INTEGER
) => {
    if (typeof value !== "string") return fallback
    const text = value.trim()
    if (!/^\d+$/.test(text)) return fallback
    const number = Number(text)
    return Number.isSafeInteger(number) && number > 0 && number <= max
        ? number
        : fallback
}

const getRatingSyncSettings = (env = process.env) => ({
    enabled: parseSyncEnabled(env.RATING_SYNC_ON_WRITE),
    timeoutMs: parsePositiveInteger(
        env.RATING_SYNC_TIMEOUT_MS,
        DEFAULT_RATING_SYNC_TIMEOUT_MS,
        MAX_TIMER_MS
    ),
    maxChanges: parsePositiveInteger(
        env.RATING_SYNC_MAX_CHANGES,
        DEFAULT_RATING_SYNC_MAX_CHANGES
    ),
})

module.exports = {
    DEFAULT_RATING_SYNC_MAX_CHANGES,
    DEFAULT_RATING_SYNC_TIMEOUT_MS,
    getRatingSyncSettings,
    parsePositiveInteger,
    parseSyncEnabled,
}

// Cuentas puras del script `measureRatingsRead` (no tocan la base).

// Tope de transferencia de salida de un cluster gratuito de Atlas (M0) en una
// ventana móvil de 7 días: "10 GB" según la documentación de Atlas (se toma
// 1 GB = 1024^3 bytes; la diferencia con 10^9 es de ~7% y no cambia la lectura).
const FREE_TIER_WEEKLY_OUT_BYTES = 10 * 1024 ** 3

const median = (values) => {
    if (!values.length) return null
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2
}

const summarizeTimes = (values) =>
    values.length
        ? {
              min: Math.min(...values),
              median: median(values),
              max: Math.max(...values),
          }
        : null

const formatBytes = (bytes) => {
    if (bytes === null || bytes === undefined) return "n/a"
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

const formatMs = (ms) =>
    ms === null || ms === undefined ? "n/a" : `${ms.toFixed(1)} ms`

// Cuántas lecturas completas de `bytesPerRead` entran en el tope semanal si
// ese fuera el único tráfico. Es una cota superior optimista.
const readsWithinBudget = (bytesPerRead, budget = FREE_TIER_WEEKLY_OUT_BYTES) =>
    bytesPerRead > 0 ? Math.floor(budget / bytesPerRead) : null

// "a b.c d" -> { a: 1, "b.c": 1, d: 1 } (proyección de `find` como `$project`).
const projectionFromString = (projection) =>
    Object.fromEntries(
        String(projection)
            .split(/\s+/)
            .filter(Boolean)
            .map((field) => [field, 1])
    )

module.exports = {
    FREE_TIER_WEEKLY_OUT_BYTES,
    formatBytes,
    formatMs,
    median,
    projectionFromString,
    readsWithinBudget,
    summarizeTimes,
}

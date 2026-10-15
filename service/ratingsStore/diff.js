const { NUMERIC_TOLERANCE } = require("./constants")

// Diferencia entre los documentos recalculados y los guardados. Función pura y
// genérica: la usan `recompute:ratings`, `verify:ratings` y, más adelante, la
// actualización por escritura.

// `source` (jugadores) se compara anidado como cualquier objeto: las `Date` por
// `getTime()` (instancias distintas con el mismo instante son iguales) y un
// `source` faltante en lo guardado NO es igual a uno presente en lo calculado.

// Campos que nunca cuentan al comparar. `fingerprint` NO está acá: si cambia,
// todo lo guardado está desactualizado.
const IGNORED_FIELDS = new Set([
    "_id",
    "__v",
    "computedAt",
    "createdAt",
    "updatedAt",
])

const isNil = (value) => value === null || value === undefined
const isBsonId = (value) =>
    typeof value === "object" && value !== null && value._bsontype !== undefined
const toMs = (value) => (value instanceof Date ? value.getTime() : value)

const valuesEqual = (a, b, tolerance) => {
    if (isNil(a) || isNil(b)) return isNil(a) && isNil(b)
    if (a instanceof Date || b instanceof Date) {
        return toMs(a) === toMs(b)
    }
    if (isBsonId(a) || isBsonId(b)) return String(a) === String(b)
    if (typeof a === "number" || typeof b === "number") {
        if (typeof a !== "number" || typeof b !== "number") return false
        if (Number.isNaN(a) || Number.isNaN(b)) {
            return Number.isNaN(a) && Number.isNaN(b)
        }
        if (a === b) return true
        return Math.abs(a - b) <= tolerance
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        return (
            Array.isArray(a) &&
            Array.isArray(b) &&
            a.length === b.length &&
            a.every((item, index) => valuesEqual(item, b[index], tolerance))
        )
    }
    if (typeof a === "object" && typeof b === "object") {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)])
        for (const key of keys) {
            if (IGNORED_FIELDS.has(key)) continue
            if (!valuesEqual(a[key], b[key], tolerance)) return false
        }
        return true
    }
    return a === b
}

const docsEqual = (a, b, tolerance = NUMERIC_TOLERANCE) =>
    valuesEqual(a, b, tolerance)

const keyOfEvent = (doc) => `${doc.ratingVersion}|${String(doc.matchId)}`
const keyOfPlayer = (doc) => `${doc.ratingVersion}|${String(doc.id)}`

const indexByKey = (docs, keyOf, label) => {
    const map = new Map()
    for (const doc of docs) {
        const key = keyOf(doc)
        if (map.has(key)) throw new Error(`clave duplicada en ${label}: ${key}`)
        map.set(key, doc)
    }
    return map
}

const diffCollection = (computed, stored, keyOf, label, tolerance) => {
    const computedByKey = indexByKey(computed, keyOf, `${label} calculados`)
    const storedByKey = indexByKey(stored, keyOf, `${label} guardados`)
    const result = { insert: [], update: [], delete: [] }
    for (const [key, doc] of computedByKey) {
        const existing = storedByKey.get(key)
        if (existing === undefined) result.insert.push(doc)
        else if (!docsEqual(doc, existing, tolerance)) result.update.push(doc)
    }
    for (const [key, doc] of storedByKey) {
        if (!computedByKey.has(key)) result.delete.push(doc)
    }
    return result
}

// `computed` y `stored` tienen la forma `{ events, players }`; en `stored`
// puede faltar cualquiera (o venir vacío). `update` devuelve el documento
// calculado, `delete` el guardado.
const diffRatingDocuments = (
    computed,
    stored,
    { tolerance = NUMERIC_TOLERANCE } = {}
) => ({
    events: diffCollection(
        computed?.events ?? [],
        stored?.events ?? [],
        keyOfEvent,
        "eventos",
        tolerance
    ),
    players: diffCollection(
        computed?.players ?? [],
        stored?.players ?? [],
        keyOfPlayer,
        "jugadores",
        tolerance
    ),
})

const OPERATIONS = ["insert", "update", "delete"]

const countDiff = (diff) => {
    const totals = { insert: 0, update: 0, delete: 0 }
    for (const section of [diff.events, diff.players]) {
        for (const operation of OPERATIONS) {
            totals[operation] += section[operation].length
        }
    }
    return totals
}

const isEmptyDiff = (diff) => {
    const totals = countDiff(diff)
    return totals.insert + totals.update + totals.delete === 0
}

module.exports = {
    IGNORED_FIELDS,
    countDiff,
    diffRatingDocuments,
    docsEqual,
    isEmptyDiff,
    keyOfEvent,
    keyOfPlayer,
}

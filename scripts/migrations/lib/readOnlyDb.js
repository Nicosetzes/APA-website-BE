const { ToolError } = require("./errors")

const DEFAULT_MAX_TIME_MS = 30000
const WRITE_STAGES = new Set(["$out", "$merge"])

class ReadOnlyViolation extends ToolError {
    constructor(property) {
        super(
            `operación no permitida en modo sólo lectura: ${property}`,
            "ReadOnlyViolation"
        )
    }
}

const containsWriteStage = (value) => {
    if (Array.isArray(value)) return value.some(containsWriteStage)
    if (value === null || typeof value !== "object") return false
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return false

    return Object.entries(value).some(
        ([key, nested]) => WRITE_STAGES.has(key) || containsWriteStage(nested)
    )
}

// Los cursores del driver exponen el client (y con él, escrituras): sólo se
// devuelve toArray.
const wrapCursor = (cursor) =>
    Object.freeze({ toArray: () => cursor.toArray() })

/*
 * Envuelve un objeto con una lista blanca de propiedades. Cualquier otra
 * lectura, asignación o borrado lanza ReadOnlyViolation. `then` y los
 * símbolos devuelven undefined para que el objeto se pueda devolver desde
 * funciones async e inspeccionar sin romper.
 */
const guard = (label, allowed) =>
    new Proxy(Object.freeze({ ...allowed }), {
        get: (target, property) => {
            if (typeof property === "symbol" || property === "then") {
                return undefined
            }
            if (Object.prototype.hasOwnProperty.call(target, property)) {
                return target[property]
            }
            throw new ReadOnlyViolation(`${label}.${property}`)
        },
        set: (target, property) => {
            throw new ReadOnlyViolation(`${label}.${String(property)} =`)
        },
        defineProperty: (target, property) => {
            throw new ReadOnlyViolation(`${label}.${String(property)} =`)
        },
        deleteProperty: (target, property) => {
            throw new ReadOnlyViolation(`delete ${label}.${String(property)}`)
        },
        setPrototypeOf: () => {
            throw new ReadOnlyViolation(`${label}.__proto__ =`)
        },
    })

const createReadOnlyCollection = (
    collection,
    name,
    maxTimeMS = DEFAULT_MAX_TIME_MS
) =>
    guard(`collection(${name})`, {
        collectionName: name,
        find: (filter = {}, options = {}) =>
            wrapCursor(collection.find(filter, { ...options, maxTimeMS })),
        aggregate: (pipeline = [], options = {}) => {
            if (!Array.isArray(pipeline)) {
                throw new ReadOnlyViolation("aggregate sin pipeline array")
            }
            if (containsWriteStage(pipeline)) {
                throw new ReadOnlyViolation("aggregate con $out/$merge")
            }
            return wrapCursor(
                collection.aggregate(pipeline, { ...options, maxTimeMS })
            )
        },
        countDocuments: (filter = {}, options = {}) =>
            collection.countDocuments(filter, { ...options, maxTimeMS }),
        listIndexes: (options = {}) =>
            wrapCursor(collection.listIndexes({ ...options, maxTimeMS })),
    })

const createReadOnlyDb = (db, { maxTimeMS = DEFAULT_MAX_TIME_MS } = {}) =>
    guard("db", {
        databaseName: db.databaseName,
        collection: (name) =>
            createReadOnlyCollection(db.collection(name), name, maxTimeMS),
    })

module.exports = {
    DEFAULT_MAX_TIME_MS,
    ReadOnlyViolation,
    createReadOnlyDb,
}

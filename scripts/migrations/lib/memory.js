/*
 * Simulación en memoria de las ops de una migración y validación de su forma.
 *
 * Op: { collection, _id, filter, update: { $set?, $unset? }, group, rule?,
 *       before: { path: valor | "$$absent" }, after: { ... } }
 * `collection` es el nombre real en Mongo ("face-to-face" | "tournaments").
 * Los paths son dotted; sólo atraviesan arrays con índices numéricos.
 */

const { ToolError } = require("./errors")
const { canonicalKey } = require("./ejson")
const { COLLECTIONS } = require("./snapshot")

const ABSENT = "$$absent"
// Op de borrado: { kind: "delete", collection, _id, filter, group, rule?,
//                  before: documento del snapshot, after: null }.
const DELETE_KIND = "delete"
const SNAPSHOT_KEYS = Object.freeze({
    [COLLECTIONS.matches]: "matches",
    [COLLECTIONS.tournaments]: "tournaments",
})
const UPDATE_OPERATORS = new Set(["$set", "$unset"])

const isPlainObject = (value) => {
    if (value === null || typeof value !== "object") return false
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
}

// ObjectId y demás tipos BSON son inmutables: se comparten por referencia.
const cloneValue = (value) => {
    if (value instanceof Date) return new Date(value.getTime())
    if (Array.isArray(value)) return value.map(cloneValue)
    if (isPlainObject(value)) {
        return Object.fromEntries(
            Object.entries(value).map(([key, nested]) => [
                key,
                cloneValue(nested),
            ])
        )
    }
    return value
}

const cloneSnapshot = (snapshot) =>
    Object.fromEntries(
        Object.entries(snapshot).map(([key, documents]) => [
            key,
            documents.map(cloneValue),
        ])
    )

const getPath = (document, path) =>
    path.split(".").reduce((current, segment) => {
        if (current === null || current === undefined) return undefined
        if (typeof current !== "object") return undefined
        return current[segment]
    }, document)

const setPath = (document, path, value) => {
    const segments = path.split(".")
    let current = document

    segments.slice(0, -1).forEach((segment) => {
        if (current[segment] === undefined) current[segment] = {}
        if (current[segment] === null || typeof current[segment] !== "object") {
            throw new ToolError(
                `no se puede setear ${path}: ${segment} no es un objeto`,
                "OpError"
            )
        }
        current = current[segment]
    })

    current[segments[segments.length - 1]] = cloneValue(value)
}

const unsetPath = (document, path) => {
    const segments = path.split(".")
    const parent = getPath(document, segments.slice(0, -1).join("."))
    const container = segments.length === 1 ? document : parent
    if (container !== null && typeof container === "object") {
        delete container[segments[segments.length - 1]]
    }
}

const touchedPaths = (update) => [
    ...Object.keys(update.$set || {}),
    ...Object.keys(update.$unset || {}),
]

const sameKeys = (left, right) =>
    left.length === right.length &&
    [...left].sort().join("\n") === [...right].sort().join("\n")

const opLabel = (op) => `${op?.collection}/${String(op?._id)}`

const isDeleteOp = (op) => op?.kind === DELETE_KIND

const assertValidOp = (op, { allowedCollections } = {}) => {
    const fail = (reason) => {
        throw new ToolError(`op inválida ${opLabel(op)}: ${reason}`, "OpError")
    }

    if (!isPlainObject(op)) fail("no es un objeto")
    if (!SNAPSHOT_KEYS[op.collection]) fail("colección desconocida")
    if (allowedCollections && !allowedCollections.includes(op.collection)) {
        fail("colección no declarada por la migración")
    }
    if (op._id === undefined || op._id === null) fail("falta _id")
    if (!isPlainObject(op.filter)) fail("falta filter")
    if (canonicalKey(op.filter._id) !== canonicalKey(op._id)) {
        fail("filter._id debe ser el _id de la op")
    }

    if (op.kind !== undefined && !isDeleteOp(op)) fail("kind desconocido")
    if (isDeleteOp(op)) {
        // Borrado de UN documento por _id; el filtro tiene que re-afirmar al
        // menos una condición más (nunca un borrado sólo por _id).
        if (op.update !== undefined) fail("un delete no lleva update")
        if (Object.keys(op.filter).length < 2) {
            fail("el filtro de un delete necesita condiciones además de _id")
        }
        if (!isPlainObject(op.before)) fail("falta before (documento)")
        if (canonicalKey(op.before._id) !== canonicalKey(op._id)) {
            fail("before._id debe ser el _id de la op")
        }
        if (op.after !== null) fail("after de un delete debe ser null")
        if (typeof op.group !== "string" || !op.group) fail("falta group")
        return
    }

    if (!isPlainObject(op.update)) fail("falta update")

    const operators = Object.keys(op.update)
    if (!operators.length) fail("update vacío")
    operators.forEach((operator) => {
        if (!UPDATE_OPERATORS.has(operator)) {
            fail(`operador no soportado ${operator}`)
        }
        if (!isPlainObject(op.update[operator])) fail(`${operator} inválido`)
    })

    const paths = touchedPaths(op.update)
    if (!paths.length) fail("update sin campos")
    if (new Set(paths).size !== paths.length) fail("campo repetido")
    paths.forEach((path) => {
        if (path === "_id" || path.startsWith("_id.")) fail("no se toca _id")
        if (paths.some((other) => other.startsWith(`${path}.`))) {
            fail(`paths superpuestos en ${path}`)
        }
    })
    Object.entries(op.update.$set || {}).forEach(([path, value]) => {
        if (value === ABSENT || value === undefined) {
            fail(`valor inválido en $set ${path}`)
        }
    })

    if (!isPlainObject(op.before) || !isPlainObject(op.after)) {
        fail("faltan before/after")
    }
    if (
        !sameKeys(Object.keys(op.before), paths) ||
        !sameKeys(Object.keys(op.after), paths)
    ) {
        fail("before/after deben tener exactamente los campos del update")
    }
    paths.forEach((path) => {
        const expected = Object.prototype.hasOwnProperty.call(
            op.update.$set || {},
            path
        )
            ? op.update.$set[path]
            : ABSENT
        if (canonicalKey(op.after[path]) !== canonicalKey(expected)) {
            fail(`after.${path} no coincide con el update`)
        }
    })
    if (typeof op.group !== "string" || !op.group) fail("falta group")
}

const assertValidOps = (ops, options) => {
    if (!Array.isArray(ops)) {
        throw new ToolError("plan() debe devolver ops como array", "OpError")
    }
    const seen = new Set()
    ops.forEach((op) => {
        assertValidOp(op, options)
        const key = `${op.collection}/${canonicalKey(op._id)}`
        if (seen.has(key)) {
            throw new ToolError(
                `op inválida ${opLabel(
                    op
                )}: más de una op para el mismo documento`,
                "OpError"
            )
        }
        seen.add(key)
    })
}

/*
 * Helper para los planes: arma before/after de un update a partir del
 * documento actual del snapshot.
 */
const describeUpdate = (document, update) => {
    const before = {}
    const after = {}

    Object.entries(update.$set || {}).forEach(([path, value]) => {
        const current = getPath(document, path)
        before[path] = current === undefined ? ABSENT : cloneValue(current)
        after[path] = cloneValue(value)
    })
    Object.keys(update.$unset || {}).forEach((path) => {
        const current = getPath(document, path)
        before[path] = current === undefined ? ABSENT : cloneValue(current)
        after[path] = ABSENT
    })

    return { before, after }
}

const applyUpdate = (document, update) => {
    Object.entries(update.$set || {}).forEach(([path, value]) =>
        setPath(document, path, value)
    )
    Object.keys(update.$unset || {}).forEach((path) =>
        unsetPath(document, path)
    )
}

/*
 * Devuelve un snapshot nuevo con las ops aplicadas ($set/$unset o delete); el
 * original no se toca. No evalúa `filter`: los planes calculan sus ops sobre
 * este mismo snapshot, así que el filtro idempotente matchea por construcción.
 */
const applyOpsInMemory = (snapshot, ops) => {
    assertValidOps(ops)

    const next = cloneSnapshot(snapshot)
    const indexes = Object.fromEntries(
        Object.entries(next).map(([key, documents]) => [
            key,
            new Map(
                documents.map((document) => [
                    canonicalKey(document._id),
                    document,
                ])
            ),
        ])
    )

    ops.forEach((op) => {
        const key = SNAPSHOT_KEYS[op.collection]
        const document = indexes[key]?.get(canonicalKey(op._id))
        if (!document) {
            throw new ToolError(
                `op inválida ${opLabel(
                    op
                )}: el documento no está en el snapshot`,
                "OpError"
            )
        }
        if (isDeleteOp(op)) {
            indexes[key].delete(canonicalKey(op._id))
            next[key] = next[key].filter((item) => item !== document)
            return
        }
        applyUpdate(document, op.update)
    })

    return next
}

module.exports = {
    ABSENT,
    DELETE_KIND,
    SNAPSHOT_KEYS,
    isDeleteOp,
    applyOpsInMemory,
    assertValidOp,
    assertValidOps,
    cloneSnapshot,
    cloneValue,
    describeUpdate,
    getPath,
    isPlainObject,
}

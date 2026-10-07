/*
 * Rollback genérico (puro): a partir de un before-file arma las ops que
 * restauran `before` sólo donde el documento sigue con los valores de
 * `after`, para no pisar ediciones posteriores al apply.
 */

const { ToolError } = require("./errors")
const { canonicalKey } = require("./ejson")
const {
    ABSENT,
    DELETE_KIND,
    SNAPSHOT_KEYS,
    getPath,
    isPlainObject,
} = require("./memory")

const INSERT_KIND = "insert"

const assertBeforeDocument = (document) => {
    const fail = (reason) => {
        throw new ToolError(`before-file inválido: ${reason}`, "RollbackError")
    }

    if (!isPlainObject(document)) fail("no es un objeto")
    if (typeof document.migrationId !== "string" || !document.migrationId) {
        fail("falta migrationId")
    }
    if (typeof document.runId !== "string" || !document.runId) {
        fail("falta runId")
    }
    if (typeof document.database !== "string" || !document.database) {
        fail("falta database")
    }
    if (!Array.isArray(document.entries)) fail("falta entries")

    document.entries.forEach((entry, index) => {
        if (isPlainObject(entry) && entry.kind !== undefined) {
            // Borrado: guarda el documento completo para re-insertarlo.
            if (
                entry.kind !== DELETE_KIND ||
                entry._id === undefined ||
                !SNAPSHOT_KEYS[entry.collection] ||
                !isPlainObject(entry.document) ||
                canonicalKey(entry.document._id) !== canonicalKey(entry._id)
            ) {
                fail(`entry ${index} (delete) mal formada`)
            }
            return
        }
        if (
            !isPlainObject(entry) ||
            entry._id === undefined ||
            !SNAPSHOT_KEYS[entry.collection] ||
            !isPlainObject(entry.before) ||
            !isPlainObject(entry.after)
        ) {
            fail(`entry ${index} mal formada`)
        }
        const beforeKeys = Object.keys(entry.before).sort().join("\n")
        const afterKeys = Object.keys(entry.after).sort().join("\n")
        if (!beforeKeys || beforeKeys !== afterKeys) {
            fail(`entry ${index}: before y after deben tener los mismos campos`)
        }
    })
}

const buildRollbackOp = (entry) => {
    if (entry.kind === DELETE_KIND) {
        // Re-inserta el documento original con su _id; si el _id ya existe
        // se saltea (nunca se pisa).
        return {
            kind: INSERT_KIND,
            collection: entry.collection,
            _id: entry._id,
            filter: { _id: entry._id },
            document: entry.document,
            group: "rollback-insert",
            before: null,
            after: entry.document,
        }
    }
    const filter = { _id: entry._id }
    const $set = {}
    const $unset = {}

    Object.entries(entry.after).forEach(([path, value]) => {
        filter[path] = value === ABSENT ? { $exists: false } : value
    })
    Object.entries(entry.before).forEach(([path, value]) => {
        if (value === ABSENT) $unset[path] = ""
        else $set[path] = value
    })

    const update = {}
    if (Object.keys($set).length) update.$set = $set
    if (Object.keys($unset).length) update.$unset = $unset

    return {
        collection: entry.collection,
        _id: entry._id,
        filter,
        update,
        group: "rollback",
        before: entry.after,
        after: entry.before,
    }
}

// Orden inverso al apply (las ops de una migración no repiten documento,
// así que es sólo por prolijidad).
const buildRollbackOps = (beforeDocument) => {
    assertBeforeDocument(beforeDocument)
    return [...beforeDocument.entries].reverse().map(buildRollbackOp)
}

// Réplica en memoria del filtro de rollback: cada campo igual a `after`.
const matchesAfter = (document, after) =>
    Boolean(document) &&
    Object.entries(after).every(([path, value]) => {
        const current = getPath(document, path)
        if (value === ABSENT) return current === undefined
        return canonicalKey(current) === canonicalKey(value)
    })

const evaluateRollback = (snapshot, beforeDocument) => {
    const ops = buildRollbackOps(beforeDocument)
    const indexes = Object.fromEntries(
        Object.entries(SNAPSHOT_KEYS).map(([collection, key]) => [
            collection,
            new Map(
                (snapshot[key] || []).map((document) => [
                    canonicalKey(document._id),
                    document,
                ])
            ),
        ])
    )
    const restorable = []
    const skipped = []

    ops.forEach((op) => {
        const document = indexes[op.collection].get(canonicalKey(op._id))
        if (op.kind === INSERT_KIND) {
            if (document) skipped.push(op)
            else restorable.push(op)
            return
        }
        if (matchesAfter(document, op.before)) restorable.push(op)
        else skipped.push(op)
    })

    return { ops, restorable, skipped }
}

module.exports = {
    INSERT_KIND,
    assertBeforeDocument,
    buildRollbackOp,
    buildRollbackOps,
    evaluateRollback,
    matchesAfter,
}

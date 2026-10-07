/*
 * ÚNICO módulo que escribe. run.js lo requiere de forma diferida sólo en las
 * ramas apply / rollback-apply, después de pasar el gate de safety.js; el
 * dry-run nunca lo carga.
 */

const fs = require("node:fs")
const path = require("node:path")

const { ToolError } = require("./errors")
const { canonicalKey, serialize } = require("./ejson")
const { DELETE_KIND, assertValidOps, isDeleteOp } = require("./memory")
const { INSERT_KIND, buildRollbackOps } = require("./rollback")
const { REGISTRY_COLLECTION } = require("./snapshot")

const DUPLICATE_KEY = 11000

const beforeFileName = (runId, migrationId) =>
    `${runId}-${migrationId}-before.json`

// Se escribe ANTES de cualquier escritura en la base; `wx` evita pisar uno
// existente. Para los deletes guarda el documento COMPLETO (EJSON canónico:
// conserva ObjectId, Date e int/double) leído de la base justo antes.
const writeBeforeFile = ({
    outDir,
    runId,
    migrationId,
    database,
    ops,
    deletedDocuments = new Map(),
}) => {
    fs.mkdirSync(outDir, { recursive: true })
    const file = path.join(outDir, beforeFileName(runId, migrationId))
    const document = {
        migrationId,
        runId,
        database,
        entries: ops.map((op) => {
            if (!isDeleteOp(op)) {
                return {
                    _id: op._id,
                    collection: op.collection,
                    before: op.before,
                    after: op.after,
                }
            }
            const full = deletedDocuments.get(
                `${op.collection}/${canonicalKey(op._id)}`
            )
            if (!full) {
                throw new ToolError(
                    `falta el documento completo de ${op.collection}/${String(
                        op._id
                    )}`,
                    "ApplyError"
                )
            }
            return {
                _id: op._id,
                collection: op.collection,
                kind: DELETE_KIND,
                document: full,
            }
        }),
    }
    fs.writeFileSync(file, `${serialize(document)}\n`, { flag: "wx" })
    return file
}

/*
 * Lee de la base los documentos completos que se van a borrar, con el MISMO
 * filtro de cada op. Si alguno ya no cumple (se jugó, cambió de torneo, no
 * existe) aborta antes de escribir nada.
 */
const loadDeletedDocuments = async (db, ops) => {
    const deleteOps = ops.filter(isDeleteOp)
    const documents = new Map()
    const byCollection = new Map()
    deleteOps.forEach((op) => {
        if (!byCollection.has(op.collection))
            byCollection.set(op.collection, [])
        byCollection.get(op.collection).push(op)
    })
    for (const [collection, list] of byCollection) {
        const found = await db
            .collection(collection)
            .find({ $or: list.map((op) => op.filter) })
            .toArray()
        const byId = new Map(
            found.map((document) => [canonicalKey(document._id), document])
        )
        const missing = list.filter((op) => !byId.has(canonicalKey(op._id)))
        if (missing.length) {
            throw new ToolError(
                `${
                    missing.length
                } documentos a borrar ya no cumplen su filtro (p. ej. ${String(
                    missing[0]._id
                )}); no se escribe nada`,
                "ApplyError"
            )
        }
        list.forEach((op) =>
            documents.set(
                `${collection}/${canonicalKey(op._id)}`,
                byId.get(canonicalKey(op._id))
            )
        )
    }
    return documents
}

const toWriteModel = (op) =>
    isDeleteOp(op)
        ? { deleteOne: { filter: op.filter } }
        : { updateOne: { filter: op.filter, update: op.update } }

// Tramos consecutivos por colección, para respetar el orden de las ops.
const batchByCollection = (ops) =>
    ops.reduce((batches, op) => {
        const last = batches[batches.length - 1]
        if (last && last.collection === op.collection) last.ops.push(op)
        else batches.push({ collection: op.collection, ops: [op] })
        return batches
    }, [])

const applyMigration = async ({
    db,
    migrationId,
    runId,
    ops,
    outDir,
    counts = {},
    now = () => new Date(),
}) => {
    assertValidOps(ops)

    const hasDeletes = ops.some(isDeleteOp)
    const deletedDocuments = hasDeletes
        ? await loadDeletedDocuments(db, ops)
        : new Map()
    const beforeFile = writeBeforeFile({
        outDir,
        runId,
        migrationId,
        database: db.databaseName,
        ops,
        deletedDocuments,
    })
    let matched = 0
    let modified = 0
    let deleted = 0

    for (const batch of batchByCollection(ops)) {
        const result = await db
            .collection(batch.collection)
            .bulkWrite(batch.ops.map(toWriteModel), { ordered: true })
        matched += result.matchedCount || 0
        modified += result.modifiedCount || 0
        deleted += result.deletedCount || 0
    }

    await db.collection(REGISTRY_COLLECTION).insertOne({
        migrationId,
        runId,
        kind: "apply",
        appliedAt: now(),
        counts: {
            ...counts,
            matched,
            modified,
            ...(hasDeletes ? { deleted } : {}),
        },
        beforeFile: path.basename(beforeFile),
    })

    return { beforeFile, matched, modified, ...(hasDeletes ? { deleted } : {}) }
}

/*
 * Restaura cada entry sólo si el documento sigue con los valores de `after`.
 * Va de a una op para saber exactamente cuáles quedaron `skipped`.
 */
const applyRollback = async ({
    db,
    beforeDocument,
    beforeFile,
    runId,
    now = () => new Date(),
}) => {
    const ops = buildRollbackOps(beforeDocument)
    const skipped = []
    let restored = 0

    for (const op of ops) {
        if (op.kind === INSERT_KIND) {
            // Re-inserta el documento borrado con su _id original; si ese _id
            // ya existe (o aparece en el medio: 11000) se saltea.
            const existing = await db
                .collection(op.collection)
                .find({ _id: op._id }, { projection: { _id: 1 }, limit: 1 })
                .toArray()
            if (existing.length) {
                skipped.push({ collection: op.collection, _id: op._id })
                continue
            }
            try {
                await db.collection(op.collection).insertOne(op.document)
                restored += 1
            } catch (error) {
                if (error?.code !== DUPLICATE_KEY) throw error
                skipped.push({ collection: op.collection, _id: op._id })
            }
            continue
        }
        const result = await db
            .collection(op.collection)
            .updateOne(op.filter, op.update)
        if (result.matchedCount === 0) {
            skipped.push({ collection: op.collection, _id: op._id })
        } else {
            restored += 1
        }
    }

    await db.collection(REGISTRY_COLLECTION).insertOne({
        migrationId: beforeDocument.migrationId,
        runId,
        kind: "rollback",
        appliedAt: now(),
        counts: { entries: ops.length, restored, skipped: skipped.length },
        beforeFile: path.basename(beforeFile),
    })

    return { restored, skipped }
}

module.exports = {
    applyMigration,
    applyRollback,
    batchByCollection,
    beforeFileName,
    loadDeletedDocuments,
    writeBeforeFile,
}

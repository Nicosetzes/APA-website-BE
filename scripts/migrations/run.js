/*
 * CLI de migraciones de datos. Por defecto dry-run: la base sólo se ve a
 * través de createReadOnlyDb y lib/apply.js (el único módulo que escribe) se
 * requiere de forma diferida en las ramas apply / rollback-apply, después del
 * gate de safety.js. Nunca imprime host, URI ni valores del .env.
 *
 * Uso: node scripts/migrations/run.js --help
 */

const fs = require("node:fs")

const { USAGE, parseArgs } = require("./lib/args")
const { deserialize, deserializeStrict } = require("./lib/ejson")
const { ToolError, describeError } = require("./lib/errors")
const {
    DELETE_KIND,
    applyOpsInMemory,
    assertValidOps,
    cloneSnapshot,
} = require("./lib/memory")
const { createReadOnlyDb } = require("./lib/readOnlyDb")
const { buildReport, printSummary, writeReport } = require("./lib/report")
const { assertBeforeDocument, evaluateRollback } = require("./lib/rollback")
const {
    environmentCategory,
    isTestDatabaseName,
    resolveMode,
} = require("./lib/safety")
const {
    COLLECTIONS,
    REGISTRY_COLLECTION,
    loadSnapshot,
    snapshotCounts,
} = require("./lib/snapshot")

const EXIT = Object.freeze({ OK: 0, ERROR: 1, BLOCKED: 2 })
const MIGRATION_ID_PATTERN = /^\d{3}-[a-z0-9-]+$/
const KNOWN_COLLECTIONS = new Set(Object.values(COLLECTIONS))

const validateRegistry = (migrations) => {
    if (!Array.isArray(migrations)) {
        throw new ToolError("el registro debe ser un array", "RegistryError")
    }
    const seen = new Set()
    migrations.forEach((migration) => {
        const id = migration?.id
        const fail = (reason) => {
            throw new ToolError(
                `migración ${
                    MIGRATION_ID_PATTERN.test(id) ? id : "(sin id)"
                }: ${reason}`,
                "RegistryError"
            )
        }
        if (!MIGRATION_ID_PATTERN.test(id)) fail("id inválido")
        if (seen.has(id)) fail("id repetido")
        if (typeof migration.title !== "string") fail("falta title")
        if (typeof migration.plan !== "function") fail("falta plan()")
        if (!Array.isArray(migration.dependsOn)) fail("falta dependsOn")
        migration.dependsOn.forEach((dependency) => {
            if (!seen.has(dependency)) {
                fail(
                    `depende de ${dependency}, que no está antes en el registro`
                )
            }
        })
        if (
            !Array.isArray(migration.collections) ||
            !migration.collections.length ||
            migration.collections.some((name) => !KNOWN_COLLECTIONS.has(name))
        ) {
            fail("collections inválidas")
        }
        seen.add(id)
    })
}

// `all` = todo el registro; un id = sus dependencias transitivas + él.
const selectMigrations = (migrations, target) => {
    if (target === "all") {
        return migrations.map((migration) => ({ migration, role: "target" }))
    }

    const byId = new Map(
        migrations.map((migration) => [migration.id, migration])
    )
    if (!byId.has(target)) {
        throw new ToolError(`migración desconocida: ${target}`, "ArgsError")
    }

    const needed = new Set()
    const visit = (id) => {
        if (needed.has(id)) return
        needed.add(id)
        byId.get(id).dependsOn.forEach(visit)
    }
    visit(target)

    return migrations
        .filter((migration) => needed.has(migration.id))
        .map((migration) => ({
            migration,
            role: migration.id === target ? "target" : "dependency",
        }))
}

const assertValidChecks = (id, checks) => {
    if (checks === undefined) return
    if (
        !Array.isArray(checks) ||
        checks.some(
            (check) =>
                typeof check?.name !== "string" || typeof check.ok !== "boolean"
        )
    ) {
        throw new ToolError(
            `${id}: report.checks debe ser [{ name, ok: boolean, detail }]`,
            "PlanError"
        )
    }
}

/*
 * Corre los planes en orden. Con `simulate`, cada plan ve el snapshot con las
 * ops de los anteriores aplicadas en memoria (dry-run). Sin `simulate`
 * (apply), todos ven el estado real de la base.
 */
const runPlans = ({ selection, snapshot, simulate, context }) => {
    let current = snapshot
    const results = []
    const previous = {}

    selection.forEach(({ migration, role }) => {
        const planned = migration.plan(cloneSnapshot(current), {
            ...context,
            results: { ...previous },
        })
        if (!planned || !Array.isArray(planned.ops)) {
            throw new ToolError(
                `${migration.id}: plan() debe devolver { ops, report }`,
                "PlanError"
            )
        }
        const report = planned.report || {}
        assertValidOps(planned.ops, {
            allowedCollections: migration.collections,
        })
        assertValidChecks(migration.id, report.checks)

        const simulated = applyOpsInMemory(current, planned.ops)
        if (simulate) current = simulated

        results.push({
            id: migration.id,
            title: migration.title,
            dependsOn: migration.dependsOn,
            role,
            ops: planned.ops,
            report,
        })
        previous[migration.id] = { ops: planned.ops, report }
    })

    return { results, snapshot: current }
}

// D9: una dependencia con cambios pendientes tiene que figurar como aplicada.
const dependencyChecks = async (readOnlyDb, results) => {
    const checks = []
    for (const result of results.filter((item) => item.role === "dependency")) {
        if (!result.ops.length) {
            checks.push({
                name: `dependencia ${result.id} sin cambios pendientes`,
                ok: true,
                detail: "",
            })
            continue
        }
        const registered = await readOnlyDb
            .collection(REGISTRY_COLLECTION)
            .find(
                { migrationId: result.id, kind: "apply" },
                { projection: { _id: 1 }, limit: 1 }
            )
            .toArray()
        checks.push({
            name: `dependencia ${result.id} aplicada`,
            ok: registered.length > 0,
            detail: registered.length
                ? ""
                : `tiene ${result.ops.length} cambios pendientes y no figura en ${REGISTRY_COLLECTION}`,
        })
    }
    return checks
}

const readBeforeFile = (file) => {
    let text
    try {
        text = fs.readFileSync(file, "utf8")
    } catch (error) {
        throw new ToolError(
            `no se pudo leer el before-file (${error.code || error.name})`,
            "RollbackError"
        )
    }
    let document
    let strict
    try {
        document = deserialize(text)
        strict = deserializeStrict(text)
    } catch (error) {
        throw new ToolError(
            "el before-file no es EJSON válido",
            "RollbackError"
        )
    }
    // Los documentos completos de los deletes se re-insertan con sus tipos
    // BSON originales (int vs double incluidos).
    if (Array.isArray(document?.entries)) {
        document.entries.forEach((entry, index) => {
            if (entry?.kind === DELETE_KIND) {
                entry.document = strict.entries[index].document
            }
        })
    }
    assertBeforeDocument(document)
    return document
}

const rollbackResult = (beforeDocument, evaluation) => ({
    id: beforeDocument.migrationId,
    title: `rollback de ${beforeDocument.runId}`,
    dependsOn: [],
    role: "rollback",
    ops: evaluation.restorable,
    report: {
        summary: {
            entries: evaluation.ops.length,
            restorable: evaluation.restorable.length,
            skipped: evaluation.skipped.length,
        },
        checks: [{ name: "before-file de esta base", ok: true, detail: "" }],
        needsConfirmation: evaluation.skipped.length
            ? [
                  {
                      kind: "rollbackSkipped",
                      ids: evaluation.skipped.map((op) => String(op._id)),
                      detail: "ya no tienen los valores de after (editados después del apply)",
                      suggestion: "revisar a mano; el rollback no los toca",
                  },
              ]
            : [],
    },
})

const main = async ({
    argv = process.argv.slice(2),
    connect = (options) => require("./lib/connect").connect(options),
    log = console.log,
    logError = console.error,
    migrations = require("./index"),
    now = () => new Date(),
} = {}) => {
    let args
    try {
        args = parseArgs(argv)
    } catch (error) {
        logError(describeError(error))
        log(USAGE)
        return EXIT.ERROR
    }

    if (args.help) {
        log(USAGE)
        return EXIT.OK
    }

    let connection
    try {
        // Todo lo que se puede validar sin base, antes de conectar.
        validateRegistry(migrations)
        const selection = args.rollbackFile
            ? []
            : selectMigrations(migrations, args.target)
        const beforeDocument = args.rollbackFile
            ? readBeforeFile(args.rollbackFile)
            : null

        connection = await connect({ uriEnv: args.uriEnv })
        const databaseName = connection.db.databaseName
        const mode = resolveMode({ args, databaseName })
        const target = {
            database: databaseName,
            environment: environmentCategory(),
            uriEnv: args.uriEnv,
            isTestDatabase: isTestDatabaseName(databaseName),
        }
        const startedAt = now()
        const runId = startedAt.toISOString().replace(/[:.]/g, "-")
        const readOnlyDb = createReadOnlyDb(connection.db)
        const snapshot = await loadSnapshot(readOnlyDb)
        const reportBase = {
            mode,
            runId,
            generatedAt: startedAt.toISOString(),
            target,
            snapshotCounts: snapshotCounts(snapshot),
            sample: args.sample,
        }
        const publish = (report) => {
            const file = writeReport(args.outDir, runId, report)
            printSummary(report, log, { sample: args.sample })
            log(`reporte: ${file}`)
        }

        if (beforeDocument) {
            if (beforeDocument.database !== databaseName) {
                throw new ToolError(
                    `el before-file es de la base ${beforeDocument.database}, no de ${databaseName}`,
                    "RollbackError"
                )
            }
            const evaluation = evaluateRollback(snapshot, beforeDocument)
            const report = buildReport({
                ...reportBase,
                selection: { rollbackOf: beforeDocument.migrationId },
                results: [rollbackResult(beforeDocument, evaluation)],
            })
            publish(report)

            if (mode !== "rollback-apply") return EXIT.OK

            const { applyRollback } = require("./lib/apply")
            const result = await applyRollback({
                db: connection.db,
                beforeDocument,
                beforeFile: args.rollbackFile,
                runId,
                now,
            })
            log(
                `rollback aplicado: ${result.restored} restaurados, ${result.skipped.length} salteados`
            )
            result.skipped.forEach((entry) =>
                log(`  salteado ${entry.collection}/${String(entry._id)}`)
            )
            return EXIT.OK
        }

        const { results } = runPlans({
            selection,
            snapshot,
            simulate: mode === "dry-run",
            context: {
                mode,
                sample: args.sample,
                database: databaseName,
                isTestDatabase: target.isTestDatabase,
            },
        })

        if (mode === "apply") {
            const targetResult = results.find((item) => item.role === "target")
            targetResult.report = {
                ...targetResult.report,
                checks: [
                    ...(targetResult.report.checks || []),
                    ...(await dependencyChecks(readOnlyDb, results)),
                ],
            }
        }

        const report = buildReport({
            ...reportBase,
            selection: { target: args.target },
            results,
        })
        publish(report)

        if (report.blocked) {
            if (mode === "apply") log("no se aplica nada: hay checks fallidos")
            return EXIT.BLOCKED
        }
        if (mode !== "apply") return EXIT.OK

        const targetResult = results.find((item) => item.role === "target")
        if (!targetResult.ops.length) {
            log("sin cambios pendientes: no se escribe nada")
            return EXIT.OK
        }

        const { applyMigration } = require("./lib/apply")
        const migrationReport = report.migrations.find(
            (item) => item.id === targetResult.id
        )
        const result = await applyMigration({
            db: connection.db,
            migrationId: targetResult.id,
            runId,
            ops: targetResult.ops,
            outDir: args.outDir,
            counts: migrationReport.counts,
            now,
        })
        log(`before-file: ${result.beforeFile}`)
        log(
            `aplicado ${targetResult.id}: ${result.matched} matcheados, ${
                result.modified
            } modificados${
                result.deleted !== undefined
                    ? `, ${result.deleted} borrados de ${targetResult.ops.length}`
                    : ""
            }`
        )
        return EXIT.OK
    } catch (error) {
        logError(describeError(error))
        return EXIT.ERROR
    } finally {
        if (connection) {
            await connection
                .close()
                .catch((error) => logError(describeError(error)))
        }
    }
}

if (require.main === module) {
    main().then((code) => {
        process.exitCode = code
    })
}

module.exports = {
    EXIT,
    main,
    runPlans,
    selectMigrations,
    validateRegistry,
}

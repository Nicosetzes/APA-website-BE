/*
 * Reporte de una corrida (contrato en .agents/tasks/db-normalization-plan.md,
 * sección 7). Sólo ids, fechas, números y nombres de torneo: los nombres de
 * jugadores, emails, hashes y cualquier URI se redactan antes de escribir o
 * imprimir.
 */

const fs = require("node:fs")
const path = require("node:path")

const { serialize } = require("./ejson")
const { isPlainObject } = require("./memory")

const REPORT_VERSION = 1
const REDACTED = "[redactado]"
const SENSITIVE_KEYS = new Set(["email", "password", "nickname", "hash"])
const PLAYER_KEY = /^player/i
const URI_PATTERN = /mongodb(\+srv)?:\/\//i

const lastSegment = (key) => String(key).split(".").pop()

const isPlayerName = (key, parentKey) => {
    const segments = String(key).split(".")
    if (segments[segments.length - 1] !== "name") return false
    const owner =
        segments.length > 1
            ? segments[segments.length - 2]
            : lastSegment(parentKey)
    return PLAYER_KEY.test(owner)
}

const sanitize = (value, parentKey = "") => {
    if (typeof value === "string") {
        return URI_PATTERN.test(value) ? REDACTED : value
    }
    if (Array.isArray(value)) {
        return value.map((item) => sanitize(item, parentKey))
    }
    if (!isPlainObject(value)) return value

    return Object.fromEntries(
        Object.entries(value).map(([key, nested]) => {
            if (SENSITIVE_KEYS.has(lastSegment(key).toLowerCase())) {
                return [key, REDACTED]
            }
            if (isPlayerName(key, parentKey)) return [key, REDACTED]
            return [key, sanitize(nested, key)]
        })
    )
}

const countBy = (ops, keyOf) =>
    ops.reduce((counts, op) => {
        const key = keyOf(op)
        counts[key] = (counts[key] || 0) + 1
        return counts
    }, {})

const buildSamples = (ops, sample) => {
    const samples = {}
    ops.forEach((op) => {
        samples[op.group] = samples[op.group] || []
        if (samples[op.group].length >= sample) return
        samples[op.group].push({
            _id: op._id,
            collection: op.collection,
            before: op.before,
            after: op.after,
            rule: op.rule || op.group,
        })
    })
    return samples
}

const limitSamples = (samples, sample) =>
    Object.fromEntries(
        Object.entries(samples).map(([group, entries]) => [
            group,
            (Array.isArray(entries) ? entries : []).slice(0, sample),
        ])
    )

const buildMigrationReport = (
    { id, title, dependsOn = [], role, ops, report = {} },
    sample
) => ({
    id,
    title,
    role,
    dependsOn,
    counts: {
        ops: ops.length,
        byCollection: countBy(ops, (op) => op.collection),
        byGroup: countBy(ops, (op) => op.group),
    },
    summary: report.summary || {},
    byTournament: report.byTournament || [],
    checks: report.checks || [],
    needsConfirmation: report.needsConfirmation || [],
    // Informativas: ya decididas, no bloquean ni piden confirmación.
    notes: report.notes || [],
    templates: report.templates || {},
    evidence: report.evidence || {},
    samples: report.samples
        ? limitSamples(report.samples, sample)
        : buildSamples(ops, sample),
})

const failedChecks = (report) =>
    report.migrations.flatMap((migration) =>
        migration.checks
            .filter((check) => check.ok !== true)
            .map((check) => ({ migration: migration.id, ...check }))
    )

const buildReport = ({
    mode = "dry-run",
    runId,
    generatedAt,
    selection = {},
    target,
    snapshotCounts,
    results,
    sample = 5,
}) => {
    const migrations = results.map((result) =>
        buildMigrationReport(result, sample)
    )
    const report = sanitize({
        reportVersion: REPORT_VERSION,
        mode,
        readOnly: mode === "dry-run" || mode === "rollback-dry-run",
        generatedAt,
        runId,
        selection,
        target,
        snapshot: snapshotCounts,
        blocked: false,
        migrations,
    })
    report.blocked = failedChecks(report).length > 0
    return report
}

const reportFileName = (runId, report) => {
    const slug = report.selection?.target || report.selection?.rollbackOf
    return `${runId}-${slug || "run"}-${report.mode}.json`
}

const writeReport = (outDir, runId, report) => {
    fs.mkdirSync(outDir, { recursive: true })
    const file = path.join(outDir, reportFileName(runId, report))
    fs.writeFileSync(file, `${serialize(report, { relaxed: true })}\n`, {
        flag: "wx",
    })
    return file
}

const compact = (value) => serialize(value, { relaxed: true, space: 0 })

const printSummary = (report, log = console.log, { sample = 5 } = {}) => {
    const { target } = report
    log(
        `Migraciones: modo ${report.mode}${
            report.readOnly ? " (sólo lectura)" : ""
        }`
    )
    log(
        `  base: ${target.database}   entorno: ${
            target.environment
        }   variable: ${target.uriEnv}   base de pruebas: ${
            target.isTestDatabase ? "sí" : "no"
        }`
    )
    log(
        `  snapshot: ${report.snapshot.matches} partidos, ${report.snapshot.tournaments} torneos`
    )

    if (!report.migrations.length) log("  sin migraciones seleccionadas")

    report.migrations.forEach((migration) => {
        const byCollection = Object.entries(migration.counts.byCollection)
            .map(([collection, count]) => `${collection}: ${count}`)
            .join(", ")
        log("")
        log(
            `[${migration.id}]${
                migration.role === "dependency" ? " (dependencia)" : ""
            } cambios: ${migration.counts.ops}${
                byCollection ? ` (${byCollection})` : ""
            }`
        )

        const byGroup = Object.entries(migration.counts.byGroup)
        if (byGroup.length) {
            log(
                `  por grupo: ${byGroup
                    .map(([group, count]) => `${group} ${count}`)
                    .join(", ")}`
            )
        }

        if (migration.byTournament.length) {
            log("  por torneo:")
            migration.byTournament.forEach((entry) =>
                log(
                    `    ${entry.name || "(sin nombre)"} [${
                        entry.tournamentId || "-"
                    }]: ${entry.toChange ?? 0}`
                )
            )
        }

        if (migration.checks.length) {
            log("  checks:")
            migration.checks.forEach((check) =>
                log(
                    `    ${check.ok === true ? "ok  " : "FAIL"} ${check.name}${
                        check.detail ? ` — ${check.detail}` : ""
                    }`
                )
            )
        }

        migration.needsConfirmation.forEach((item) =>
            log(
                `  a confirmar: ${item.kind} (${
                    Array.isArray(item.ids) ? item.ids.length : 0
                } ids)${item.detail ? ` — ${item.detail}` : ""}`
            )
        )

        migration.notes.forEach((item) =>
            log(
                `  nota: ${item.kind} (${
                    Array.isArray(item.ids) ? item.ids.length : 0
                } ids)${item.detail ? ` — ${item.detail}` : ""}`
            )
        )

        Object.entries(migration.samples).forEach(([group, entries]) => {
            if (!entries.length) return
            log(`  ejemplos ${group}:`)
            entries
                .slice(0, sample)
                .forEach((entry) =>
                    log(
                        `    ${String(entry._id)} ${compact(
                            entry.before
                        )} -> ${compact(entry.after)}${
                            entry.rule ? ` (${entry.rule})` : ""
                        }`
                    )
                )
        })
    })

    const failed = failedChecks(report)
    log("")
    log(
        report.blocked
            ? `resultado: BLOQUEADO (${failed.length} checks fallidos)`
            : "resultado: ok"
    )
}

module.exports = {
    REDACTED,
    REPORT_VERSION,
    buildReport,
    failedChecks,
    printSummary,
    reportFileName,
    sanitize,
    writeReport,
}

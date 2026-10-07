const { isTestDatabaseName } = require("../../../config/databaseSafety")
const { ToolError } = require("./errors")

// Mismo criterio que scripts/auditData.js: sólo se imprime la categoría.
const ENVIRONMENT_CATEGORIES = new Set([
    "production",
    "preview",
    "development",
    "test",
    "local",
])

const environmentCategory = () => {
    const environment =
        process.env.VERCEL_ENV || process.env.NODE_ENV || "local"
    return ENVIRONMENT_CATEGORIES.has(environment) ? environment : "other"
}

/*
 * Decide el modo antes de leer nada. Escribir en una base que no es de
 * pruebas (allowlist de config/databaseSafety) exige --allow-production.
 */
const resolveMode = ({ args, databaseName }) => {
    const mode = args.rollbackFile
        ? args.apply
            ? "rollback-apply"
            : "rollback-dry-run"
        : args.apply
        ? "apply"
        : "dry-run"

    if (
        args.apply &&
        !isTestDatabaseName(databaseName) &&
        !args.allowProduction
    ) {
        throw new ToolError(
            `--apply contra la base ${databaseName}, que no es de pruebas, requiere --allow-production`,
            "SafetyError"
        )
    }

    return mode
}

module.exports = { environmentCategory, isTestDatabaseName, resolveMode }

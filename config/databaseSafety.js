/*
 * Reglas para decidir si una base es de pruebas.
 *
 * Política de allowlist, no de blocklist: el nombre tiene que decir
 * explícitamente que es de pruebas. Un nombre desconocido se trata como
 * productivo, que es el default seguro.
 */

const TEST_DATABASE_NAME_PATTERN = /(^|[-_.])(dev|test|staging|qa)([-_.]|$)/i

const KNOWN_PRODUCTION_DATABASE_NAMES = ["myfirstdatabase"]

const isTestDatabaseName = (name) => {
    const normalized = String(name || "")
        .trim()
        .toLowerCase()

    if (!normalized) return false
    if (KNOWN_PRODUCTION_DATABASE_NAMES.includes(normalized)) return false

    return TEST_DATABASE_NAME_PATTERN.test(normalized)
}

/*
 * El server local se bloquea si apunta a una base que no es de pruebas, porque
 * navegar el FE contra el backend local escribe. En Vercel no aplica: ahí el
 * entorno productivo debe usar la base productiva.
 */
const shouldBlockLocalStart = ({
    databaseName,
    isManagedDeployment = false,
    allowProductionDatabase = false,
} = {}) => {
    if (isManagedDeployment) return false
    if (allowProductionDatabase) return false

    return !isTestDatabaseName(databaseName)
}

module.exports = {
    KNOWN_PRODUCTION_DATABASE_NAMES,
    TEST_DATABASE_NAME_PATTERN,
    isTestDatabaseName,
    shouldBlockLocalStart,
}

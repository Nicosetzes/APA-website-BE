/*
 * Scan de secretos sobre los archivos trackeados por git.
 *
 * Es un guardrail, no un reemplazo de un escáner dedicado: busca los formatos
 * concretos que este proyecto podría filtrar. Lo que sí garantiza es que un
 * `.env`, un URI de Mongo con credenciales o una clave privada no entren al
 * repositorio sin que CI avise.
 *
 * Los falsos positivos legítimos se declaran en ALLOWLIST con su motivo.
 */

const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const RULES = [
    {
        name: "mongo-uri-con-credenciales",
        pattern: /mongodb(\+srv)?:\/\/[^\s:@/]+:[^\s@/]+@/i,
    },
    {
        name: "cloudinary-url-con-secret",
        pattern: /cloudinary:\/\/\d+:[^\s@]+@/i,
    },
    {
        name: "clave-privada",
        pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
    },
    {
        name: "aws-access-key-id",
        pattern: /\bAKIA[0-9A-Z]{16}\b/,
    },
    {
        name: "hash-bcrypt",
        pattern: /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/,
    },
    {
        name: "jwt-emitido",
        pattern:
            /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    },
    {
        name: "variable-sensible-con-valor",
        pattern:
            /\b(TOKEN_SECRET|CLOUDINARY_API_SECRET|CLOUDINARY_API_KEY|MONGO_URI|MONGO_PASS|MONGO_USER)\s*=\s*["']?[^\s"'$]{8,}/,
    },
]

const ALLOWLIST = [
    {
        file: "controller/postLogin/index.js",
        rule: "hash-bcrypt",
        reason: "hash descartable contra el que se compara cuando el usuario no existe, para no filtrar por tiempo",
    },
    {
        file: "test/testEnvironment.test.js",
        rule: "hash-bcrypt",
        reason: "hash sintético armado en el test para validar el modelo",
    },
    {
        file: "test/authorization.test.js",
        rule: "variable-sensible-con-valor",
        reason: "el test setea un TOKEN_SECRET ficticio para firmar tokens y lo restaura al terminar",
    },
    {
        file: "scripts/scanSecrets.js",
        rule: "*",
        reason: "este archivo contiene los patrones de búsqueda",
    },
    {
        file: "test/scanSecrets.test.js",
        rule: "*",
        reason: "los casos de prueba del scanner son secretos sintéticos, necesarios para verificar que las reglas disparen",
    },
]

const SKIPPED_EXTENSIONS = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".ico",
    ".pdf",
    ".wav",
    ".mp3",
    ".woff",
    ".woff2",
])

const isAllowed = (file, rule) =>
    ALLOWLIST.some(
        (entry) =>
            entry.file === file && (entry.rule === "*" || entry.rule === rule)
    )

/*
 * Los ejemplos de uso en comentarios y documentación no son secretos. Se
 * reconocen por los marcadores típicos de placeholder.
 */
const PLACEHOLDER_MARKERS = [
    "...",
    "<",
    "example",
    "changeme",
    "tu-",
    "xxx",
    "placeholder",
]

const looksLikePlaceholder = (line) => {
    const lowered = line.toLowerCase()
    return PLACEHOLDER_MARKERS.some((marker) => lowered.includes(marker))
}

const findMatches = (contents, file = "") => {
    const findings = []
    const lines = contents.split(/\r?\n/)

    for (const { name, pattern } of RULES) {
        if (isAllowed(file, name)) continue

        const index = lines.findIndex(
            (line) => pattern.test(line) && !looksLikePlaceholder(line)
        )

        if (index === -1) continue

        findings.push({ rule: name, line: index + 1 })
    }

    return findings
}

const listTrackedFiles = () =>
    execFileSync("git", ["ls-files"], {
        cwd: path.join(__dirname, ".."),
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
    })
        .split(/\r?\n/)
        .filter(Boolean)

const run = () => {
    const root = path.join(__dirname, "..")
    const tracked = listTrackedFiles()
    const findings = []
    let scanned = 0

    if (tracked.includes(".env")) {
        findings.push({
            file: ".env",
            rule: "archivo-de-entorno-trackeado",
            line: 0,
        })
    }

    for (const file of tracked) {
        if (SKIPPED_EXTENSIONS.has(path.extname(file).toLowerCase())) continue

        const absolute = path.join(root, file)
        if (!fs.existsSync(absolute)) continue

        scanned += 1
        const contents = fs.readFileSync(absolute, "utf8")

        for (const finding of findMatches(contents, file)) {
            findings.push({ file, ...finding })
        }
    }

    console.log(
        `archivos trackeados escaneados: ${scanned}   reglas: ${RULES.length}   excepciones declaradas: ${ALLOWLIST.length}`
    )

    if (findings.length) {
        console.error("\nposibles secretos encontrados:")
        for (const finding of findings) {
            console.error(
                `  ${finding.file}:${finding.line}  regla ${finding.rule}`
            )
        }
        console.error(
            "\nSi es un falso positivo, declaralo en ALLOWLIST de scripts/scanSecrets.js con su motivo."
        )
        process.exitCode = 1
        return
    }

    console.log("sin secretos detectados")
}

if (require.main === module) run()

module.exports = { ALLOWLIST, RULES, findMatches }

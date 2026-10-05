/*
 * Audit de dependencias con allowlist explícita.
 *
 * Sólo bloquea por lo que llega a producción: falla ante cualquier
 * vulnerabilidad high o critical en `dependencies` (npm audit --omit=dev) que
 * no esté declarada en `security/audit-allowlist.json`. Lo que vive únicamente
 * en `devDependencies` (nodemon, eslint, prettier y sus transitivas) no corre
 * en el servidor, así que se informa como aviso pero no rompe el build.
 *
 * Fuerza el registry https: con un registry en http plano `npm audit` no
 * funciona, y no queremos que la verificación falle en silencio.
 */

const { execSync } = require("node:child_process")
const path = require("node:path")

const allowlist = require("../security/audit-allowlist.json")

const BLOCKING_SEVERITIES = new Set(["high", "critical"])
const REGISTRY = "https://registry.npmjs.org/"

const runAudit = (extraArgs = "") => {
    // Comando estático: no interpola nada de afuera.
    const command =
        `npm audit --json --registry=${REGISTRY} ${extraArgs}`.trim()

    try {
        const output = execSync(command, {
            cwd: path.join(__dirname, ".."),
            encoding: "utf8",
            maxBuffer: 50 * 1024 * 1024,
            stdio: ["ignore", "pipe", "pipe"],
        })

        return JSON.parse(output)
    } catch (error) {
        // npm audit devuelve exit 1 cuando encuentra vulnerabilidades, con el
        // JSON igualmente en stdout.
        if (error.stdout) {
            try {
                return JSON.parse(error.stdout)
            } catch {
                /* cae al throw de abajo */
            }
        }

        throw new Error(
            `no se pudo ejecutar npm audit: ${error.message.split("\n")[0]}`
        )
    }
}

const highOrCritical = (report) =>
    Object.values(report.vulnerabilities || {}).filter((vulnerability) =>
        BLOCKING_SEVERITIES.has(vulnerability.severity)
    )

// Aviso no bloqueante: high/critical que sólo aparecen en devDependencies.
const reportDevOnly = (blocking) => {
    let devOnly
    try {
        const productionNames = new Set(blocking.map((v) => v.name))
        devOnly = highOrCritical(runAudit()).filter(
            (vulnerability) => !productionNames.has(vulnerability.name)
        )
    } catch (error) {
        console.log(`\n(no se pudo auditar devDependencies: ${error.message})`)
        return
    }

    if (!devOnly.length) return

    console.log(
        `\nAviso (no bloquea): ${
            devOnly.length
        } high/critical sólo en devDependencies: ${devOnly
            .map((vulnerability) => vulnerability.name)
            .join(", ")}`
    )
}

const run = () => {
    const report = runAudit("--omit=dev")
    const accepted = new Map(
        allowlist.aceptadas.map((entry) => [entry.paquete, entry])
    )

    const blocking = highOrCritical(report)

    const unexpected = blocking.filter(
        (vulnerability) => !accepted.has(vulnerability.name)
    )

    const stale = [...accepted.keys()].filter(
        (name) => !blocking.some((vulnerability) => vulnerability.name === name)
    )

    const totals = report.metadata?.vulnerabilities || {}
    console.log(
        `producción: ${totals.critical || 0} críticas, ${
            totals.high || 0
        } altas, ${totals.moderate || 0} moderadas, ${totals.low || 0} bajas`
    )
    console.log(
        `high/critical: ${blocking.length}   aceptadas: ${
            blocking.length - unexpected.length
        }   nuevas: ${unexpected.length}`
    )

    reportDevOnly(blocking)

    if (stale.length) {
        console.log(
            `\nEntradas de la allowlist que ya no hacen falta: ${stale.join(
                ", "
            )}`
        )
        console.log("Conviene retirarlas de security/audit-allowlist.json.")
    }

    if (unexpected.length) {
        console.error(
            "\nVulnerabilidades high/critical de producción no declaradas:"
        )
        for (const vulnerability of unexpected) {
            const fix =
                vulnerability.fixAvailable === true
                    ? "hay arreglo sin cambio mayor"
                    : vulnerability.fixAvailable?.name
                    ? `requiere ${vulnerability.fixAvailable.name}@${vulnerability.fixAvailable.version}`
                    : "sin arreglo disponible"

            console.error(
                `  ${vulnerability.severity.padEnd(
                    8
                )} ${vulnerability.name.padEnd(28)} ${fix}`
            )
        }
        console.error(
            "\nArreglalas, o declaralas en security/audit-allowlist.json con motivo y plan."
        )
        process.exitCode = 1
        return
    }

    console.log(
        "\nsin vulnerabilidades high/critical de producción fuera de la allowlist"
    )
}

run()

/*
 * Audit de dependencias con allowlist explícita.
 *
 * Falla ante cualquier vulnerabilidad high o critical que no esté declarada en
 * `security/audit-allowlist.json`. La idea es que lo conocido quede documentado
 * con motivo y plan, y que lo nuevo rompa el build en lugar de sumarse a un
 * número que nadie mira.
 *
 * Fuerza el registry https: con un registry en http plano `npm audit` no
 * funciona, y no queremos que la verificación falle en silencio.
 */

const { execSync } = require("node:child_process")
const path = require("node:path")

const allowlist = require("../security/audit-allowlist.json")

const BLOCKING_SEVERITIES = new Set(["high", "critical"])
const REGISTRY = "https://registry.npmjs.org/"

const runAudit = () => {
    // Comando estático: no interpola nada de afuera.
    const command = `npm audit --json --registry=${REGISTRY}`

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

const run = () => {
    const report = runAudit()
    const accepted = new Map(
        allowlist.aceptadas.map((entry) => [entry.paquete, entry])
    )

    const blocking = Object.values(report.vulnerabilities || {}).filter(
        (vulnerability) => BLOCKING_SEVERITIES.has(vulnerability.severity)
    )

    const unexpected = blocking.filter(
        (vulnerability) => !accepted.has(vulnerability.name)
    )

    const stale = [...accepted.keys()].filter(
        (name) => !blocking.some((vulnerability) => vulnerability.name === name)
    )

    const totals = report.metadata?.vulnerabilities || {}
    console.log(
        `vulnerabilidades: ${totals.critical || 0} críticas, ${
            totals.high || 0
        } altas, ${totals.moderate || 0} moderadas, ${totals.low || 0} bajas`
    )
    console.log(
        `high/critical: ${blocking.length}   aceptadas: ${
            blocking.length - unexpected.length
        }   nuevas: ${unexpected.length}`
    )

    if (stale.length) {
        console.log(
            `\nEntradas de la allowlist que ya no hacen falta: ${stale.join(
                ", "
            )}`
        )
        console.log("Conviene retirarlas de security/audit-allowlist.json.")
    }

    if (unexpected.length) {
        console.error("\nVulnerabilidades high/critical no declaradas:")
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

    console.log("\nsin vulnerabilidades high/critical fuera de la allowlist")
}

run()

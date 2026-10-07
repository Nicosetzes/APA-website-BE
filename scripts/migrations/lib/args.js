const path = require("node:path")

const { ToolError } = require("./errors")

const DEFAULT_URI_ENV = "MONGO_URI"
const URI_ENV_PATTERN = /^MONGO_URI(_[A-Z]+)?$/
const TARGET_PATTERN = /^(all|\d{3}-[a-z0-9-]+)$/
const DEFAULT_OUT_DIR = path.resolve(__dirname, "../../../.agents/migrations")
const DEFAULT_SAMPLE = 5
const MAX_SAMPLE = 50

const BOOLEAN_FLAGS = {
    "--apply": "apply",
    "--allow-production": "allowProduction",
    "--help": "help",
    "-h": "help",
}
const VALUE_FLAGS = {
    "--uri-env": "uriEnv",
    "--out-dir": "outDir",
    "--sample": "sample",
    "--rollback": "rollbackFile",
}

const USAGE = `Uso: node scripts/migrations/run.js <migración|all> [opciones]
     node scripts/migrations/run.js --rollback <archivo-before.json> [opciones]

Por defecto corre en dry-run (sólo lectura) y deja el reporte en .agents/migrations/.

Opciones:
  --uri-env <NOMBRE>    variable del .env con el URI (default ${DEFAULT_URI_ENV}; ej. MONGO_URI_PROD)
  --out-dir <ruta>      carpeta de reportes y before-files (default .agents/migrations)
  --sample <n>          diffs de ejemplo por grupo (default ${DEFAULT_SAMPLE})
  --rollback <archivo>  restaura un before-file (dry-run salvo que se agregue --apply)
  --apply               escribe en la base (una sola migración por vez)
  --allow-production    requerido junto a --apply en una base que no es de pruebas
  -h, --help            muestra esta ayuda

Exit code: 0 = ok, 2 = bloqueado (algún check falló), 1 = error.`

// Nunca se repite un valor recibido: podría ser un URI pegado por error.
const describeFlag = (token) =>
    /^--?[a-z][a-z-]*$/.test(token) ? token : "(flag inválido)"

const parseSample = (raw) => {
    const sample = Number(raw)
    if (!Number.isInteger(sample) || sample < 0 || sample > MAX_SAMPLE) {
        throw new ToolError(
            `--sample debe ser un entero entre 0 y ${MAX_SAMPLE}`,
            "ArgsError"
        )
    }
    return sample
}

const parseArgs = (argv = []) => {
    const args = {
        target: null,
        apply: false,
        allowProduction: false,
        uriEnv: DEFAULT_URI_ENV,
        outDir: DEFAULT_OUT_DIR,
        sample: DEFAULT_SAMPLE,
        rollbackFile: null,
        help: false,
    }
    const positionals = []

    for (let index = 0; index < argv.length; index += 1) {
        const token = String(argv[index])

        if (!token.startsWith("-")) {
            positionals.push(token)
            continue
        }

        const [flag, inlineValue] = token.includes("=")
            ? [
                  token.slice(0, token.indexOf("=")),
                  token.slice(token.indexOf("=") + 1),
              ]
            : [token, undefined]

        if (BOOLEAN_FLAGS[flag] && inlineValue === undefined) {
            args[BOOLEAN_FLAGS[flag]] = true
            continue
        }

        if (VALUE_FLAGS[flag]) {
            let value = inlineValue
            if (value === undefined) {
                index += 1
                value = argv[index]
            }
            if (value === undefined || value === "") {
                throw new ToolError(`${flag} requiere un valor`, "ArgsError")
            }
            args[VALUE_FLAGS[flag]] = String(value)
            continue
        }

        throw new ToolError(
            `flag desconocido: ${describeFlag(flag)}`,
            "ArgsError"
        )
    }

    if (!URI_ENV_PATTERN.test(args.uriEnv)) {
        throw new ToolError(
            "--uri-env debe ser el nombre de una variable MONGO_URI o MONGO_URI_<SUFIJO>",
            "ArgsError"
        )
    }

    args.sample = parseSample(args.sample)
    args.outDir = path.resolve(args.outDir)
    if (args.rollbackFile) args.rollbackFile = path.resolve(args.rollbackFile)

    if (args.help) return args

    if (positionals.length > 1) {
        throw new ToolError("se acepta un solo objetivo", "ArgsError")
    }

    const [target] = positionals

    if (args.rollbackFile) {
        if (target !== undefined) {
            throw new ToolError(
                "--rollback no acepta un objetivo: la migración sale del before-file",
                "ArgsError"
            )
        }
        return args
    }

    if (target === undefined) {
        throw new ToolError(
            "falta el objetivo: un id de migración o all",
            "ArgsError"
        )
    }
    if (!TARGET_PATTERN.test(target)) {
        throw new ToolError(
            "objetivo inválido: usar all o un id como 001-nombre",
            "ArgsError"
        )
    }
    if (args.apply && target === "all") {
        throw new ToolError(
            "--apply corre una sola migración por vez, no all",
            "ArgsError"
        )
    }

    args.target = target
    return args
}

module.exports = {
    DEFAULT_OUT_DIR,
    DEFAULT_SAMPLE,
    DEFAULT_URI_ENV,
    URI_ENV_PATTERN,
    USAGE,
    parseArgs,
}

/*
 * Lógica compartida de `scripts/recomputeRatings.js` y `scripts/verifyRatings.js`
 * (ratings persistidos, etapa 1). Las dependencias (conexión, lecturas,
 * escritura) se inyectan: así los caminos con `--apply` se prueban con fakes sin
 * tocar una base. Los scripts reales solo arman `createRuntime`.
 *
 * Nada acá requiere mongoose ni los modelos al cargarse: eso ocurre recién en
 * `createRuntime(...).connect()`, después de leer la variable de entorno.
 */
const { isTestDatabaseName } = require("../../config/databaseSafety")
const {
    checkRatingsDrift,
    diffAgainstStored,
    formatSummary,
    loadRatingsState,
    summarizeDiff,
} = require("../../service/ratingsStore")
const { URI_ENV_PATTERN } = require("../migrations/lib/args")
const { ToolError } = require("../migrations/lib/errors")

const DEFAULT_URI_ENV = "MONGO_URI"
const DEFAULT_SAMPLE = 5
const MAX_SAMPLE = 50

const USAGE_RECOMPUTE = `Uso: npm run recompute:ratings -- [opciones]
Recalcula los ratings con el motor de producción y los compara con las colecciones
player-ratings y rating-events. Por defecto es un DRY-RUN: no escribe nada.
Opciones:
  --uri-env <NOMBRE>    variable del .env con el URI (default ${DEFAULT_URI_ENV}; ej. MONGO_URI_PROD)
  --sample <n>          ids de ejemplo por grupo en el resumen (default ${DEFAULT_SAMPLE}, máx. ${MAX_SAMPLE})
  --apply               crea los índices y escribe el diff (solo en player-ratings y rating-events)
  --allow-production    requerido junto a --apply en una base que no es de pruebas
  -h, --help            muestra esta ayuda
Exit code: 0 = ok, 1 = error o diferencias que quedaron tras --apply.`

const USAGE_VERIFY = `Uso: npm run verify:ratings -- [opciones]
Compara los ratings persistidos (player-ratings y rating-events) con lo que calcula
hoy el motor. SOLO LEE: no escribe ni crea índices.
Opciones:
  --uri-env <NOMBRE>    variable del .env con el URI (default ${DEFAULT_URI_ENV}; ej. MONGO_URI_PROD)
  --sample <n>          ids de ejemplo por grupo en el resumen (default ${DEFAULT_SAMPLE}, máx. ${MAX_SAMPLE})
  -h, --help            muestra esta ayuda
Exit code: 0 = sincronizado, 1 = drift o error.`

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

const parseArgs = (argv = [], { mode } = {}) => {
    if (mode !== "recompute" && mode !== "verify") {
        throw new Error("parseArgs: mode debe ser recompute o verify")
    }
    const booleanFlags = { "--help": "help", "-h": "help" }
    if (mode === "recompute") {
        booleanFlags["--apply"] = "apply"
        booleanFlags["--allow-production"] = "allowProduction"
    }
    const valueFlags = { "--uri-env": "uriEnv", "--sample": "sample" }
    const args = {
        uriEnv: DEFAULT_URI_ENV,
        apply: false,
        allowProduction: false,
        sample: DEFAULT_SAMPLE,
        help: false,
    }
    for (let index = 0; index < argv.length; index += 1) {
        const token = String(argv[index])
        if (!token.startsWith("-")) {
            throw new ToolError(
                "no se aceptan argumentos posicionales",
                "ArgsError"
            )
        }
        const equals = token.indexOf("=")
        const flag = equals === -1 ? token : token.slice(0, equals)
        const inlineValue = equals === -1 ? undefined : token.slice(equals + 1)
        if (booleanFlags[flag] && inlineValue === undefined) {
            args[booleanFlags[flag]] = true
            continue
        }
        if (valueFlags[flag]) {
            let value = inlineValue
            if (value === undefined) {
                index += 1
                value = argv[index]
            }
            if (value === undefined || value === "") {
                throw new ToolError(`${flag} requiere un valor`, "ArgsError")
            }
            args[valueFlags[flag]] = String(value)
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
    if (args.allowProduction && !args.apply) {
        throw new ToolError(
            "--allow-production solo tiene sentido con --apply",
            "ArgsError"
        )
    }
    return args
}

// Escribir en una base que no es de pruebas exige --allow-production (misma
// regla y mismo mensaje que scripts/migrations/lib/safety.js).
const assertWriteAllowed = ({ apply, allowProduction, databaseName }) => {
    if (apply && !isTestDatabaseName(databaseName) && !allowProduction) {
        throw new ToolError(
            `--apply contra la base ${databaseName}, que no es de pruebas, requiere --allow-production`,
            "SafetyError"
        )
    }
}

// ToolError tiene mensaje propio y seguro; del resto solo el nombre (el mensaje
// de un error del driver puede traer la URI). Igual que scripts/evaluateDraws.js,
// un `Error` plano (propio del código) sí muestra su mensaje.
const describeFailure = (error) => {
    if (error && error.expose) return `${error.name}: ${error.message}`
    const name = (error && error.name) || "Error"
    return `error: ${name === "Error" ? error.message : name}`
}

const hasEnv = (deps, args) => {
    const value = deps.env?.[args.uriEnv]
    return typeof value === "string" && value.trim() !== ""
}

const reportState = (deps, state, sourceStats) => {
    deps.log(
        `Partidos leídos: ${state.matchCount}. Eventos: ${state.computed.events.length}. Jugadores: ${state.computed.players.length}.`
    )
    deps.log(
        `ratingVersion: ${
            state.ratingVersion
        }. Fingerprint: ${state.fingerprint.slice(0, 12)}`
    )
    const maxUpdatedAt = sourceStats.maxUpdatedAt
    deps.log(
        `Fuente: ratedMatches=${sourceStats.ratedMatches}, maxUpdatedAt=${
            maxUpdatedAt === null ? "null" : maxUpdatedAt.toISOString()
        }`
    )
}

const printSummary = (deps, diff, sample) => {
    for (const line of formatSummary(
        summarizeDiff(diff, { maxExamples: sample })
    )) {
        deps.log(`  ${line}`)
    }
}

const runRecompute = async (args, deps) => {
    if (args.help) {
        deps.log(USAGE_RECOMPUTE)
        return 0
    }
    if (!hasEnv(deps, args)) {
        deps.logError(`falta la variable de entorno ${args.uriEnv}`)
        return 1
    }
    let connected = false
    try {
        const { name } = await deps.connect()
        connected = true
        deps.log(`Base: ${name} (modo: ${args.apply ? "apply" : "dry-run"})`)
        assertWriteAllowed({
            apply: args.apply,
            allowProduction: args.allowProduction,
            databaseName: name,
        })
        // Orden de lecturas (stats antes que el historial): ver
        // `loadRatingsState` en service/ratingsStore/pipeline.js.
        const { sourceStats, state } = await loadRatingsState({
            loadSourceStats: deps.loadSourceStats,
            loadMatches: deps.loadMatches,
            now: deps.now,
        })
        reportState(deps, state, sourceStats)
        const { diff } = await diffAgainstStored(state, deps.findStored)
        deps.log("Diferencias contra lo guardado:")
        printSummary(deps, diff, args.sample)
        if (!args.apply) {
            deps.log(
                "dry-run: no se escribió nada. Usar --apply para persistir."
            )
            return 0
        }
        await deps.createIndexes()
        const result = await deps.applyDiff(diff)
        deps.log(
            `Aplicado: ${result.batches} llamadas a bulkWrite en player-ratings y rating-events.`
        )
        const { diff: diffAfter } = await diffAgainstStored(
            state,
            deps.findStored
        )
        deps.log("Diferencias después de aplicar:")
        printSummary(deps, diffAfter, args.sample)
        if (!summarizeDiff(diffAfter, { maxExamples: 0 }).inSync) {
            deps.logError("post-apply: quedaron diferencias")
            return 1
        }
        return 0
    } catch (error) {
        deps.logError(describeFailure(error))
        return 1
    } finally {
        if (connected) await deps.disconnect()
    }
}

const runVerify = async (args, deps) => {
    if (args.help) {
        deps.log(USAGE_VERIFY)
        return 0
    }
    if (!hasEnv(deps, args)) {
        deps.logError(`falta la variable de entorno ${args.uriEnv}`)
        return 1
    }
    let connected = false
    try {
        const { name } = await deps.connect()
        connected = true
        deps.log(`Base: ${name} (modo: solo lectura)`)
        // Mismo pipeline que en recompute (stats antes que el historial).
        const { sourceStats, state } = await loadRatingsState({
            loadSourceStats: deps.loadSourceStats,
            loadMatches: deps.loadMatches,
            now: deps.now,
        })
        reportState(deps, state, sourceStats)
        const stored = await deps.findStored(state.ratingVersion)
        const drift = checkRatingsDrift({
            computed: state.computed,
            stored,
            fingerprint: state.fingerprint,
        })
        deps.log("Diferencias contra lo guardado:")
        printSummary(deps, drift.diff, args.sample)
        if (drift.inSync) {
            deps.log("VERIFY: OK")
            return 0
        }
        for (const reason of drift.reasons) deps.log(`  - ${reason}`)
        deps.log(
            "VERIFY: DRIFT (corregir con npm run recompute:ratings -- --apply)"
        )
        return 1
    } catch (error) {
        deps.logError(describeFailure(error))
        return 1
    } finally {
        if (connected) await deps.disconnect()
    }
}

// Dependencias reales. No requiere nada al crearse: mongoose, la conexión y los
// modelos se cargan recién en `connect()` (y después de fijar autoIndex /
// autoCreate en falso), de modo que los caminos sin base nunca los tocan.
// Con `write: false` (verify) no existen `applyDiff` ni `createIndexes`.
const createRuntime = ({ uriEnv, env = process.env, write = false } = {}) => {
    const runtime = {
        env,
        log: (line) => console.log(line),
        logError: (line) => console.error(line),
        now: () => new Date(),
        connect: async () => {
            // `database.js` lee MONGO_URI; se copia la variable elegida.
            const uri = env[uriEnv]
            process.env.MONGO_URI = uri
            const mongoose = require("mongoose")
            mongoose.set("autoIndex", false)
            mongoose.set("autoCreate", false)
            const { connectMongo } = require("../../database")
            const connection = await connectMongo()
            return { name: connection.name }
        },
        disconnect: async () => {
            const { disconnectMongo } = require("../../database")
            await disconnectMongo()
        },
        loadSourceStats: async () =>
            require("../../dao/findRatingSourceStats")(),
        loadMatches: async () => require("../../dao/findRatingMatches")(),
        findStored: async (ratingVersion) =>
            require("../../dao/findStoredRatingDocuments")(ratingVersion),
    }
    if (write) {
        runtime.applyDiff = async (diff) =>
            require("../../dao/applyRatingDiff")(diff, {
                playersModel: require("../../dao/models/playerRatings"),
                eventsModel: require("../../dao/models/ratingEvents"),
            })
        runtime.createIndexes = async () => {
            const { assertAllowedModel } = require("../../dao/applyRatingDiff")
            const players = require("../../dao/models/playerRatings")
            const events = require("../../dao/models/ratingEvents")
            assertAllowedModel(players)
            assertAllowedModel(events)
            await events.createIndexes()
            await players.createIndexes()
        }
    }
    return runtime
}

const main = async (
    mode,
    argv = [],
    { env = process.env, runtimeFactory = createRuntime } = {}
) => {
    const usage = mode === "recompute" ? USAGE_RECOMPUTE : USAGE_VERIFY
    let args
    try {
        args = parseArgs(argv, { mode })
    } catch (error) {
        console.error(`error: ${error.message}`)
        console.error(usage)
        return 1
    }
    const runtime = runtimeFactory({
        uriEnv: args.uriEnv,
        env,
        write: mode === "recompute",
    })
    return mode === "recompute"
        ? runRecompute(args, runtime)
        : runVerify(args, runtime)
}

module.exports = {
    USAGE_RECOMPUTE,
    USAGE_VERIFY,
    assertWriteAllowed,
    createRuntime,
    main,
    parseArgs,
    runRecompute,
    runVerify,
}

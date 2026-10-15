"use strict"
const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const applyRatingDiff = require("../dao/applyRatingDiff")
const {
    USAGE_RECOMPUTE,
    USAGE_VERIFY,
    createRuntime,
    parseArgs,
    runRecompute,
    runVerify,
} = require("../scripts/lib/ratingsStoreCli")
const {
    computeRatingsState,
    keyOfEvent,
    keyOfPlayer,
} = require("../service/ratingsStore")
const { SOURCE_STATS, history } = require("./fixtures/ratingsStore")

const ROOT = path.join(__dirname, "..")
const URI = "mongodb+srv://usuario:secreto@cluster.example.mongodb.net/base"
const NOW = new Date("2026-02-01T00:00:00Z")
const clone = (value) => structuredClone(value)
const recomputeArgs = (argv = []) => parseArgs(argv, { mode: "recompute" })
const verifyArgs = (argv = []) => parseArgs(argv, { mode: "verify" })
const computed = () =>
    computeRatingsState(history(), { now: NOW, sourceStats: SOURCE_STATS })
        .computed
// Lo que dejó la etapa 1: los mismos documentos pero sin `source`.
const computedStage1 = () =>
    computeRatingsState(history(), { now: NOW }).computed
const EMPTY = { events: [], players: [] }

// Deps falsas: registran cada llamada y simulan la base con `store`.
const harness = ({ databaseName = "apa-dev", store = EMPTY, env } = {}) => {
    const calls = []
    const lines = []
    const errors = []
    const state = { store: clone(store) }
    const applyToStore = (diff) => {
        for (const [name, keyOf] of [
            ["events", keyOfEvent],
            ["players", keyOfPlayer],
        ]) {
            const map = new Map(state.store[name].map((d) => [keyOf(d), d]))
            for (const doc of diff[name].delete) map.delete(keyOf(doc))
            for (const doc of [...diff[name].insert, ...diff[name].update]) {
                map.set(keyOf(doc), clone(doc))
            }
            state.store[name] = [...map.values()]
        }
    }
    const deps = {
        env: env ?? { MONGO_URI: URI },
        log: (line) => lines.push(line),
        logError: (line) => errors.push(line),
        now: () => NOW,
        connect: async () => {
            calls.push("connect")
            return { name: databaseName }
        },
        disconnect: async () => {
            calls.push("disconnect")
        },
        loadSourceStats: async () => {
            calls.push("loadSourceStats")
            return clone(SOURCE_STATS)
        },
        loadMatches: async () => {
            calls.push("loadMatches")
            return history()
        },
        findStored: async () => {
            calls.push("findStored")
            return clone(state.store)
        },
        createIndexes: async () => {
            calls.push("createIndexes")
        },
        applyDiff: async (diff) => {
            calls.push("applyDiff")
            applyToStore(diff)
            return { batches: 2 }
        },
    }
    return { deps, calls, lines, errors, state }
}

test("parseArgs: defaults y variantes de --uri-env", () => {
    assert.deepEqual(recomputeArgs(), {
        uriEnv: "MONGO_URI",
        apply: false,
        allowProduction: false,
        sample: 5,
        help: false,
    })
    assert.equal(
        recomputeArgs(["--uri-env", "MONGO_URI_PROD"]).uriEnv,
        "MONGO_URI_PROD"
    )
    assert.equal(
        recomputeArgs(["--uri-env=MONGO_URI_PROD"]).uriEnv,
        "MONGO_URI_PROD"
    )
    assert.equal(recomputeArgs(["--apply"]).apply, true)
    assert.equal(
        recomputeArgs(["--apply", "--allow-production"]).allowProduction,
        true
    )
    assert.equal(recomputeArgs(["-h"]).help, true)
    assert.equal(verifyArgs(["--sample", "2"]).sample, 2)
})

test("parseArgs: entradas inválidas dan ArgsError sin repetir el valor recibido", () => {
    const secret = "mongodb://u:p@example.net"
    const invalid = [
        ["--uri-env"],
        ["--uri-env", "EVIL"],
        ["--uri-env", secret],
        ["--sample", "99"],
        ["--sample", "x"],
        ["--nope"],
        [`--${secret}`],
        ["posicional"],
        [secret],
        ["--allow-production"],
    ]
    for (const argv of invalid) {
        assert.throws(
            () => recomputeArgs(argv),
            (error) => {
                assert.equal(error.name, "ArgsError", argv.join(" "))
                assert.ok(!error.message.includes("u:p@h"))
                return true
            }
        )
    }
})

test("parseArgs: en verify --apply y --allow-production son flags desconocidos", () => {
    for (const flag of ["--apply", "--allow-production"]) {
        assert.throws(() => verifyArgs([flag]), /flag desconocido/)
    }
})

test("runRecompute sin variable de entorno: no conecta ni escribe", async () => {
    const { deps, calls, errors } = harness({ env: {} })
    const code = await runRecompute(recomputeArgs(["--apply"]), deps)
    assert.equal(code, 1)
    assert.deepEqual(calls, [])
    assert.deepEqual(errors, ["falta la variable de entorno MONGO_URI"])
})

test("runRecompute --help imprime el uso sin conectar", async () => {
    const { deps, calls, lines } = harness({ env: {} })
    assert.equal(await runRecompute(recomputeArgs(["--help"]), deps), 0)
    assert.deepEqual(lines, [USAGE_RECOMPUTE])
    assert.deepEqual(calls, [])
})

test("runRecompute en dry-run no escribe ni crea índices y no imprime la URI", async () => {
    const { deps, calls, lines, errors } = harness({ databaseName: "apa-prod" })
    const code = await runRecompute(recomputeArgs(), deps)
    assert.equal(code, 0)
    assert.deepEqual(calls, [
        "connect",
        "loadSourceStats",
        "loadMatches",
        "findStored",
        "disconnect",
    ])
    const output = [...lines, ...errors].join("\n")
    assert.ok(output.includes("Base: apa-prod (modo: dry-run)"))
    assert.ok(
        lines.includes(
            "Fuente: ratedMatches=7, maxUpdatedAt=2026-01-09T12:00:00.000Z"
        )
    )
    assert.ok(output.includes("eventos: +6 nuevos"))
    assert.ok(output.includes("dry-run: no se escribió nada"))
    for (const secret of ["secreto", "usuario", "mongodb"]) {
        assert.ok(!output.includes(secret), secret)
    }
})

test("runRecompute --apply sobre una base que no es de pruebas exige --allow-production", async () => {
    for (const databaseName of ["myfirstdatabase", "apa-prod"]) {
        const refused = harness({ databaseName })
        assert.equal(
            await runRecompute(recomputeArgs(["--apply"]), refused.deps),
            1
        )
        assert.match(
            refused.errors.join("\n"),
            /SafetyError: .*requiere --allow-production/
        )
        assert.ok(!refused.calls.includes("createIndexes"))
        assert.ok(!refused.calls.includes("applyDiff"))
        assert.ok(!refused.calls.includes("loadMatches"))
        assert.equal(refused.calls.at(-1), "disconnect")

        const allowed = harness({ databaseName })
        assert.equal(
            await runRecompute(
                recomputeArgs(["--apply", "--allow-production"]),
                allowed.deps
            ),
            0
        )
        assert.ok(allowed.calls.includes("applyDiff"))
    }
    const dev = harness({ databaseName: "apa-dev" })
    assert.equal(await runRecompute(recomputeArgs(["--apply"]), dev.deps), 0)
    assert.ok(dev.calls.includes("applyDiff"))
})

test("runRecompute --apply: orden exacto de llamadas y diff post-apply vacío", async () => {
    const { deps, calls, lines, state } = harness()
    assert.equal(await runRecompute(recomputeArgs(["--apply"]), deps), 0)
    assert.deepEqual(calls, [
        "connect",
        "loadSourceStats",
        "loadMatches",
        "findStored",
        "createIndexes",
        "applyDiff",
        "findStored",
        "disconnect",
    ])
    assert.equal(state.store.events.length, 6)
    assert.equal(state.store.players.length, 3)
    assert.equal(lines.at(-1), "  Sin diferencias")

    // Segunda corrida: ya está todo, el diff es vacío y sigue funcionando.
    const again = harness({ store: state.store })
    assert.equal(await runRecompute(recomputeArgs(["--apply"]), again.deps), 0)
    assert.ok(again.lines.includes("  Sin diferencias"))
})

test("runRecompute --apply: si tras aplicar quedan diferencias sale con 1", async () => {
    const { deps, calls, errors } = harness()
    deps.applyDiff = async () => {
        calls.push("applyDiff")
        return { batches: 0 }
    }
    assert.equal(await runRecompute(recomputeArgs(["--apply"]), deps), 1)
    assert.deepEqual(errors, ["post-apply: quedaron diferencias"])
    assert.equal(calls.at(-1), "disconnect")
})

test("runRecompute desconecta cuando algo lanza y no filtra el mensaje del driver", async () => {
    const { deps, calls, errors } = harness()
    deps.loadMatches = async () => {
        const error = new Error(`falló ${URI}`)
        error.name = "MongoServerSelectionError"
        throw error
    }
    assert.equal(await runRecompute(recomputeArgs(), deps), 1)
    assert.equal(calls.at(-1), "disconnect")
    assert.deepEqual(errors, ["error: MongoServerSelectionError"])
})

test("el applyRatingDiff real no puede tocar colecciones ajenas", async () => {
    const calls = []
    const model = (name) => ({
        collection: { name },
        bulkWrite: async () => calls.push(name),
        createIndexes: async () => calls.push(name),
    })
    const { deps, errors } = harness()
    deps.applyDiff = (diff) =>
        applyRatingDiff(diff, {
            playersModel: model("face-to-face"),
            eventsModel: model("rating-events"),
        })
    assert.equal(await runRecompute(recomputeArgs(["--apply"]), deps), 1)
    assert.match(
        errors.join("\n"),
        /solo puede escribir en player-ratings y rating-events/
    )
    assert.deepEqual(calls, [])
})

test("con --apply solo se usan bulkWrite/createIndexes/find sobre las dos colecciones nuevas", async () => {
    const used = []
    const model = (name) =>
        new Proxy(
            { collection: { name } },
            {
                get: (target, property) => {
                    if (property in target) return target[property]
                    used.push(`${name}.${String(property)}`)
                    return async () => {}
                },
            }
        )
    const { deps } = harness()
    deps.applyDiff = (diff) =>
        applyRatingDiff(diff, {
            playersModel: model("player-ratings"),
            eventsModel: model("rating-events"),
        })
    assert.equal(await runRecompute(recomputeArgs(["--apply"]), deps), 1)
    // Post-apply no coincide porque el fake no guarda nada; lo que importa es qué se invocó.
    assert.deepEqual([...new Set(used)].sort(), [
        "player-ratings.bulkWrite",
        "rating-events.bulkWrite",
    ])
})

test("runVerify: en sync da VERIFY: OK y exit 0", async () => {
    const { deps, calls, lines } = harness({ store: computed() })
    assert.equal(await runVerify(verifyArgs(), deps), 0)
    assert.equal(lines.at(-1), "VERIFY: OK")
    assert.deepEqual(calls, [
        "connect",
        "loadSourceStats",
        "loadMatches",
        "findStored",
        "disconnect",
    ])
})

test("runVerify y runRecompute: un fallo en loadSourceStats corta antes de leer el historial y desconecta", async () => {
    for (const run of [
        (deps) => runRecompute(recomputeArgs(), deps),
        (deps) => runVerify(verifyArgs(), deps),
    ]) {
        const { deps, calls, errors } = harness()
        deps.loadSourceStats = async () => {
            throw new Error("sin stats")
        }
        assert.equal(await run(deps), 1)
        assert.deepEqual(errors, ["error: sin stats"])
        assert.ok(!calls.includes("loadMatches"))
        assert.equal(calls.at(-1), "disconnect")
    }
})

test("store de la etapa 1 (jugadores sin source): verify da DRIFT con la razón y recompute --apply converge con updates de jugadores", async () => {
    const stage1 = computedStage1()
    assert.ok(stage1.players.every((player) => !("source" in player)))

    const verify = harness({ store: stage1 })
    assert.equal(await runVerify(verifyArgs(), verify.deps), 1)
    const output = verify.lines.join("\n")
    assert.ok(output.includes("3 jugadores sin source o con source distinto"))
    assert.ok(output.includes("jugadores: ~3 distintos"), output)
    assert.ok(output.includes("eventos: sin diferencias"), output)
    assert.equal(
        verify.lines.at(-1),
        "VERIFY: DRIFT (corregir con npm run recompute:ratings -- --apply)"
    )

    const recompute = harness({ store: stage1 })
    const applied = []
    const applyDiff = recompute.deps.applyDiff
    recompute.deps.applyDiff = async (diff) => {
        applied.push(diff)
        return applyDiff(diff)
    }
    assert.equal(
        await runRecompute(recomputeArgs(["--apply"]), recompute.deps),
        0
    )
    assert.equal(applied.length, 1)
    const [diff] = applied
    assert.equal(diff.players.update.length, 3)
    assert.ok(diff.players.update.every((player) => player.source))
    for (const section of [diff.events, diff.players]) {
        assert.equal(section.insert.length, 0)
        assert.equal(section.delete.length, 0)
    }
    assert.equal(diff.events.update.length, 0)
    assert.equal(recompute.lines.at(-1), "  Sin diferencias")

    // Con el store convergido, verify queda en sync.
    const again = harness({ store: recompute.state.store })
    assert.equal(await runVerify(verifyArgs(), again.deps), 0)
})

test("runVerify: cada tipo de drift da exit 1, razón y VERIFY: DRIFT", async () => {
    const scenarios = {
        "eventos faltantes": (store) => store.events.pop(),
        "eventos huérfanos": (store) =>
            store.events.push({
                ...clone(store.events[0]),
                matchId: "f".repeat(24),
            }),
        "eventos con valores distintos": (store) =>
            (store.events[0].delta += 1),
        "jugadores desincronizados": (store) => (store.players[0].rating += 1),
        "fingerprint distinto": (store) => {
            for (const doc of [...store.events, ...store.players]) {
                doc.fingerprint = "c".repeat(64)
            }
        },
        "no hay ratings persistidos": (store) => {
            store.events = []
            store.players = []
        },
    }
    for (const [reason, mutate] of Object.entries(scenarios)) {
        const store = clone(computed())
        mutate(store)
        const { deps, lines, calls } = harness({ store })
        assert.equal(await runVerify(verifyArgs(), deps), 1, reason)
        const output = lines.join("\n")
        assert.ok(output.includes(reason), reason)
        assert.equal(
            lines.at(-1),
            "VERIFY: DRIFT (corregir con npm run recompute:ratings -- --apply)"
        )
        assert.equal(calls.at(-1), "disconnect")
    }
})

test("runVerify: sin variable de entorno y --help no conectan", async () => {
    const missing = harness({ env: {} })
    assert.equal(await runVerify(verifyArgs(), missing.deps), 1)
    assert.deepEqual(missing.calls, [])
    assert.deepEqual(missing.errors, ["falta la variable de entorno MONGO_URI"])
    const help = harness({ env: {} })
    assert.equal(await runVerify(verifyArgs(["--help"]), help.deps), 0)
    assert.deepEqual(help.lines, [USAGE_VERIFY])
})

test("verify imprime el mismo resumen que recompute y su runtime no puede escribir", async () => {
    const recompute = harness()
    await runRecompute(recomputeArgs(), recompute.deps)
    const verify = harness()
    await runVerify(verifyArgs(), verify.deps)
    const summaryOf = (lines) =>
        lines.slice(
            lines.indexOf("Diferencias contra lo guardado:"),
            lines.indexOf("Diferencias contra lo guardado:") + 3
        )
    assert.deepEqual(summaryOf(verify.lines), summaryOf(recompute.lines))

    const readOnly = createRuntime({
        uriEnv: "MONGO_URI",
        env: {},
        write: false,
    })
    assert.equal("applyDiff" in readOnly, false)
    assert.equal("createIndexes" in readOnly, false)
    const writable = createRuntime({
        uriEnv: "MONGO_URI",
        env: {},
        write: true,
    })
    assert.equal(typeof writable.applyDiff, "function")
    assert.equal(typeof writable.createIndexes, "function")
    // runVerify nunca invoca escritura aunque se la den.
    const trap = harness({ store: computed() })
    trap.deps.applyDiff = trap.deps.createIndexes = async () => {
        throw new Error("verify no debe escribir")
    }
    assert.equal(await runVerify(verifyArgs(), trap.deps), 0)
})

// --- Procesos hijo: solo caminos sin base ---------------------------------

const runChild = (args, extraEnv = {}) => {
    const env = { ...process.env, ...extraEnv }
    delete env.MONGO_URI_NOPE
    return spawnSync(process.execPath, args, {
        cwd: ROOT,
        env,
        encoding: "utf8",
    })
}

test("scripts como proceso: --help, variable ausente y flags desconocidos", () => {
    for (const script of ["recomputeRatings.js", "verifyRatings.js"]) {
        const file = path.join("scripts", script)
        const help = runChild([file, "--help"])
        assert.equal(help.status, 0)
        assert.match(help.stdout, /Uso: npm run (recompute|verify):ratings/)

        const missing = runChild([file, "--uri-env", "MONGO_URI_NOPE"])
        assert.equal(missing.status, 1)
        assert.match(
            missing.stderr,
            /falta la variable de entorno MONGO_URI_NOPE/
        )

        const unknown = runChild([file, "--nope"])
        assert.equal(unknown.status, 1)
        assert.match(unknown.stderr, /flag desconocido: --nope/)
    }
    const verifyApply = runChild(["scripts/verifyRatings.js", "--apply"])
    assert.equal(verifyApply.status, 1)
    assert.match(verifyApply.stderr, /flag desconocido: --apply/)
})

test("los scripts no cargan mongoose al importarse", () => {
    const code = `
        require("./scripts/recomputeRatings.js")
        require("./scripts/verifyRatings.js")
        const loaded = Object.keys(require.cache).map((key) => key.replace(/\\\\/g, "/"))
        process.stdout.write(JSON.stringify({
            mongoose: loaded.some((key) => /node_modules\\/mongoose\\//.test(key)),
            models: loaded.some((key) => key.includes("/dao/models/")),
            database: loaded.some((key) => key.endsWith("/database.js")),
        }))
    `
    const result = runChild(["-e", code])
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), {
        mongoose: false,
        models: false,
        database: false,
    })
})

test("la app carga los modelos de lectura pero nunca el camino de escritura", () => {
    const code = `
        require("./dao")
        require("./service")
        const mongoose = require("mongoose")
        const loaded = Object.keys(require.cache).map((key) => key.replace(/\\\\/g, "/"))
        const has = (suffix) => loaded.some((key) => key.endsWith(suffix))
        const options = (name) => {
            const model = mongoose.models[name]
            return model && {
                autoIndex: model.schema.options.autoIndex,
                autoCreate: model.schema.options.autoCreate,
            }
        }
        process.stdout.write(JSON.stringify({
            models: {
                "player-ratings": options("player-ratings"),
                "rating-events": options("rating-events"),
            },
            notLoaded: [
                "dao/applyRatingDiff/index.js",
                "dao/findStoredRatingDocuments/index.js",
                "service/ratingsStore/buildRatingDocuments.js",
                "service/ratingsStore/diff.js",
                "service/ratingsStore/drift.js",
                "service/ratingsStore/summary.js",
                "service/ratingsStore/index.js",
            ].filter(has),
            scripts: loaded.filter((key) => key.includes("/scripts/")),
            loaded: [
                "service/ratingsStore/freshness.js",
                "service/ratingsStore/fingerprint.js",
            ].filter(has),
        }))
    `
    const result = runChild(["-e", code])
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), {
        models: {
            "player-ratings": { autoIndex: false, autoCreate: false },
            "rating-events": { autoIndex: false, autoCreate: false },
        },
        notLoaded: [],
        scripts: [],
        loaded: [
            "service/ratingsStore/freshness.js",
            "service/ratingsStore/fingerprint.js",
        ],
    })

    for (const file of ["dao/index.js", "service/index.js"]) {
        const source = fs.readFileSync(path.join(ROOT, file), "utf8")
        for (const word of ["applyRatingDiff", "findStoredRatingDocuments"]) {
            assert.ok(!source.includes(word), `${file} menciona ${word}`)
        }
    }
    const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8")
    assert.ok(!app.includes("ratingsStore"), "app.js menciona ratingsStore")
})

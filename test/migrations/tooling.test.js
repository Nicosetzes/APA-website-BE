const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const { ObjectId } = require("mongoose").mongo

const { parseArgs } = require("../../scripts/migrations/lib/args")
const {
    CLIENT_OPTIONS,
    connect,
} = require("../../scripts/migrations/lib/connect")
const {
    canonicalKey,
    deserialize,
    serialize,
} = require("../../scripts/migrations/lib/ejson")
const {
    ABSENT,
    applyOpsInMemory,
    describeUpdate,
} = require("../../scripts/migrations/lib/memory")
const {
    DEFAULT_MAX_TIME_MS,
    createReadOnlyDb,
} = require("../../scripts/migrations/lib/readOnlyDb")
const {
    REDACTED,
    buildReport,
    sanitize,
} = require("../../scripts/migrations/lib/report")
const {
    buildRollbackOps,
    evaluateRollback,
} = require("../../scripts/migrations/lib/rollback")
const { resolveMode } = require("../../scripts/migrations/lib/safety")
const {
    MATCH_PROJECTION,
    TOURNAMENT_PROJECTION,
} = require("../../scripts/migrations/lib/snapshot")
const { main } = require("../../scripts/migrations/run")

const BE_ROOT = path.resolve(__dirname, "../..")
const APPLY_MODULE = path.join(
    BE_ROOT,
    "scripts",
    "migrations",
    "lib",
    "apply.js"
)
const PLAYER_NAME = "ApodoQueNoDebeSalir"

const WRITE_METHODS = [
    "insertOne",
    "insertMany",
    "updateOne",
    "updateMany",
    "replaceOne",
    "deleteOne",
    "deleteMany",
    "bulkWrite",
    "findOneAndUpdate",
    "findOneAndReplace",
    "findOneAndDelete",
    "createIndex",
    "createIndexes",
    "dropIndex",
    "dropIndexes",
    "drop",
    "rename",
    "initializeOrderedBulkOp",
]

const isApplyLoaded = () =>
    Object.keys(require.cache).some(
        (file) => path.resolve(file) === APPLY_MODULE
    )

/*
 * Db espía: implementa lecturas sobre fixtures y registra cualquier llamada a
 * un método de escritura (a nivel colección y a nivel db).
 */
const createSpyDb = (databaseName, data = {}) => {
    const calls = []
    const recordWrite = (scope, method) => () => {
        calls.push({ scope, method, write: true })
        return Promise.resolve({})
    }
    const cursor = (documents) => ({
        toArray: async () => documents.map((document) => ({ ...document })),
        client: { db: () => ({}) },
    })
    const collection = (name) => {
        const target = {
            find: (filter, options) => {
                calls.push({ scope: name, method: "find", filter, options })
                return cursor(data[name] || [])
            },
            aggregate: (pipeline, options) => {
                calls.push({ scope: name, method: "aggregate", options })
                return cursor([])
            },
            countDocuments: async (filter, options) => {
                calls.push({ scope: name, method: "countDocuments", options })
                return (data[name] || []).length
            },
            listIndexes: (options) => {
                calls.push({ scope: name, method: "listIndexes", options })
                return cursor([])
            },
        }
        WRITE_METHODS.forEach((method) => {
            target[method] = recordWrite(name, method)
        })
        return target
    }

    return {
        calls,
        db: {
            databaseName,
            collection,
            dropDatabase: recordWrite("db", "dropDatabase"),
            createCollection: recordWrite("db", "createCollection"),
            command: recordWrite("db", "command"),
            admin: () => ({}),
        },
    }
}

const fixtures = () => {
    const tournamentId = new ObjectId("64697ac9d542ff4ada3038d3")
    return {
        tournamentId,
        data: {
            "face-to-face": [
                {
                    _id: new ObjectId("64697ac9d542ff4ada303900"),
                    tournament: { id: String(tournamentId), name: "Torneo A" },
                    played: true,
                    playerP1: { id: "p1", name: PLAYER_NAME },
                    playerP2: { id: "p2", name: "OtroApodo" },
                    teamP1: { id: "12" },
                    updatedAt: new Date("2023-05-20T10:00:00.000Z"),
                },
                {
                    _id: new ObjectId("64697ac9d542ff4ada303901"),
                    tournament: { id: String(tournamentId), name: "Torneo A" },
                    played: false,
                    playerP1: { id: "p1", name: PLAYER_NAME },
                    updatedAt: new Date("2023-05-21T10:00:00.000Z"),
                },
            ],
            tournaments: [
                { _id: tournamentId, name: "Torneo A", ongoing: false },
            ],
        },
    }
}

// Migración fake: propone playedAt = updatedAt en los jugados sin playedAt.
const fakePlayedAtMigration = {
    id: "001-fake-played-at",
    title: "fake",
    dependsOn: [],
    collections: ["face-to-face"],
    plan: (snapshot) => {
        const ops = snapshot.matches
            .filter((match) => match.played === true && !match.playedAt)
            .map((match) => {
                const update = {
                    $set: {
                        playedAt: match.updatedAt,
                        playedAtPrecision: "exact",
                    },
                }
                return {
                    collection: "face-to-face",
                    _id: match._id,
                    filter: {
                        _id: match._id,
                        played: true,
                        playedAt: { $exists: false },
                    },
                    update,
                    group: "default",
                    rule: "updatedAt",
                    ...describeUpdate(match, update),
                }
            })
        return {
            ops,
            report: {
                summary: {
                    scanned: snapshot.matches.length,
                    toChange: ops.length,
                },
                byTournament: [],
                checks: [{ name: "fake ok", ok: true, detail: "" }],
                needsConfirmation: [],
            },
        }
    },
}

// Depende de la anterior: sólo ve playedAt si el runner simuló sus ops.
const fakeDependentMigration = {
    id: "002-fake-dependent",
    title: "fake dependiente",
    dependsOn: ["001-fake-played-at"],
    collections: ["tournaments"],
    plan: (snapshot, context) => ({
        ops: [],
        report: {
            checks: [
                {
                    name: "ve la simulación de 001",
                    ok: snapshot.matches
                        .filter((match) => match.played)
                        .every((match) => match.playedAt instanceof Date),
                    detail: "",
                },
                {
                    name: "recibe resultados previos",
                    ok: Array.isArray(
                        context.results["001-fake-played-at"]?.ops
                    ),
                    detail: "",
                },
            ],
        },
    }),
}

const tempDir = (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apa-migrations-"))
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
    return dir
}

const collectLogs = () => {
    const lines = []
    return { lines, log: (line) => lines.push(String(line)) }
}

test("parseArgs: defaults de dry-run", () => {
    const args = parseArgs(["all"])
    assert.deepEqual(args, {
        target: "all",
        apply: false,
        allowProduction: false,
        uriEnv: "MONGO_URI",
        outDir: path.join(BE_ROOT, ".agents", "migrations"),
        sample: 5,
        rollbackFile: null,
        help: false,
    })
})

test("parseArgs: flags con valor separado o con =", () => {
    const args = parseArgs([
        "001-m2-played-at",
        "--uri-env",
        "MONGO_URI_PROD",
        "--sample=3",
        "--apply",
        "--allow-production",
    ])
    assert.equal(args.target, "001-m2-played-at")
    assert.equal(args.uriEnv, "MONGO_URI_PROD")
    assert.equal(args.sample, 3)
    assert.equal(args.apply, true)
    assert.equal(args.allowProduction, true)
    assert.equal(
        parseArgs(["all", "--uri-env=MONGO_URI_PROD"]).uriEnv,
        "MONGO_URI_PROD"
    )
    assert.equal(parseArgs(["--help"]).help, true)

    const rollback = parseArgs(["--rollback", "x-before.json"])
    assert.equal(rollback.target, null)
    assert.equal(rollback.rollbackFile, path.resolve("x-before.json"))
})

test("parseArgs: rechaza flags desconocidos y valores inválidos sin repetirlos", () => {
    const invalid = [
        ["all", "--force"],
        ["all", "--uri-env", "PATH"],
        ["all", "--uri-env", "MONGO_URI_prod"],
        ["all", "--sample", "-1"],
        ["all", "--sample", "abc"],
        ["all", "--uri-env"],
        [],
        ["all", "001-x"],
        ["--apply", "all"],
        ["no válido"],
        ["001-x", "--rollback", "before.json"],
    ]
    invalid.forEach((argv) =>
        assert.throws(
            () => parseArgs(argv),
            { name: "ArgsError" },
            argv.join(" ")
        )
    )

    const pasted = "mongodb+srv://example:example@example.net/db"
    for (const argv of [
        ["all", "--uri-env", pasted],
        [pasted],
        ["all", `--${pasted}`],
    ]) {
        assert.throws(
            () => parseArgs(argv),
            (error) =>
                error.name === "ArgsError" && !error.message.includes("example")
        )
    }
})

test("resolveMode: dry-run por defecto y gate de --allow-production", () => {
    const base = parseArgs(["001-x"])
    assert.equal(
        resolveMode({ args: base, databaseName: "myFirstDatabase" }),
        "dry-run"
    )

    const apply = parseArgs(["001-x", "--apply"])
    assert.throws(
        () => resolveMode({ args: apply, databaseName: "myFirstDatabase" }),
        { name: "SafetyError" }
    )
    assert.throws(() => resolveMode({ args: apply, databaseName: "apa" }), {
        name: "SafetyError",
    })
    assert.equal(
        resolveMode({ args: apply, databaseName: "apa-staging" }),
        "apply"
    )
    assert.equal(
        resolveMode({
            args: parseArgs(["001-x", "--apply", "--allow-production"]),
            databaseName: "myFirstDatabase",
        }),
        "apply"
    )

    const rollback = parseArgs(["--rollback", "b.json"])
    assert.equal(
        resolveMode({ args: rollback, databaseName: "myFirstDatabase" }),
        "rollback-dry-run"
    )
    const rollbackApply = parseArgs(["--rollback", "b.json", "--apply"])
    assert.throws(
        () =>
            resolveMode({
                args: rollbackApply,
                databaseName: "myFirstDatabase",
            }),
        { name: "SafetyError" }
    )
    assert.equal(
        resolveMode({ args: rollbackApply, databaseName: "apa-staging" }),
        "rollback-apply"
    )
})

test("connect: opciones del client y nombre de variable validado antes de leer el .env", async () => {
    assert.deepEqual(CLIENT_OPTIONS, {
        readPreference: "secondaryPreferred",
        retryWrites: false,
        serverSelectionTimeoutMS: 15000,
        appName: "apa-migrations",
    })
    await assert.rejects(() => connect({ uriEnv: "PATH" }), {
        name: "ConnectionError",
    })
})

test("readOnlyDb: cualquier escritura lanza ReadOnlyViolation", () => {
    const spy = createSpyDb("myFirstDatabase")
    const db = createReadOnlyDb(spy.db)
    const collection = db.collection("face-to-face")

    WRITE_METHODS.forEach((method) =>
        assert.throws(
            () => collection[method],
            { name: "ReadOnlyViolation" },
            method
        )
    )
    ;["dropDatabase", "createCollection", "command", "admin", "client"].forEach(
        (property) =>
            assert.throws(
                () => db[property],
                { name: "ReadOnlyViolation" },
                property
            )
    )
    assert.throws(
        () => {
            collection.find = () => {}
        },
        { name: "ReadOnlyViolation" }
    )
    assert.throws(
        () => {
            db.collection = () => {}
        },
        { name: "ReadOnlyViolation" }
    )
    assert.throws(
        () => {
            delete collection.find
        },
        { name: "ReadOnlyViolation" }
    )

    assert.throws(() => collection.aggregate([{ $match: {} }, { $out: "x" }]), {
        name: "ReadOnlyViolation",
    })
    assert.throws(() => collection.aggregate([{ $merge: { into: "x" } }]), {
        name: "ReadOnlyViolation",
    })
    assert.throws(
        () =>
            collection.aggregate([
                { $facet: { a: [{ $merge: { into: "x" } }] } },
            ]),
        { name: "ReadOnlyViolation" }
    )

    assert.equal(spy.calls.filter((call) => call.write).length, 0)
})

test("readOnlyDb: lecturas con maxTimeMS y cursores sin acceso al client", async () => {
    const spy = createSpyDb("myFirstDatabase", { "face-to-face": [{ _id: 1 }] })
    const db = createReadOnlyDb(spy.db)
    const collection = db.collection("face-to-face")

    assert.equal(db.databaseName, "myFirstDatabase")
    const cursor = collection.find(
        {},
        { projection: { _id: 1 }, maxTimeMS: 999999 }
    )
    assert.deepEqual(Object.keys(cursor), ["toArray"])
    assert.equal(cursor.client, undefined)
    assert.deepEqual(await cursor.toArray(), [{ _id: 1 }])
    await collection.aggregate([{ $match: {} }]).toArray()
    assert.equal(await collection.countDocuments({}), 1)
    await collection.listIndexes().toArray()

    spy.calls.forEach((call) =>
        assert.equal(call.options.maxTimeMS, DEFAULT_MAX_TIME_MS, call.method)
    )
    assert.deepEqual(spy.calls[0].options.projection, { _id: 1 })
})

test("snapshot: proyecciones explícitas sin daily_recap ni datos de usuarios", () => {
    assert.equal(MATCH_PROJECTION["playerP1.name"], 1)
    assert.equal(MATCH_PROJECTION.playerP1, undefined)
    assert.equal(TOURNAMENT_PROJECTION.daily_recap, undefined)
    assert.equal(TOURNAMENT_PROJECTION.players, undefined)
    ;[MATCH_PROJECTION, TOURNAMENT_PROJECTION].forEach((projection) =>
        Object.keys(projection).forEach((field) =>
            assert.doesNotMatch(field, /email|password|nickname/)
        )
    )
})

test("main: --help no conecta", async () => {
    let connected = false
    const { lines, log } = collectLogs()
    const code = await main({
        argv: ["--help"],
        connect: async () => {
            connected = true
        },
        log,
        logError: log,
        migrations: [],
    })
    assert.equal(code, 0)
    assert.equal(connected, false)
    assert.match(lines.join("\n"), /Uso:/)
})

test("main: dry-run de all no escribe, simula dependencias y no carga lib/apply.js", async (t) => {
    const outDir = tempDir(t)
    const { data } = fixtures()
    const spy = createSpyDb("myFirstDatabase", data)
    let closed = false
    const { lines, log } = collectLogs()

    const code = await main({
        argv: ["all", "--uri-env", "MONGO_URI_PROD", "--out-dir", outDir],
        connect: async ({ uriEnv }) => {
            assert.equal(uriEnv, "MONGO_URI_PROD")
            return {
                db: spy.db,
                close: async () => {
                    closed = true
                },
            }
        },
        log,
        logError: log,
        migrations: [fakePlayedAtMigration, fakeDependentMigration],
        now: () => new Date("2026-01-02T03:04:05.678Z"),
    })

    assert.equal(code, 0, lines.join("\n"))
    assert.equal(closed, true)
    assert.equal(spy.calls.filter((call) => call.write).length, 0)
    assert.equal(isApplyLoaded(), false)

    const reads = spy.calls.filter((call) => call.method === "find")
    assert.deepEqual(reads.map((call) => call.scope).sort(), [
        "face-to-face",
        "tournaments",
    ])
    reads.forEach((call) => {
        assert.equal(call.options.maxTimeMS, DEFAULT_MAX_TIME_MS)
        assert.ok(call.options.projection)
    })

    const file = path.join(outDir, "2026-01-02T03-04-05-678Z-all-dry-run.json")
    const text = fs.readFileSync(file, "utf8")
    const report = deserialize(text)
    assert.equal(report.reportVersion, 1)
    assert.equal(report.mode, "dry-run")
    assert.equal(report.readOnly, true)
    assert.equal(report.blocked, false)
    assert.deepEqual(report.target, {
        database: "myFirstDatabase",
        environment: report.target.environment,
        uriEnv: "MONGO_URI_PROD",
        isTestDatabase: false,
    })
    assert.deepEqual(report.snapshot, { matches: 2, tournaments: 1 })
    assert.deepEqual(
        report.migrations.map((migration) => migration.id),
        ["001-fake-played-at", "002-fake-dependent"]
    )
    const [first, second] = report.migrations
    assert.deepEqual(first.counts, {
        ops: 1,
        byCollection: { "face-to-face": 1 },
        byGroup: { default: 1 },
    })
    assert.equal(first.samples.default.length, 1)
    assert.ok(first.samples.default[0].after.playedAt instanceof Date)
    assert.equal(first.samples.default[0].before.playedAt, ABSENT)
    assert.ok(
        second.checks.every((check) => check.ok),
        JSON.stringify(second.checks)
    )

    const output = `${text}\n${lines.join("\n")}`
    assert.doesNotMatch(output, new RegExp(PLAYER_NAME))
    assert.doesNotMatch(output, /mongodb(\+srv)?:\/\//)
    assert.match(lines.join("\n"), /base: myFirstDatabase/)
    assert.match(lines.join("\n"), /resultado: ok/)
})

test("main: un objetivo con dependencias las simula y las marca como dependency", async (t) => {
    const outDir = tempDir(t)
    const spy = createSpyDb("myFirstDatabase", fixtures().data)
    const { lines, log } = collectLogs()

    const code = await main({
        argv: ["002-fake-dependent", "--out-dir", outDir],
        connect: async () => ({ db: spy.db, close: async () => {} }),
        log,
        logError: log,
        migrations: [fakePlayedAtMigration, fakeDependentMigration],
        now: () => new Date("2026-01-02T03:04:05.678Z"),
    })

    assert.equal(code, 0, lines.join("\n"))
    const report = deserialize(
        fs.readFileSync(
            path.join(
                outDir,
                "2026-01-02T03-04-05-678Z-002-fake-dependent-dry-run.json"
            ),
            "utf8"
        )
    )
    assert.deepEqual(
        report.migrations.map((migration) => [migration.id, migration.role]),
        [
            ["001-fake-played-at", "dependency"],
            ["002-fake-dependent", "target"],
        ]
    )
    assert.equal(spy.calls.filter((call) => call.write).length, 0)
    assert.equal(isApplyLoaded(), false)
})

test("main: un check fallido sale con 2 (bloqueado)", async (t) => {
    const outDir = tempDir(t)
    const spy = createSpyDb("myFirstDatabase", fixtures().data)
    const { lines, log } = collectLogs()
    const failing = {
        ...fakeDependentMigration,
        id: "001-fake-failing",
        dependsOn: [],
        plan: () => ({
            ops: [],
            report: {
                checks: [{ name: "esperado", ok: false, detail: "roto" }],
            },
        }),
    }

    const code = await main({
        argv: ["all", "--out-dir", outDir],
        connect: async () => ({ db: spy.db, close: async () => {} }),
        log,
        logError: log,
        migrations: [failing],
    })

    assert.equal(code, 2)
    assert.match(lines.join("\n"), /FAIL esperado — roto/)
    assert.match(lines.join("\n"), /BLOQUEADO/)
})

test("main: --apply contra la base productiva sin --allow-production no lee ni escribe", async (t) => {
    const outDir = tempDir(t)
    const spy = createSpyDb("myFirstDatabase", fixtures().data)
    const { lines, log } = collectLogs()

    const code = await main({
        argv: ["001-fake-played-at", "--apply", "--out-dir", outDir],
        connect: async () => ({ db: spy.db, close: async () => {} }),
        log,
        logError: log,
        migrations: [fakePlayedAtMigration],
    })

    assert.equal(code, 1)
    assert.match(lines.join("\n"), /SafetyError/)
    assert.equal(spy.calls.length, 0)
    assert.equal(isApplyLoaded(), false)
    assert.deepEqual(fs.readdirSync(outDir), [])
})

test("main: errores sin exponer describen sólo name/code", async () => {
    const { lines, log } = collectLogs()
    const code = await main({
        argv: ["all"],
        connect: async () => {
            const error = new Error(
                "falló contra mongodb+srv://example:example@host-secreto"
            )
            error.name = "MongoServerSelectionError"
            error.code = 99
            throw error
        },
        log,
        logError: log,
        migrations: [],
    })
    assert.equal(code, 1)
    assert.equal(lines.join("\n"), "MongoServerSelectionError (código 99)")
})

test("main: una op inválida del plan es error (1) y no hay reporte", async (t) => {
    const outDir = tempDir(t)
    const spy = createSpyDb("myFirstDatabase", fixtures().data)
    const { lines, log } = collectLogs()
    const invalid = {
        ...fakePlayedAtMigration,
        plan: (snapshot) => ({
            ops: [
                {
                    collection: "face-to-face",
                    _id: snapshot.matches[0]._id,
                    filter: { _id: snapshot.matches[0]._id },
                    update: { $inc: { seriesRevision: 1 } },
                    group: "x",
                    before: {},
                    after: {},
                },
            ],
            report: {},
        }),
    }

    const code = await main({
        argv: ["all", "--out-dir", outDir],
        connect: async () => ({ db: spy.db, close: async () => {} }),
        log,
        logError: log,
        migrations: [invalid],
    })

    assert.equal(code, 1)
    assert.match(lines.join("\n"), /OpError/)
    assert.deepEqual(fs.readdirSync(outDir), [])
})

test("memoria: $set/$unset por dotted path sobre una copia", () => {
    const { data } = fixtures()
    const snapshot = {
        matches: data["face-to-face"],
        tournaments: data.tournaments,
    }
    const [match] = snapshot.matches
    const playedAt = new Date("2022-01-01T00:00:00.000Z")
    const update = {
        $set: { playedAt, "teamP1.id": 12, "outcome.teamThatWon.id": 12 },
        $unset: { updatedAt: "" },
    }
    const op = {
        collection: "face-to-face",
        _id: match._id,
        filter: { _id: match._id },
        update,
        group: "g",
        ...describeUpdate(match, update),
    }

    assert.deepEqual(op.before, {
        playedAt: ABSENT,
        "teamP1.id": "12",
        "outcome.teamThatWon.id": ABSENT,
        updatedAt: match.updatedAt,
    })
    assert.deepEqual(op.after, {
        playedAt,
        "teamP1.id": 12,
        "outcome.teamThatWon.id": 12,
        updatedAt: ABSENT,
    })

    const next = applyOpsInMemory(snapshot, [op])
    const changed = next.matches[0]
    assert.deepEqual(changed.playedAt, playedAt)
    assert.equal(changed.teamP1.id, 12)
    assert.equal(changed.outcome.teamThatWon.id, 12)
    assert.equal("updatedAt" in changed, false)
    assert.ok(changed._id instanceof ObjectId)

    assert.equal(match.teamP1.id, "12")
    assert.equal(match.playedAt, undefined)
    assert.ok(match.updatedAt instanceof Date)
    assert.notEqual(next.matches[1], snapshot.matches[1])
    assert.deepEqual(next.matches[1], snapshot.matches[1])
})

test("memoria: rechaza ops mal formadas", () => {
    const { data } = fixtures()
    const snapshot = {
        matches: data["face-to-face"],
        tournaments: data.tournaments,
    }
    const [match] = snapshot.matches
    const valid = () => {
        const update = { $set: { playedAt: new Date(0) } }
        return {
            collection: "face-to-face",
            _id: match._id,
            filter: { _id: match._id },
            update,
            group: "g",
            ...describeUpdate(match, update),
        }
    }

    assert.doesNotThrow(() => applyOpsInMemory(snapshot, [valid()]))
    const broken = [
        { ...valid(), collection: "users" },
        { ...valid(), filter: { _id: new ObjectId() } },
        { ...valid(), update: { $inc: { x: 1 } } },
        { ...valid(), after: { playedAt: new Date(1) } },
        { ...valid(), before: {} },
        { ...valid(), group: "" },
        { ...valid(), _id: new ObjectId(), filter: { _id: undefined } },
    ]
    broken.forEach((op, index) =>
        assert.throws(
            () => applyOpsInMemory(snapshot, [op]),
            { name: "OpError" },
            String(index)
        )
    )
    const missingId = new ObjectId()
    assert.throws(
        () =>
            applyOpsInMemory(snapshot, [
                { ...valid(), _id: missingId, filter: { _id: missingId } },
            ]),
        /no está en el snapshot/
    )
    assert.throws(
        () => applyOpsInMemory(snapshot, [valid(), valid()]),
        /mismo documento/
    )
})

test("rollback genérico: $set/$unset de before con filtro por after", () => {
    const first = new ObjectId("64697ac9d542ff4ada303900")
    const second = new ObjectId("64697ac9d542ff4ada303901")
    const playedAt = new Date("2022-01-01T00:00:00.000Z")
    const beforeDocument = {
        migrationId: "001-x",
        runId: "run",
        database: "apa-staging",
        entries: [
            {
                _id: first,
                collection: "face-to-face",
                before: { playedAt: ABSENT, playedAtPrecision: ABSENT },
                after: { playedAt, playedAtPrecision: "exact" },
            },
            {
                _id: second,
                collection: "face-to-face",
                before: {
                    "teamP1.id": "12",
                    tournament: { id: null, name: null },
                },
                after: { "teamP1.id": 12, tournament: null },
            },
        ],
    }

    const ops = buildRollbackOps(beforeDocument)
    assert.deepEqual(
        ops.map((op) => ({
            _id: op._id,
            filter: op.filter,
            update: op.update,
        })),
        [
            {
                _id: second,
                filter: { _id: second, "teamP1.id": 12, tournament: null },
                update: {
                    $set: {
                        "teamP1.id": "12",
                        tournament: { id: null, name: null },
                    },
                },
            },
            {
                _id: first,
                filter: { _id: first, playedAt, playedAtPrecision: "exact" },
                update: { $unset: { playedAt: "", playedAtPrecision: "" } },
            },
        ]
    )

    assert.throws(
        () =>
            buildRollbackOps({
                ...beforeDocument,
                entries: [
                    {
                        _id: first,
                        collection: "tournaments",
                        before: { ongoing: true },
                        after: { closedAt: ABSENT, ongoing: false },
                    },
                ],
            }),
        { name: "RollbackError" }
    )
    assert.throws(() => buildRollbackOps({ ...beforeDocument, database: "" }), {
        name: "RollbackError",
    })
})

test("rollback genérico: evalúa cuáles se saltean por ediciones posteriores", () => {
    const first = new ObjectId("64697ac9d542ff4ada303900")
    const second = new ObjectId("64697ac9d542ff4ada303901")
    const playedAt = new Date("2022-01-01T00:00:00.000Z")
    const entry = (_id) => ({
        _id,
        collection: "face-to-face",
        before: { playedAt: ABSENT },
        after: { playedAt },
    })
    const snapshot = {
        matches: [
            { _id: first, playedAt: new Date(playedAt.getTime()) },
            { _id: second, playedAt: new Date("2025-01-01T00:00:00.000Z") },
        ],
        tournaments: [],
    }

    const evaluation = evaluateRollback(snapshot, {
        migrationId: "001-x",
        runId: "run",
        database: "apa-staging",
        entries: [entry(first), entry(second), entry(new ObjectId())],
    })
    assert.deepEqual(
        evaluation.restorable.map((op) => String(op._id)),
        [String(first)]
    )
    assert.equal(evaluation.skipped.length, 2)
})

test("EJSON: round-trip conserva Date, ObjectId y number vs string", () => {
    const value = {
        _id: new ObjectId("64697ac9d542ff4ada3038d3"),
        playedAt: new Date("2019-07-09T10:00:00.000Z"),
        numeric: 12,
        text: "12",
        decimal: 1.5,
        nothing: null,
        absent: ABSENT,
        nested: [{ "teamP1.id": 49 }],
    }
    const text = serialize(value)
    assert.match(text, /\$numberInt/)
    assert.match(text, /\$oid/)
    assert.match(text, /\$date/)

    const back = deserialize(text)
    assert.ok(back._id instanceof ObjectId)
    assert.equal(String(back._id), String(value._id))
    assert.ok(back.playedAt instanceof Date)
    assert.equal(back.playedAt.getTime(), value.playedAt.getTime())
    assert.equal(back.numeric, 12)
    assert.equal(typeof back.numeric, "number")
    assert.equal(back.text, "12")
    assert.equal(back.decimal, 1.5)
    assert.equal(back.nothing, null)
    assert.equal(back.absent, ABSENT)
    assert.deepEqual(back.nested, [{ "teamP1.id": 49 }])
    assert.equal(canonicalKey(back), canonicalKey(value))
    assert.notEqual(canonicalKey({ id: 12 }), canonicalKey({ id: "12" }))
})

test("reporte: redacta nombres de jugadores, credenciales y URIs", () => {
    const clean = sanitize({
        name: "Torneo A",
        before: {
            outcome: { playerThatWon: { id: "p1", name: PLAYER_NAME } },
            "playerP1.name": PLAYER_NAME,
        },
        players: [{ id: "p1", name: PLAYER_NAME }],
        teams: [
            {
                team: { id: 1, name: "Club" },
                player: { id: "p1", name: PLAYER_NAME },
            },
        ],
        email: "x",
        detail: "mongodb+srv://example:example@example.net",
    })
    assert.equal(clean.name, "Torneo A")
    assert.equal(clean.teams[0].team.name, "Club")
    assert.equal(clean.before.outcome.playerThatWon.name, REDACTED)
    assert.equal(clean.before["playerP1.name"], REDACTED)
    assert.equal(clean.players[0].name, REDACTED)
    assert.equal(clean.teams[0].player.name, REDACTED)
    assert.equal(clean.email, REDACTED)
    assert.equal(clean.detail, REDACTED)

    const report = buildReport({
        runId: "r",
        generatedAt: "g",
        target: {},
        snapshotCounts: { matches: 0, tournaments: 0 },
        results: [
            {
                id: "001-x",
                title: "x",
                dependsOn: [],
                role: "target",
                ops: [],
                report: { checks: [{ name: "c", ok: false, detail: "" }] },
            },
        ],
    })
    assert.equal(report.blocked, true)
    assert.equal(report.readOnly, true)
})

test("main: dry-run de all con las migraciones reales sobre un snapshot fake", async (t) => {
    const registry = require("../../scripts/migrations")
    assert.deepEqual(
        registry.map((migration) => migration.id),
        [
            "001-m2-played-at",
            "002-m7-point-fixes",
            "003-m3-tournament-dates",
            "004-m4-types",
            "005-m8-delete-cancelled-unplayed",
        ]
    )
    // M8 (allowlist fija, no configurable) se prueba en m8DeleteCancelled.
    const [m2, m7, m3, m4] = registry
    const configured = [
        m2.createMigration({
            overrides: {
                version: 1,
                objectIdEra: {
                    allMatchesTournamentIds: [],
                    knockoutOnlyTournamentIds: [],
                },
                groups: [],
                manualMatchDates: [],
            },
        }),
        m7.createMigration({
            expectedOutcomeFixes: {},
            closeTournamentIds: [],
            linkByName: [],
        }),
        m3.createMigration({
            linkByName: [],
            overrides: { tournamentClosedAt: [] },
        }),
        m4.createMigration(),
    ]

    const run = async (migrations, now) => {
        const outDir = tempDir(t)
        const spy = createSpyDb("myFirstDatabase", fixtures().data)
        const { lines, log } = collectLogs()
        const code = await main({
            argv: ["all", "--uri-env", "MONGO_URI_PROD", "--out-dir", outDir],
            connect: async () => ({ db: spy.db, close: async () => {} }),
            log,
            logError: log,
            migrations,
            now: () => new Date(now),
        })
        const [file] = fs.readdirSync(outDir)
        const text = fs.readFileSync(path.join(outDir, file), "utf8")
        return { code, spy, lines, text, report: deserialize(text) }
    }

    const ok = await run(configured, "2026-01-02T03:04:05.678Z")
    assert.equal(ok.code, 0, ok.lines.join("\n"))
    assert.equal(ok.spy.calls.filter((call) => call.write).length, 0)
    assert.equal(isApplyLoaded(), false)
    assert.equal(ok.report.mode, "dry-run")
    assert.equal(ok.report.readOnly, true)
    assert.equal(ok.report.blocked, false)
    assert.deepEqual(
        ok.report.migrations.map((migration) => [
            migration.id,
            migration.counts.ops,
        ]),
        [
            ["001-m2-played-at", 1],
            ["002-m7-point-fixes", 0],
            ["003-m3-tournament-dates", 1],
            ["004-m4-types", 1],
        ]
    )
    ok.report.migrations.forEach((migration) => {
        ;[
            "summary",
            "byTournament",
            "checks",
            "needsConfirmation",
            "notes",
            "templates",
            "evidence",
            "samples",
        ].forEach((key) =>
            assert.ok(key in migration, `${migration.id}.${key}`)
        )
        assert.ok(migration.checks.length > 0, migration.id)
    })
    // M3 ve el playedAt simulado de M2.
    const m3Report = ok.report.migrations[2]
    assert.deepEqual(
        m3Report.samples["from-matches"][0].after.closedAt,
        new Date("2023-05-20T10:00:00.000Z")
    )
    assert.equal(ok.report.migrations[0].samples.default.length, 1)
    assert.doesNotMatch(
        `${ok.text}\n${ok.lines.join("\n")}`,
        new RegExp(PLAYER_NAME)
    )

    // Con los overrides de producción el snapshot fake queda bloqueado
    // (faltan los grupos), pero igual no escribe nada.
    const blocked = await run(registry, "2026-01-02T03:04:06.678Z")
    assert.equal(blocked.code, 2)
    assert.equal(blocked.report.blocked, true)
    assert.equal(blocked.spy.calls.filter((call) => call.write).length, 0)
    assert.equal(isApplyLoaded(), false)
})

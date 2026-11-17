/*
 * Ops `delete` e `insert` del tooling de migraciones, con migraciones y dbs
 * fake: validación, simulación en memoria, apply (before-file antes de
 * escribir) y rollback. Nunca una base real.
 */
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const { Double, ObjectId } = require("mongoose").mongo

const {
    canonicalKey,
    deserialize,
} = require("../../scripts/migrations/lib/ejson")
const {
    DELETE_KIND,
    INSERT_KIND,
    applyOpsInMemory,
    assertValidOp,
    assertValidOps,
    cloneSnapshot,
    cloneValue,
    getPath,
} = require("../../scripts/migrations/lib/memory")
const { evaluateRollback } = require("../../scripts/migrations/lib/rollback")
const { main } = require("../../scripts/migrations/run")

const MATCHES = "face-to-face"
const TOURNAMENTS = "tournaments"
const RUN_ID = "2026-01-02T03-04-05-678Z"
const NOW = new Date("2026-01-02T03:04:05.678Z")

let counter = 0
const nextId = () =>
    new ObjectId(`7000000000000000${(counter++).toString(16).padStart(8, "0")}`)

const match = (extra = {}) => ({
    _id: nextId(),
    tournament: { id: "695b007a9009908018bdc28f", name: "Torneo X" },
    type: "regular",
    played: false,
    playerP1: { id: "u1", name: "Jugador 1", avatar: "x.png" },
    playerP2: { id: "u2", name: "Jugador 2" },
    teamP1: { id: 10, name: "Equipo 10" },
    teamP2: { id: 20, name: "Equipo 20" },
    // Tipo BSON que el rollback de un delete tiene que conservar.
    weight: new Double(1),
    schemaVersion: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...extra,
})

const fixture = () => ({
    matches: [match(), match(), match({ played: true })],
    tournaments: [],
})

// Borra los partidos no jugados; el filtro re-afirma `played: false`.
const deleteMigration = {
    id: "001-fake-delete",
    title: "fake delete",
    dependsOn: [],
    collections: [MATCHES],
    plan: (snapshot) => ({
        ops: snapshot.matches
            .filter((item) => item.played === false)
            .map((item) => ({
                kind: DELETE_KIND,
                collection: MATCHES,
                _id: item._id,
                filter: { _id: item._id, played: false },
                group: "unplayed",
                before: cloneValue(item),
                after: null,
            })),
        report: { checks: [{ name: "ok", ok: true, detail: "" }] },
    }),
}

// Inserta un torneo y un partido con _id fijos; ya aplicada da 0 ops.
const TOURNAMENT_ID = new ObjectId("7100000000000000000000aa")
const INSERTED_MATCH_ID = new ObjectId("7100000000000000000000ab")
const insertMigration = {
    id: "002-fake-insert",
    title: "fake insert",
    dependsOn: [],
    collections: [TOURNAMENTS, MATCHES],
    plan: (snapshot, context) => {
        const documents = [
            [
                TOURNAMENTS,
                {
                    _id: TOURNAMENT_ID,
                    name: "Torneo nuevo",
                    updatedAt: context.now,
                },
            ],
            [
                MATCHES,
                match({
                    _id: INSERTED_MATCH_ID,
                    played: true,
                    updatedAt: context.now,
                }),
            ],
        ]
        const exists = (collection, id) =>
            snapshot[collection === MATCHES ? "matches" : "tournaments"].some(
                (item) => canonicalKey(item._id) === canonicalKey(id)
            )
        return {
            ops: documents
                .filter(
                    ([collection, document]) =>
                        !exists(collection, document._id)
                )
                .map(([collection, document]) => ({
                    kind: INSERT_KIND,
                    collection,
                    _id: document._id,
                    filter: { _id: document._id },
                    document,
                    group: "new",
                    before: null,
                    after: cloneValue(document),
                })),
            report: { checks: [{ name: "ok", ok: true, detail: "" }] },
        }
    },
}

// Evaluador mínimo de los filtros que usan apply/rollback.
const matchesFilter = (document, filter) =>
    Object.entries(filter).every(([key, value]) => {
        if (key === "$or") return value.some((f) => matchesFilter(document, f))
        return canonicalKey(getPath(document, key)) === canonicalKey(value)
    })

const createFakeDb = (databaseName, data, { outDir } = {}) => {
    const store = {
        [MATCHES]: [...data.matches],
        [TOURNAMENTS]: [...data.tournaments],
        migrations: [],
    }
    const writes = []
    const beforeFileExists = () =>
        Boolean(outDir) &&
        fs.existsSync(outDir) &&
        fs.readdirSync(outDir).some((file) => file.endsWith("-before.json"))
    const removeOne = (name, filter) => {
        const index = store[name].findIndex((document) =>
            matchesFilter(document, filter)
        )
        if (index < 0) return 0
        store[name].splice(index, 1)
        return 1
    }
    const insert = (name, document) => {
        if (
            document._id !== undefined &&
            store[name].some(
                (item) => canonicalKey(item._id) === canonicalKey(document._id)
            )
        ) {
            const error = new Error("duplicate")
            error.code = 11000
            throw error
        }
        store[name].push(document)
    }
    const collection = (name) => ({
        find: (filter = {}, options = {}) => ({
            toArray: async () => {
                const found = store[name].filter((document) =>
                    matchesFilter(document, filter)
                )
                return options.limit ? found.slice(0, options.limit) : found
            },
        }),
        bulkWrite: async (operations, options) => {
            writes.push({
                name,
                method: "bulkWrite",
                operations,
                options,
                beforeFile: beforeFileExists(),
            })
            let deletedCount = 0
            let insertedCount = 0
            operations.forEach(({ deleteOne, insertOne }) => {
                if (deleteOne) deletedCount += removeOne(name, deleteOne.filter)
                if (insertOne) {
                    insert(name, insertOne.document)
                    insertedCount += 1
                }
            })
            return {
                matchedCount: 0,
                modifiedCount: 0,
                deletedCount,
                insertedCount,
            }
        },
        insertOne: async (document) => {
            writes.push({ name, method: "insertOne", document })
            insert(name, document)
            return {}
        },
        deleteOne: async (filter) => {
            writes.push({ name, method: "deleteOne", filter })
            return { deletedCount: removeOne(name, filter) }
        },
    })
    return { store, writes, db: { databaseName, collection } }
}

const tempDir = (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apa-op-kinds-"))
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
    return dir
}

// Cada corrida con su runId (los reportes se escriben con flag wx).
let runs = 0
const runMain = (argv, db, migrations) => {
    const lines = []
    const startedAt = new Date(NOW.getTime() + runs * 1000)
    runs += 1
    return main({
        argv,
        connect: async () => ({ db, close: async () => {} }),
        log: (line) => lines.push(line),
        logError: (line) => lines.push(line),
        migrations,
        now: () => startedAt,
    }).then((code) => ({ code, lines }))
}

const beforeFileOf = (outDir, migrationId) => {
    const files = fs
        .readdirSync(outDir)
        .filter((file) => file.endsWith(`-${migrationId}-before.json`))
    assert.equal(files.length, 1)
    return path.join(outDir, files[0])
}

test("delete: apply guarda documentos completos y el rollback los re-inserta con sus tipos", async (t) => {
    const outDir = tempDir(t)
    const data = fixture()
    const originals = data.matches.filter((item) => item.played === false)
    const fake = createFakeDb("apa-staging", data, { outDir })
    const applied = await runMain(
        [deleteMigration.id, "--apply", "--out-dir", outDir],
        fake.db,
        [deleteMigration]
    )
    assert.equal(applied.code, 0, applied.lines.join("\n"))
    assert.match(applied.lines.join("\n"), /2 borrados de 2/)
    const bulk = fake.writes.find((write) => write.method === "bulkWrite")
    assert.equal(bulk.beforeFile, true)
    assert.deepEqual(bulk.options, { ordered: true })
    assert.equal(fake.store[MATCHES].length, 1)

    const beforeFile = beforeFileOf(outDir, deleteMigration.id)
    const before = deserialize(fs.readFileSync(beforeFile, "utf8"))
    assert.equal(before.entries.length, 2)
    assert.equal(before.entries[0].kind, "delete")
    // Documento completo, incluidos campos fuera de la proyección del snapshot.
    assert.equal(before.entries[0].document.playerP1.avatar, "x.png")

    const writesBefore = fake.writes.length
    const dry = await runMain(
        ["--rollback", beforeFile, "--out-dir", outDir],
        fake.db,
        []
    )
    assert.equal(dry.code, 0, dry.lines.join("\n"))
    assert.equal(fake.writes.length, writesBefore)

    const rolled = await runMain(
        ["--rollback", beforeFile, "--apply", "--out-dir", outDir],
        fake.db,
        []
    )
    assert.equal(rolled.code, 0, rolled.lines.join("\n"))
    assert.match(rolled.lines.join("\n"), /2 restaurados, 0 salteados/)
    originals.forEach((original) => {
        const restored = fake.store[MATCHES].find(
            (item) => canonicalKey(item._id) === canonicalKey(original._id)
        )
        // EJSON canónico: mismos tipos (ObjectId, Date, int vs double).
        assert.equal(canonicalKey(restored), canonicalKey(original))
    })

    // Un segundo rollback no pisa nada: los _id ya existen.
    const again = await runMain(
        ["--rollback", beforeFile, "--apply", "--out-dir", outDir],
        fake.db,
        []
    )
    assert.match(again.lines.join("\n"), /0 restaurados, 2 salteados/)
    assert.equal(fake.store[MATCHES].length, 3)
})

test("delete: si un candidato ya no cumple el filtro, aborta sin before-file ni escrituras", async (t) => {
    const { applyMigration } = require("../../scripts/migrations/lib/apply")
    const outDir = tempDir(t)
    const data = fixture()
    const { ops } = deleteMigration.plan(cloneSnapshot(data), {})
    // Se jugó entre el plan y la escritura.
    data.matches.find(
        (item) => String(item._id) === String(ops[0]._id)
    ).played = true
    const fake = createFakeDb("apa-staging", data, { outDir })
    await assert.rejects(
        applyMigration({
            db: fake.db,
            migrationId: deleteMigration.id,
            runId: RUN_ID,
            ops,
            outDir,
        }),
        /ya no cumplen su filtro/
    )
    assert.deepEqual(fake.writes, [])
    assert.equal(fs.existsSync(outDir) ? fs.readdirSync(outDir).length : 0, 0)
})

test("delete: el rollback en memoria re-inserta sólo los _id que no existen", () => {
    const snapshot = fixture()
    const { ops } = deleteMigration.plan(snapshot, {})
    const beforeDocument = {
        migrationId: deleteMigration.id,
        runId: RUN_ID,
        database: "apa-staging",
        entries: ops.map((op) => ({
            _id: op._id,
            collection: op.collection,
            kind: "delete",
            document: op.before,
        })),
    }
    // El primero sigue existiendo, el segundo no.
    const afterDelete = applyOpsInMemory(snapshot, [ops[1]])
    const evaluation = evaluateRollback(afterDelete, beforeDocument)
    assert.deepEqual(
        evaluation.restorable.map((op) => String(op._id)),
        [String(ops[1]._id)]
    )
    assert.deepEqual(
        evaluation.skipped.map((op) => String(op._id)),
        [String(ops[0]._id)]
    )
    assert.equal(evaluation.restorable[0].kind, "insert")
})

test("delete: ops mal formadas se rechazan", () => {
    const [op] = deleteMigration.plan(fixture(), {}).ops
    const invalid = [
        { ...op, filter: { _id: op._id } },
        { ...op, update: { $set: { played: true } } },
        { ...op, after: {} },
        { ...op, before: { ...op.before, _id: new ObjectId() } },
        { ...op, kind: "drop" },
    ]
    invalid.forEach((bad) => assert.throws(() => assertValidOps([bad])))
})

test("insert: apply inserta en orden con before-file previo y es idempotente", async (t) => {
    const outDir = tempDir(t)
    const fake = createFakeDb("apa-staging", fixture(), { outDir })
    const applied = await runMain(
        [insertMigration.id, "--apply", "--out-dir", outDir],
        fake.db,
        [insertMigration]
    )
    assert.equal(applied.code, 0, applied.lines.join("\n"))
    assert.match(applied.lines.join("\n"), /2 insertados de 2/)
    assert.deepEqual(
        fake.writes.map((write) => [write.name, write.method]),
        [
            [TOURNAMENTS, "bulkWrite"],
            [MATCHES, "bulkWrite"],
            ["migrations", "insertOne"],
        ]
    )
    assert.ok(fake.writes[0].beforeFile)
    assert.equal(
        fake.writes[0].operations[0].insertOne.document.name,
        "Torneo nuevo"
    )
    assert.equal(fake.writes[2].document.counts.inserted, 2)

    const before = deserialize(
        fs.readFileSync(beforeFileOf(outDir, insertMigration.id), "utf8")
    )
    assert.deepEqual(
        before.entries.map((entry) => [entry.kind, entry.collection]),
        [
            ["insert", TOURNAMENTS],
            ["insert", MATCHES],
        ]
    )

    const again = await runMain(
        [insertMigration.id, "--apply", "--out-dir", outDir],
        fake.db,
        [insertMigration]
    )
    assert.match(again.lines.join("\n"), /sin cambios pendientes/)
    assert.equal(fake.store[MATCHES].length, 4)
})

test("insert: el rollback borra por _id + updatedAt y saltea los editados", async (t) => {
    const outDir = tempDir(t)
    const fake = createFakeDb("apa-staging", fixture(), { outDir })
    await runMain(
        [insertMigration.id, "--apply", "--out-dir", outDir],
        fake.db,
        [insertMigration]
    )
    const beforeFile = beforeFileOf(outDir, insertMigration.id)
    // El partido insertado se editó después del apply.
    fake.store[MATCHES].find(
        (item) => canonicalKey(item._id) === canonicalKey(INSERTED_MATCH_ID)
    ).updatedAt = new Date("2026-02-01T00:00:00.000Z")

    const before = deserialize(fs.readFileSync(beforeFile, "utf8"))
    const evaluation = evaluateRollback(
        { matches: fake.store[MATCHES], tournaments: fake.store[TOURNAMENTS] },
        before
    )
    assert.deepEqual(
        evaluation.restorable.map((op) => String(op._id)),
        [String(TOURNAMENT_ID)]
    )
    assert.deepEqual(
        evaluation.skipped.map((op) => String(op._id)),
        [String(INSERTED_MATCH_ID)]
    )

    const rolled = await runMain(
        ["--rollback", beforeFile, "--apply", "--out-dir", outDir],
        fake.db,
        []
    )
    assert.equal(rolled.code, 0, rolled.lines.join("\n"))
    assert.match(rolled.lines.join("\n"), /1 restaurados, 1 salteados/)
    const deletes = fake.writes.filter((write) => write.method === "deleteOne")
    assert.deepEqual(
        deletes.map((write) => Object.keys(write.filter)),
        [
            ["_id", "updatedAt"],
            ["_id", "updatedAt"],
        ]
    )
    assert.equal(fake.store[TOURNAMENTS].length, 0)
    assert.equal(fake.store[MATCHES].length, 4)
})

test("insert: ops mal formadas o duplicadas se rechazan", () => {
    const snapshot = fixture()
    const [op] = insertMigration.plan(snapshot, { now: NOW }).ops
    const invalid = [
        { ...op, filter: { _id: op._id, name: "x" } },
        { ...op, update: { $set: { a: 1 } } },
        { ...op, before: {} },
        { ...op, after: { ...op.after, name: "otro" } },
        {
            ...op,
            document: { ...op.document, updatedAt: undefined },
            after: { ...op.after, updatedAt: undefined },
        },
        { ...op, document: { ...op.document, _id: new ObjectId() } },
    ]
    invalid.forEach((bad) =>
        assert.throws(() => assertValidOp(bad), /op inválida/)
    )
    const once = applyOpsInMemory(snapshot, [op])
    assert.equal(once.tournaments.length, 1)
    assert.equal(snapshot.tournaments.length, 0)
    assert.throws(() => applyOpsInMemory(once, [op]), /ya está en el snapshot/)
})

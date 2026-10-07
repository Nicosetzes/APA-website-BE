/*
 * Rama de escritura con dbs fake (nunca una base real). Archivo aparte de
 * tooling.test.js porque acá sí se carga lib/apply.js.
 */

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const { ObjectId } = require("mongoose").mongo

const {
    applyMigration,
    applyRollback,
} = require("../../scripts/migrations/lib/apply")
const { deserialize } = require("../../scripts/migrations/lib/ejson")
const {
    ABSENT,
    describeUpdate,
} = require("../../scripts/migrations/lib/memory")
const { main } = require("../../scripts/migrations/run")

const RUN_ID = "2026-01-02T03-04-05-678Z"
const NOW = () => new Date("2026-01-02T03:04:05.678Z")

const tempDir = (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apa-migrations-"))
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
    return dir
}

// Db fake que registra escrituras y, en cada una, si el before-file existía.
const createFakeDb = (databaseName, data, { outDir, registry = [] } = {}) => {
    const writes = []
    const beforeFileExists = () =>
        fs.existsSync(outDir) &&
        fs.readdirSync(outDir).some((file) => file.endsWith("-before.json"))
    const collection = (name) => ({
        find: () => ({
            toArray: async () =>
                name === "migrations" ? registry : data[name] || [],
        }),
        bulkWrite: async (operations, options) => {
            writes.push({
                name,
                method: "bulkWrite",
                operations,
                options,
                beforeFile: beforeFileExists(),
            })
            return {
                matchedCount: operations.length,
                modifiedCount: operations.length,
            }
        },
        updateOne: async (filter, update) => {
            writes.push({ name, method: "updateOne", filter, update })
            const matched = String(filter._id) !== String(data.skipId)
            return { matchedCount: matched ? 1 : 0 }
        },
        insertOne: async (document) => {
            writes.push({ name, method: "insertOne", document })
            return {}
        },
    })
    return { writes, db: { databaseName, collection } }
}

const matchId = new ObjectId("64697ac9d542ff4ada303900")
const fixtureData = () => ({
    "face-to-face": [
        {
            _id: matchId,
            played: true,
            updatedAt: new Date("2023-05-20T10:00:00.000Z"),
        },
    ],
    tournaments: [],
})

const playedAtMigration = {
    id: "001-fake-played-at",
    title: "fake",
    dependsOn: [],
    collections: ["face-to-face"],
    plan: (snapshot) => ({
        ops: snapshot.matches
            .filter((match) => !match.playedAt)
            .map((match) => {
                const update = { $set: { playedAt: match.updatedAt } }
                return {
                    collection: "face-to-face",
                    _id: match._id,
                    filter: { _id: match._id, playedAt: { $exists: false } },
                    update,
                    group: "default",
                    ...describeUpdate(match, update),
                }
            }),
        report: { checks: [{ name: "ok", ok: true, detail: "" }] },
    }),
}

test("applyMigration: before-file antes de escribir, bulkWrite ordenado y registro", async (t) => {
    const outDir = tempDir(t)
    const fake = createFakeDb("apa-staging", fixtureData(), { outDir })
    const [match] = fixtureData()["face-to-face"]
    const { ops } = playedAtMigration.plan({
        matches: [match],
        tournaments: [],
    })

    const result = await applyMigration({
        db: fake.db,
        migrationId: "001-fake-played-at",
        runId: RUN_ID,
        ops,
        outDir,
        counts: { ops: 1 },
        now: NOW,
    })

    assert.deepEqual(
        fake.writes.map((write) => [write.name, write.method]),
        [
            ["face-to-face", "bulkWrite"],
            ["migrations", "insertOne"],
        ]
    )
    assert.equal(fake.writes[0].beforeFile, true)
    assert.deepEqual(fake.writes[0].options, { ordered: true })
    assert.deepEqual(fake.writes[0].operations, [
        { updateOne: { filter: ops[0].filter, update: ops[0].update } },
    ])
    assert.deepEqual(fake.writes[1].document, {
        migrationId: "001-fake-played-at",
        runId: RUN_ID,
        kind: "apply",
        appliedAt: NOW(),
        counts: { ops: 1, matched: 1, modified: 1 },
        beforeFile: `${RUN_ID}-001-fake-played-at-before.json`,
    })

    const before = deserialize(fs.readFileSync(result.beforeFile, "utf8"))
    assert.deepEqual(before, {
        migrationId: "001-fake-played-at",
        runId: RUN_ID,
        database: "apa-staging",
        entries: [
            {
                _id: matchId,
                collection: "face-to-face",
                before: { playedAt: ABSENT },
                after: { playedAt: match.updatedAt },
            },
        ],
    })
})

test("applyRollback: restaura con filtro por after y lista los salteados", async () => {
    const otherId = new ObjectId("64697ac9d542ff4ada303901")
    const fake = createFakeDb("apa-staging", { skipId: otherId })
    const playedAt = new Date("2023-05-20T10:00:00.000Z")
    const entry = (_id) => ({
        _id,
        collection: "face-to-face",
        before: { playedAt: ABSENT },
        after: { playedAt },
    })

    const result = await applyRollback({
        db: fake.db,
        beforeDocument: {
            migrationId: "001-fake-played-at",
            runId: RUN_ID,
            database: "apa-staging",
            entries: [entry(matchId), entry(otherId)],
        },
        beforeFile: path.join("x", `${RUN_ID}-001-fake-played-at-before.json`),
        runId: "rollback-run",
        now: NOW,
    })

    assert.equal(result.restored, 1)
    assert.deepEqual(result.skipped, [
        { collection: "face-to-face", _id: otherId },
    ])
    const updates = fake.writes.filter((write) => write.method === "updateOne")
    assert.deepEqual(updates[1].filter, { _id: matchId, playedAt })
    assert.deepEqual(updates[1].update, { $unset: { playedAt: "" } })
    assert.deepEqual(fake.writes.at(-1).document.counts, {
        entries: 2,
        restored: 1,
        skipped: 1,
    })
})

test("main --apply en una base de pruebas aplica una sola migración", async (t) => {
    const outDir = tempDir(t)
    const fake = createFakeDb("apa-staging", fixtureData(), { outDir })
    const lines = []

    const code = await main({
        argv: ["001-fake-played-at", "--apply", "--out-dir", outDir],
        connect: async () => ({ db: fake.db, close: async () => {} }),
        log: (line) => lines.push(line),
        logError: (line) => lines.push(line),
        migrations: [playedAtMigration],
        now: NOW,
    })

    assert.equal(code, 0, lines.join("\n"))
    assert.deepEqual(
        fake.writes.map((write) => write.method),
        ["bulkWrite", "insertOne"]
    )
    assert.ok(
        fs.existsSync(
            path.join(outDir, `${RUN_ID}-001-fake-played-at-apply.json`)
        )
    )
})

test("main --apply se bloquea si una dependencia tiene cambios y no está registrada", async (t) => {
    const outDir = tempDir(t)
    const fake = createFakeDb("apa-staging", fixtureData(), { outDir })
    const dependent = {
        id: "002-fake-dependent",
        title: "dep",
        dependsOn: ["001-fake-played-at"],
        collections: ["tournaments"],
        plan: () => ({ ops: [], report: { checks: [] } }),
    }
    const lines = []

    const code = await main({
        argv: ["002-fake-dependent", "--apply", "--out-dir", outDir],
        connect: async () => ({ db: fake.db, close: async () => {} }),
        log: (line) => lines.push(line),
        logError: (line) => lines.push(line),
        migrations: [playedAtMigration, dependent],
        now: NOW,
    })

    assert.equal(code, 2, lines.join("\n"))
    assert.equal(fake.writes.length, 0)
    assert.match(
        lines.join("\n"),
        /FAIL dependencia 001-fake-played-at aplicada/
    )
})

test("main --rollback sin --apply sólo reporta (dry-run)", async (t) => {
    const outDir = tempDir(t)
    const beforeDir = tempDir(t)
    const fake = createFakeDb("apa-staging", fixtureData(), { outDir })
    const [match] = fixtureData()["face-to-face"]
    const { ops } = playedAtMigration.plan({
        matches: [match],
        tournaments: [],
    })
    const { writeBeforeFile } = require("../../scripts/migrations/lib/apply")
    const beforeFile = writeBeforeFile({
        outDir: beforeDir,
        runId: RUN_ID,
        migrationId: "001-fake-played-at",
        database: "apa-staging",
        ops,
    })
    const lines = []

    const code = await main({
        argv: ["--rollback", beforeFile, "--out-dir", outDir],
        connect: async () => ({ db: fake.db, close: async () => {} }),
        log: (line) => lines.push(line),
        logError: (line) => lines.push(line),
        migrations: [],
        now: NOW,
    })

    assert.equal(code, 0, lines.join("\n"))
    assert.equal(fake.writes.length, 0)
    const report = deserialize(
        fs.readFileSync(
            path.join(
                outDir,
                `${RUN_ID}-001-fake-played-at-rollback-dry-run.json`
            ),
            "utf8"
        )
    )
    assert.equal(report.readOnly, true)
    // El documento no tiene playedAt (nunca se aplicó): se saltea.
    assert.deepEqual(report.migrations[0].summary, {
        entries: 1,
        restorable: 0,
        skipped: 1,
    })
})

/*
 * 006 (alta del Torneo Argentino 2021) y soporte de ops `insert` en el
 * tooling de migraciones: plan, checks, idempotencia, apply y rollback.
 * Siempre con dbs fake.
 */
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const { ObjectId } = require("mongoose").mongo

const m006 = require("../../scripts/migrations/006-torneo-argentino-2021")
const {
    applyMigration,
    applyRollback,
} = require("../../scripts/migrations/lib/apply")
const { deserialize } = require("../../scripts/migrations/lib/ejson")
const {
    INSERT_KIND,
    applyOpsInMemory,
    assertValidOp,
    cloneValue,
} = require("../../scripts/migrations/lib/memory")
const { evaluateRollback } = require("../../scripts/migrations/lib/rollback")
const { main } = require("../../scripts/migrations/run")

const RUN_ID = "2026-11-17T12-00-00-000Z"
const NOW = new Date("2026-11-17T12:00:00.000Z")
const context = { now: NOW }

const tempDir = (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apa-migrations-"))
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
    return dir
}

// Un partido viejo por equipo, con su dueño de esta carga: así los checks de
// "ids y nombres ya usados" pasan como en la base real.
const baseSnapshot = () => {
    const teamIds = Object.keys(m006.TEAMS).map(Number)
    const matches = teamIds.map((teamId, index) => {
        const owner = m006.TEAMS[teamId].player
        return {
            _id: new ObjectId(
                `625e0f191b3f1ce6b5ee${index.toString(16).padStart(4, "0")}`
            ),
            tournament: {
                id: "625e0f191b3f1ce6b5ee4756",
                name: "Torneo Argentino 2021/22",
            },
            type: "regular",
            played: true,
            playerP1: { id: m006.PLAYERS[owner], name: owner },
            teamP1: { id: teamId, name: m006.TEAMS[teamId].name },
            playerP2: { id: "630abc35b2e0801cf5448429", name: "Nico" },
            teamP2: { id: 456, name: "Talleres Cordoba" },
            scoreP1: 1,
            scoreP2: 0,
            playedAt: new Date("2021-12-01T04:57:42.000Z"),
            updatedAt: new Date("2022-04-19T02:37:03.000Z"),
        }
    })
    return {
        matches,
        tournaments: [
            {
                _id: new ObjectId("625e0f191b3f1ce6b5ee4756"),
                name: "Torneo Argentino 2021/22",
            },
        ],
    }
}

const failedChecks = (report) =>
    report.checks.filter((check) => !check.ok).map((check) => check.name)

test("plan: 1 torneo y 30 partidos como inserts, con checks ok", () => {
    const { ops, report } = m006.plan(baseSnapshot(), context)
    assert.equal(ops.length, 31)
    assert.deepEqual(failedChecks(report), [])
    ops.forEach((op) =>
        assertValidOp(op, { allowedCollections: m006.collections })
    )
    assert.ok(ops.every((op) => op.kind === INSERT_KIND))
    assert.equal(ops[0].collection, "tournaments")
    assert.ok(ops.slice(1).every((op) => op.collection === "face-to-face"))

    const tournament = ops[0].document
    assert.equal(String(tournament._id), m006.TOURNAMENT_ID)
    assert.equal(tournament.name, "Torneo Argentino 2021")
    assert.equal(tournament.valid, false)
    assert.equal(tournament.ongoing, false)
    assert.equal(tournament.format, "league")
    assert.equal(tournament.players.length, 4)
    assert.equal(tournament.teams.length, 20)
    assert.equal(tournament.startedAt.toISOString(), "2021-02-23T15:00:00.000Z")
    assert.equal(tournament.startedAtPrecision, "day")
    assert.equal(tournament.closedAt.toISOString(), "2021-03-31T15:00:00.000Z")
    assert.equal(tournament.closedAtPrecision, "month")
    assert.equal(tournament.outcome, undefined)
})

test("plan: partidos con jugador del equipo, outcome y orden de juego", () => {
    const matches = m006
        .plan(baseSnapshot(), context)
        .ops.slice(1)
        .map((op) => op.document)

    // 1) Colón (Lucho) 1-3 Estudiantes (Max).
    const [first] = matches
    assert.deepEqual(first.playerP1, {
        id: m006.PLAYERS.Lucho,
        name: "Lucho",
    })
    assert.deepEqual(first.teamP1, { id: 448, name: "Colon Santa Fe" })
    assert.deepEqual(first.playerP2, { id: m006.PLAYERS.Max, name: "Max" })
    assert.deepEqual(first.outcome, {
        playerThatWon: { id: m006.PLAYERS.Max, name: "Max" },
        teamThatWon: { id: 450, name: "Estudiantes L.P." },
        scoreFromTeamThatWon: 3,
        playerThatLost: { id: m006.PLAYERS.Lucho, name: "Lucho" },
        teamThatLost: { id: 448, name: "Colon Santa Fe" },
        scoreFromTeamThatLost: 1,
        draw: false,
        scoringDifference: 2,
    })
    // 4) River (Lucho) 3-3 Aldosivi (Leo).
    assert.deepEqual(matches[3].outcome, { draw: true, penalties: false })

    matches.forEach((match, index) => {
        assert.equal(match.type, "regular")
        assert.equal(match.played, true)
        assert.equal(match.schemaVersion, 1)
        assert.deepEqual(match.tournament, {
            id: m006.TOURNAMENT_ID,
            name: "Torneo Argentino 2021",
        })
        assert.equal(match.updatedAt, NOW)
        if (index > 0) assert.ok(match.playedAt > matches[index - 1].playedAt)
        if (index > 0)
            assert.ok(
                match._id.toHexString() > matches[index - 1]._id.toHexString()
            )
    })
    assert.equal(matches[0].playedAtPrecision, "day")
    assert.equal(matches[29].playedAtPrecision, "month")
    assert.ok(
        matches
            .slice(1, 29)
            .every((match) => match.playedAtPrecision === "approx")
    )
    assert.equal(matches[29].playedAt.toISOString(), "2021-03-31T15:00:00.000Z")
})

test("plan: balance por jugador (ganados/empatados/perdidos)", () => {
    const { perPlayer } = m006.plan(baseSnapshot(), context).report.summary
    const expected = {
        Leo: { played: 15, won: 10, drawn: 4, lost: 1 },
        Lucho: { played: 16, won: 1, drawn: 6, lost: 9 },
        Max: { played: 14, won: 3, drawn: 4, lost: 7 },
        Santi: { played: 15, won: 6, drawn: 6, lost: 3 },
    }
    assert.deepEqual(
        perPlayer,
        Object.fromEntries(
            Object.entries(expected).map(([name, row]) => [
                m006.PLAYERS[name],
                row,
            ])
        )
    )
})

test("idempotencia: aplicado en memoria, la segunda corrida da 0 ops", () => {
    const snapshot = baseSnapshot()
    const { ops } = m006.plan(snapshot, context)
    const after = applyOpsInMemory(snapshot, ops)
    const second = m006.plan(after, { now: new Date() })
    assert.equal(second.ops.length, 0)
    assert.deepEqual(failedChecks(second.report), [])
    assert.equal(second.report.summary.alreadyApplied, true)
})

test("aplicada a medias, nombre repetido o equipo desconocido bloquean", () => {
    const snapshot = baseSnapshot()
    const { ops } = m006.plan(snapshot, context)
    const partial = applyOpsInMemory(snapshot, ops.slice(0, 3))
    assert.deepEqual(failedChecks(m006.plan(partial, context).report), [
        "los 31 _id no existen (o ya existen todos: aplicada)",
    ])

    const duplicated = baseSnapshot()
    duplicated.tournaments.push({
        _id: new ObjectId(),
        name: "Torneo Argentino 2021",
    })
    assert.deepEqual(failedChecks(m006.plan(duplicated, context).report), [
        "ningún otro torneo se llama Torneo Argentino 2021",
    ])

    const renamed = baseSnapshot()
    renamed.matches[0].teamP1 = { ...renamed.matches[0].teamP1, name: "Otro" }
    assert.deepEqual(failedChecks(m006.plan(renamed, context).report), [
        "equipos con id y nombre ya usados en otros partidos",
    ])
})

test("plan sin context.now falla", () => {
    assert.throws(() => m006.plan(baseSnapshot(), {}), /context\.now/)
})

test("ops insert mal formadas se rechazan", () => {
    const [op] = m006.plan(baseSnapshot(), context).ops
    const broken = [
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
    broken.forEach((candidate) =>
        assert.throws(() => assertValidOp(candidate), /op inválida/)
    )
    assert.throws(
        () => applyOpsInMemory(applyOpsInMemory(baseSnapshot(), [op]), [op]),
        /ya está en el snapshot/
    )
})

const createFakeDb = (databaseName, { deletedCount = () => 1 } = {}) => {
    const writes = []
    const collection = (name) => ({
        find: () => ({ toArray: async () => [] }),
        bulkWrite: async (operations, options) => {
            writes.push({ name, method: "bulkWrite", operations, options })
            return { insertedCount: operations.length }
        },
        insertOne: async (document) => {
            writes.push({ name, method: "insertOne", document })
            return {}
        },
        deleteOne: async (filter) => {
            writes.push({ name, method: "deleteOne", filter })
            return { deletedCount: deletedCount(filter) }
        },
    })
    return { writes, db: { databaseName, collection } }
}

test("apply: inserta en orden, before-file con los documentos y rollback por _id + updatedAt", async (t) => {
    const outDir = tempDir(t)
    const { ops } = m006.plan(baseSnapshot(), context)
    const fake = createFakeDb("apa-dev")
    const result = await applyMigration({
        db: fake.db,
        migrationId: m006.id,
        runId: RUN_ID,
        ops,
        outDir,
        now: () => NOW,
    })
    assert.equal(result.inserted, 31)
    assert.deepEqual(
        fake.writes.map((write) => [write.name, write.method]),
        [
            ["tournaments", "bulkWrite"],
            ["face-to-face", "bulkWrite"],
            ["migrations", "insertOne"],
        ]
    )
    assert.deepEqual(fake.writes[0].operations, [
        { insertOne: { document: ops[0].document } },
    ])
    assert.equal(fake.writes[1].operations.length, 30)
    assert.equal(fake.writes[2].document.counts.inserted, 31)

    const before = deserialize(fs.readFileSync(result.beforeFile, "utf8"))
    assert.equal(before.entries.length, 31)
    assert.ok(before.entries.every((entry) => entry.kind === "insert"))
    assert.equal(String(before.entries[0].document._id), m006.TOURNAMENT_ID)

    // En memoria: el que conserva su updatedAt se borra; el editado, no.
    const snapshot = applyOpsInMemory(baseSnapshot(), ops)
    const edited = snapshot.matches.find(
        (match) => String(match._id) === String(ops[5]._id)
    )
    edited.updatedAt = new Date("2026-12-01T00:00:00.000Z")
    const evaluation = evaluateRollback(snapshot, before)
    assert.equal(evaluation.restorable.length, 30)
    assert.deepEqual(
        evaluation.skipped.map((op) => String(op._id)),
        [String(ops[5]._id)]
    )

    const editedId = String(ops[5]._id)
    const rollbackDb = createFakeDb("apa-dev", {
        deletedCount: (filter) => (String(filter._id) === editedId ? 0 : 1),
    })
    const rollback = await applyRollback({
        db: rollbackDb.db,
        beforeDocument: before,
        beforeFile: result.beforeFile,
        runId: "rollback-run",
        now: () => NOW,
    })
    assert.equal(rollback.restored, 30)
    assert.deepEqual(
        rollback.skipped.map((entry) => String(entry._id)),
        [editedId]
    )
    const deletes = rollbackDb.writes.filter(
        (write) => write.method === "deleteOne"
    )
    assert.equal(deletes.length, 31)
    assert.deepEqual(deletes.at(-1).filter, {
        _id: ops[0]._id,
        updatedAt: NOW,
    })
})

test("main dry-run: reporta 31 inserts y no escribe", async (t) => {
    const outDir = tempDir(t)
    const snapshot = baseSnapshot()
    const writes = []
    const db = {
        databaseName: "myFirstDatabase",
        collection: (name) => ({
            find: () => ({
                toArray: async () =>
                    name === "face-to-face"
                        ? snapshot.matches.map(cloneValue)
                        : name === "tournaments"
                        ? snapshot.tournaments.map(cloneValue)
                        : [],
            }),
            aggregate: () => ({ toArray: async () => [] }),
            bulkWrite: async () => writes.push(name),
            insertOne: async () => writes.push(name),
        }),
    }
    const lines = []
    const code = await main({
        argv: [m006.id, "--out-dir", outDir],
        connect: async () => ({ db, close: async () => {} }),
        log: (line) => lines.push(line),
        logError: (line) => lines.push(line),
        migrations: [m006],
        now: () => NOW,
    })
    assert.equal(code, 0, lines.join("\n"))
    assert.deepEqual(writes, [])
    assert.match(
        lines.join("\n"),
        /cambios: 31 \(tournaments: 1, face-to-face: 30\)/
    )
    assert.match(lines.join("\n"), /resultado: ok/)
})

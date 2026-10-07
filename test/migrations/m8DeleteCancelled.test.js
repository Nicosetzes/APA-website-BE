/*
 * M8 (destructiva): allowlist, conteos, idempotencia, dry-run sin escrituras
 * y rollback de documentos completos. Siempre con dbs fake.
 */

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const { Double, ObjectId } = require("mongoose").mongo

const m8 = require("../../scripts/migrations/005-m8-delete-cancelled-unplayed")
const {
    canonicalKey,
    deserialize,
} = require("../../scripts/migrations/lib/ejson")
const {
    applyOpsInMemory,
    assertValidOps,
    cloneSnapshot,
    getPath,
} = require("../../scripts/migrations/lib/memory")
const { evaluateRollback } = require("../../scripts/migrations/lib/rollback")
const { main } = require("../../scripts/migrations/run")

const APPLY_MODULE = path.resolve(
    __dirname,
    "../../scripts/migrations/lib/apply.js"
)
const isApplyLoaded = () =>
    Object.keys(require.cache).some(
        (file) => path.resolve(file) === APPLY_MODULE
    )

const LIGA = "695b007a9009908018bdc28f"
const CHEMPIONS = "664d43458f37f00eba8ea380"
const ITALO = "6377fb8eb217aa7d3bf61eef"
const RUN_ID = "2026-01-02T03-04-05-678Z"

let counter = 0
const nextId = () =>
    new ObjectId(`7000000000000000${(counter++).toString(16).padStart(8, "0")}`)

const unplayed = (tournamentId, name, extra = {}) => ({
    _id: nextId(),
    tournament: { id: tournamentId, name },
    type: "regular",
    played: false,
    playerP1: { id: "u1", name: "Jugador 1", avatar: "x.png" },
    playerP2: { id: "u2", name: "Jugador 2" },
    teamP1: { id: "10", name: "Equipo 10" },
    teamP2: { id: 20, name: "Equipo 20" },
    // Tipos BSON que el rollback tiene que conservar.
    weight: new Double(1),
    schemaVersion: 1,
    createdAt: new Date("2026-01-05T00:22:09.524Z"),
    updatedAt: new Date("2026-01-05T00:22:09.524Z"),
    ...extra,
})

const played = (tournamentId, name, extra = {}) => ({
    ...unplayed(tournamentId, name, extra),
    played: true,
    scoreP1: 2,
    scoreP2: 1,
    outcome: { draw: false },
    ...extra,
})

const repeat = (count, build) =>
    Array.from({ length: count }, (_, index) => build(index))

const fixture = () => {
    const groups = ["A", "B", "C", "D", "E", "F", "G", "H"]
    const matches = [
        ...repeat(47, () => played(LIGA, "Liga Inglesa 2026")),
        ...repeat(113, () => unplayed(LIGA, "Liga Inglesa 2026")),
        ...repeat(10, (index) =>
            played(CHEMPIONS, "Chempions 2024", { group: groups[index % 5] })
        ),
        ...repeat(86, (index) =>
            unplayed(CHEMPIONS, "Chempions 2024", {
                group: groups[index % 8],
            })
        ),
        // Pendientes que NO se tocan: torneo terminado bien, sin torneo,
        // tournament null.
        ...repeat(5, () => unplayed(ITALO, "Superliga ítalo-española 2022/23")),
        unplayed(ITALO, "x", { tournament: { name: "Chempions 2024" } }),
        unplayed(ITALO, "x", { tournament: null }),
    ]
    return {
        matches,
        tournaments: [
            {
                _id: new ObjectId(LIGA),
                name: "Liga Inglesa 2026",
                format: "league",
                ongoing: false,
            },
            {
                _id: new ObjectId(CHEMPIONS),
                name: "Chempions 2024",
                format: "champions_league",
                ongoing: true,
            },
            {
                _id: new ObjectId(ITALO),
                name: "Superliga ítalo-española 2022/23",
                ongoing: false,
            },
        ],
    }
}

const findCheck = (report, fragment) => {
    const found = report.checks.find((item) => item.name.includes(fragment))
    assert.ok(found, `no hay check con "${fragment}"`)
    return found
}
const failed = (report) =>
    report.checks.filter((item) => !item.ok).map((item) => item.name)
const tournamentOf = (match) => match?.tournament?.id

// Evaluador mínimo de los filtros que usan apply/rollback.
const matchesFilter = (document, filter) =>
    Object.entries(filter).every(([key, value]) => {
        if (key === "$or") return value.some((f) => matchesFilter(document, f))
        return canonicalKey(getPath(document, key)) === canonicalKey(value)
    })

const createFakeDb = (databaseName, data, { outDir } = {}) => {
    const store = {
        "face-to-face": [...data.matches],
        tournaments: [...data.tournaments],
        migrations: [],
    }
    const writes = []
    const beforeFileExists = () =>
        Boolean(outDir) &&
        fs.existsSync(outDir) &&
        fs.readdirSync(outDir).some((file) => file.endsWith("-before.json"))
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
            operations.forEach(({ deleteOne }) => {
                const index = store[name].findIndex((document) =>
                    matchesFilter(document, deleteOne.filter)
                )
                if (index >= 0) {
                    store[name].splice(index, 1)
                    deletedCount += 1
                }
            })
            return { matchedCount: 0, modifiedCount: 0, deletedCount }
        },
        insertOne: async (document) => {
            writes.push({ name, method: "insertOne", document })
            if (
                document._id !== undefined &&
                store[name].some(
                    (item) =>
                        canonicalKey(item._id) === canonicalKey(document._id)
                )
            ) {
                const error = new Error("duplicate")
                error.code = 11000
                throw error
            }
            store[name].push(document)
            return {}
        },
    })
    return { store, writes, db: { databaseName, collection } }
}

const tempDir = (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apa-m8-"))
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
    return dir
}

// Cada corrida con su runId (los reportes se escriben con flag wx).
let runs = 0
const runMain = (argv, db) => {
    const lines = []
    const startedAt = new Date(
        Date.parse("2026-01-02T03:04:05.678Z") + runs * 1000
    )
    runs += 1
    return main({
        argv,
        connect: async () => ({ db, close: async () => {} }),
        log: (line) => lines.push(line),
        logError: (line) => lines.push(line),
        migrations: [m8],
        now: () => startedAt,
    }).then((code) => ({ code, lines }))
}

test("dry-run: no escribe, no carga lib/apply.js y reporta 199", async (t) => {
    const outDir = tempDir(t)
    const writes = []
    const data = fixture()
    const spyCollection = (name) => {
        const target = {
            find: () => ({
                toArray: async () =>
                    name === "face-to-face" ? data.matches : data.tournaments,
            }),
        }
        ;[
            "insertOne",
            "insertMany",
            "deleteOne",
            "deleteMany",
            "bulkWrite",
            "updateOne",
            "updateMany",
            "replaceOne",
            "findOneAndDelete",
        ].forEach((method) => {
            target[method] = async () => writes.push(method)
        })
        return target
    }
    const { code, lines } = await runMain(
        ["all", "--uri-env", "MONGO_URI_PROD", "--out-dir", outDir],
        { databaseName: "myFirstDatabase", collection: spyCollection }
    )
    assert.equal(code, 0, lines.join("\n"))
    assert.deepEqual(writes, [])
    assert.equal(isApplyLoaded(), false)
    const [file] = fs.readdirSync(outDir)
    const report = deserialize(fs.readFileSync(path.join(outDir, file), "utf8"))
    assert.equal(report.readOnly, true)
    assert.equal(report.blocked, false)
    assert.equal(report.migrations[0].counts.ops, 199)
    assert.deepEqual(report.migrations[0].counts.byGroup, {
        "liga-inglesa-2026": 113,
        "chempions-2024": 86,
    })
    // Sin nombres de jugadores en el reporte.
    assert.doesNotMatch(JSON.stringify(report), /Jugador 1/)
})

test("allowlist: sólo no jugados de los 2 torneos, filtro por _id + torneo + played:false", () => {
    assert.ok(Object.isFrozen(m8.ALLOWLIST))
    m8.ALLOWLIST.forEach((entry) => assert.ok(Object.isFrozen(entry)))
    assert.deepEqual(
        m8.ALLOWLIST.map((entry) => [
            entry.tournamentId,
            entry.expectedToDelete,
        ]),
        [
            [LIGA, 113],
            [CHEMPIONS, 86],
        ]
    )
    assert.equal(m8.EXPECTED_TOTAL_TO_DELETE, 199)
    assert.deepEqual(m8.dependsOn, [])

    const snapshot = fixture()
    const { ops, report } = m8.plan(snapshot, {})
    assertValidOps(ops, { allowedCollections: m8.collections })
    assert.deepEqual(failed(report), [])
    assert.equal(ops.length, 199)

    const byId = new Map(
        snapshot.matches.map((match) => [String(match._id), match])
    )
    ops.forEach((op) => {
        const match = byId.get(String(op._id))
        assert.equal(op.kind, "delete")
        assert.equal(match.played, false)
        assert.ok([LIGA, CHEMPIONS].includes(tournamentOf(match)))
        assert.deepEqual(op.filter, {
            _id: match._id,
            "tournament.id": tournamentOf(match),
            played: false,
        })
        assert.equal(op.after, null)
    })
    // Los pendientes de otros torneos / sin torneo quedan fuera.
    const opIds = new Set(ops.map((op) => String(op._id)))
    snapshot.matches
        .filter((match) => ![LIGA, CHEMPIONS].includes(tournamentOf(match)))
        .forEach((match) => assert.equal(opIds.has(String(match._id)), false))
    assert.deepEqual(report.summary.untouchedUnplayedByTournament, {
        "(sin torneo)": 2,
        [ITALO]: 5,
    })
    const [liga, chempions] = report.summary.tournaments
    assert.equal(liga.toDelete, 113)
    assert.equal(liga.remainingAfter, 47)
    assert.equal(chempions.toDelete, 86)
    assert.equal(chempions.remainingAfter, 10)
    // Con 10 jugados en 5 grupos, F/G/H quedan vacíos: nota informativa.
    assert.deepEqual(report.summary.groupsLeftEmpty, [
        "Chempions 2024 grupo F",
        "Chempions 2024 grupo G",
        "Chempions 2024 grupo H",
    ])
    assert.equal(report.notes[0].kind, "groupsLeftEmpty")
})

test("conteos: cualquier diferencia con 113/86 o 47/10 bloquea", () => {
    const base = fixture()
    const ligaUnplayed = () =>
        base.matches.filter(
            (match) => tournamentOf(match) === LIGA && match.played === false
        )

    // Se jugó uno más mientras tanto.
    const playedMeanwhile = cloneSnapshot(base)
    const target = playedMeanwhile.matches.find(
        (match) => tournamentOf(match) === LIGA && match.played === false
    )
    Object.assign(target, { played: true, scoreP1: 1, scoreP2: 0 })
    const meanwhile = m8.plan(playedMeanwhile, {})
    assert.equal(
        findCheck(meanwhile.report, "113 no jugados a borrar").ok,
        false
    )
    assert.equal(findCheck(meanwhile.report, "jugados = 47").ok, false)
    assert.equal(findCheck(meanwhile.report, "total a borrar = 199").ok, false)
    assert.equal(
        meanwhile.ops.some((op) => String(op._id) === String(target._id)),
        false
    )

    // played ausente: la app lo trata como jugado; no se borra y bloquea.
    const absent = cloneSnapshot(base)
    const noPlayed = absent.matches.find(
        (match) => tournamentOf(match) === CHEMPIONS && match.played === false
    )
    delete noPlayed.played
    const absentPlan = m8.plan(absent, {})
    assert.equal(
        findCheck(
            absentPlan.report,
            "Chempions 2024: 0 partidos con played ausente"
        ).ok,
        false
    )
    assert.equal(
        absentPlan.ops.some((op) => String(op._id) === String(noPlayed._id)),
        false
    )

    // No jugado con score: no se borra y bloquea.
    const scored = cloneSnapshot(base)
    const withScore = scored.matches.find(
        (match) => tournamentOf(match) === LIGA && match.played === false
    )
    withScore.scoreP1 = 0
    const scoredPlan = m8.plan(scored, {})
    assert.equal(
        findCheck(
            scoredPlan.report,
            "Liga Inglesa 2026: 0 no jugados con scores"
        ).ok,
        false
    )
    assert.equal(
        scoredPlan.ops.some((op) => String(op._id) === String(withScore._id)),
        false
    )

    // Torneo inexistente o con otro nombre: bloquea.
    const renamed = cloneSnapshot(base)
    renamed.tournaments[0].name = "Otra liga"
    assert.equal(
        findCheck(m8.plan(renamed, {}).report, "allowlist existen").ok,
        false
    )
    assert.equal(ligaUnplayed().length, 113)
})

test("idempotencia: aplicado en memoria, la segunda corrida da 0 ops y checks ok", () => {
    const snapshot = fixture()
    const first = m8.plan(snapshot, {})
    const simulated = applyOpsInMemory(snapshot, first.ops)
    assert.equal(simulated.matches.length, snapshot.matches.length - 199)
    assert.equal(simulated.tournaments.length, snapshot.tournaments.length)
    const second = m8.plan(simulated, {})
    assert.equal(second.ops.length, 0)
    assert.deepEqual(failed(second.report), [])
    // El snapshot original no se tocó.
    assert.equal(snapshot.matches.length, 47 + 113 + 10 + 86 + 7)
})

test("apply + rollback: before-file con documentos completos, deletes por _id y re-insert con tipos", async (t) => {
    const outDir = tempDir(t)
    const data = fixture()
    const originals = data.matches.filter(
        (match) =>
            [LIGA, CHEMPIONS].includes(tournamentOf(match)) &&
            match.played === false
    )
    const fake = createFakeDb("apa-staging", data, { outDir })

    const applied = await runMain(
        ["005-m8-delete-cancelled-unplayed", "--apply", "--out-dir", outDir],
        fake.db
    )
    assert.equal(applied.code, 0, applied.lines.join("\n"))
    const bulk = fake.writes.filter((write) => write.method === "bulkWrite")
    assert.equal(bulk.length, 1)
    assert.equal(bulk[0].beforeFile, true)
    assert.deepEqual(bulk[0].options, { ordered: true })
    assert.equal(bulk[0].operations.length, 199)
    bulk[0].operations.forEach((operation) => {
        assert.deepEqual(Object.keys(operation), ["deleteOne"])
        assert.equal(operation.deleteOne.filter.played, false)
    })
    assert.match(applied.lines.join("\n"), /199 borrados de 199/)
    // Quedan los jugados de los 2 torneos y todo lo demás.
    assert.equal(fake.store["face-to-face"].length, 47 + 10 + 7)
    assert.equal(fake.store.tournaments.length, 3)
    assert.equal(fake.store.migrations[0].counts.deleted, 199)

    const beforeFiles = fs
        .readdirSync(outDir)
        .filter((file) =>
            file.endsWith("-005-m8-delete-cancelled-unplayed-before.json")
        )
    assert.equal(beforeFiles.length, 1)
    const beforeFile = path.join(outDir, beforeFiles[0])
    const before = deserialize(fs.readFileSync(beforeFile, "utf8"))
    assert.equal(before.entries.length, 199)
    assert.equal(before.entries[0].kind, "delete")
    // Documento completo, incluidos campos fuera de la proyección del snapshot.
    assert.equal(before.entries[0].document.playerP1.avatar, "x.png")
    assert.equal(before.entries[0].document.schemaVersion, 1)

    // Rollback: primero dry-run (no escribe), después apply.
    const writesBefore = fake.writes.length
    const dry = await runMain(
        ["--rollback", beforeFile, "--out-dir", outDir],
        fake.db
    )
    assert.equal(dry.code, 0, dry.lines.join("\n"))
    assert.equal(fake.writes.length, writesBefore)

    const rolled = await runMain(
        ["--rollback", beforeFile, "--apply", "--out-dir", outDir],
        fake.db
    )
    assert.equal(rolled.code, 0, rolled.lines.join("\n"))
    assert.match(rolled.lines.join("\n"), /199 restaurados, 0 salteados/)
    const restored = new Map(
        fake.store["face-to-face"].map((document) => [
            canonicalKey(document._id),
            document,
        ])
    )
    originals.forEach((original) => {
        const document = restored.get(canonicalKey(original._id))
        assert.ok(document, String(original._id))
        // EJSON canónico: mismos tipos (ObjectId, Date, int vs double).
        assert.equal(canonicalKey(document), canonicalKey(original))
    })
    assert.equal(fake.store["face-to-face"].length, data.matches.length)

    // Un segundo rollback no pisa nada: todos los _id ya existen.
    const again = await runMain(
        ["--rollback", beforeFile, "--apply", "--out-dir", outDir],
        fake.db
    )
    assert.equal(again.code, 0, again.lines.join("\n"))
    assert.match(again.lines.join("\n"), /0 restaurados, 199 salteados/)
    assert.equal(fake.store["face-to-face"].length, data.matches.length)
})

test("apply: si un candidato ya no cumple el filtro, aborta sin before-file ni escrituras", async (t) => {
    const { applyMigration } = require("../../scripts/migrations/lib/apply")
    const outDir = tempDir(t)
    const data = fixture()
    const { ops } = m8.plan(cloneSnapshot(data), {})
    // Se jugó entre el plan y la escritura.
    const target = data.matches.find(
        (match) => String(match._id) === String(ops[0]._id)
    )
    target.played = true
    const fake = createFakeDb("apa-staging", data, { outDir })

    await assert.rejects(
        applyMigration({
            db: fake.db,
            migrationId: m8.id,
            runId: RUN_ID,
            ops,
            outDir,
        }),
        /ya no cumplen su filtro/
    )
    assert.deepEqual(fake.writes, [])
    assert.equal(fs.existsSync(outDir) ? fs.readdirSync(outDir).length : 0, 0)
})

test("rollback en memoria: re-inserta sólo los _id que no existen", () => {
    const snapshot = fixture()
    const { ops } = m8.plan(snapshot, {})
    const entries = ops.slice(0, 2).map((op) => ({
        _id: op._id,
        collection: op.collection,
        kind: "delete",
        document: op.before,
    }))
    const beforeDocument = {
        migrationId: m8.id,
        runId: RUN_ID,
        database: "apa-staging",
        entries,
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

test("evidencia: cuenta ops de migraciones anteriores sobre los documentos a borrar", () => {
    const snapshot = fixture()
    const target = snapshot.matches.find(
        (match) => tournamentOf(match) === LIGA && match.played === false
    )
    const playedOne = snapshot.matches.find(
        (match) => tournamentOf(match) === LIGA && match.played === true
    )
    const context = {
        results: {
            "004-m4-types": {
                ops: [
                    { collection: "face-to-face", _id: target._id },
                    { collection: "face-to-face", _id: playedOne._id },
                ],
            },
            "001-m2-played-at": {
                ops: [{ collection: "face-to-face", _id: playedOne._id }],
            },
        },
    }
    const { report } = m8.plan(snapshot, context)
    assert.deepEqual(report.evidence.overlapWithEarlierMigrations, {
        "004-m4-types": 1,
        "001-m2-played-at": 0,
    })
})

test("ops de delete mal formadas se rechazan", () => {
    const snapshot = fixture()
    const [op] = m8.plan(snapshot, {}).ops
    const invalid = [
        { ...op, filter: { _id: op._id } },
        { ...op, update: { $set: { played: true } } },
        { ...op, after: {} },
        { ...op, before: { ...op.before, _id: new ObjectId() } },
        { ...op, kind: "drop" },
    ]
    invalid.forEach((bad) => assert.throws(() => assertValidOps([bad])))
})

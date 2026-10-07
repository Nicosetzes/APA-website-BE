const assert = require("node:assert/strict")
const test = require("node:test")

const { ObjectId } = require("mongoose").mongo

const m2 = require("../../scripts/migrations/001-m2-played-at")
const m7 = require("../../scripts/migrations/002-m7-point-fixes")
const m3 = require("../../scripts/migrations/003-m3-tournament-dates")
const {
    applyOpsInMemory,
    assertValidOps,
    cloneSnapshot,
} = require("../../scripts/migrations/lib/memory")
const { buildRollbackOps } = require("../../scripts/migrations/lib/rollback")
const { runPlans } = require("../../scripts/migrations/run")

const T = {
    bracket: new ObjectId("400000000000000000000001"),
    league: new ObjectId("400000000000000000000002"),
    legacy: new ObjectId("400000000000000000000003"),
    pending: new ObjectId("400000000000000000000004"),
    running: new ObjectId("400000000000000000000005"),
    linked: new ObjectId("400000000000000000000006"),
}
const LINK_NAME = "Liga Inventada 2023/24 (II)"

let counter = 0
const nextId = () =>
    new ObjectId(`5000000000000000${(counter++).toString(16).padStart(8, "0")}`)

const match = (tournament, fields) => ({
    _id: nextId(),
    tournament: { id: String(tournament), name: "Torneo" },
    type: "regular",
    played: true,
    ...fields,
})
const date = (value) => new Date(value)

const fixture = () => ({
    matches: [
        match(T.bracket, {
            playedAt: date("2023-01-10T20:00:00Z"),
            playedAtPrecision: "approx",
        }),
        match(T.bracket, {
            playedAt: date("2023-02-01T20:00:00Z"),
            playedAtPrecision: "exact",
        }),
        // Final (15) anulada pero jugada: igual define el cierre.
        match(T.bracket, {
            type: "playoff",
            playoff_id: 15,
            valid: false,
            playedAt: date("2023-03-01T20:00:00Z"),
            playedAtPrecision: "exact",
        }),
        // Partido posterior a la final (no define el cierre).
        match(T.bracket, {
            playedAt: date("2023-04-01T20:00:00Z"),
            playedAtPrecision: "exact",
        }),
        match(T.bracket, { played: false }),
        match(T.league, {
            playedAt: date("2024-01-05T20:00:00Z"),
            playedAtPrecision: "day",
        }),
        match(T.league, {
            playedAt: date("2024-03-05T20:00:00Z"),
            playedAtPrecision: "month",
        }),
        match(T.running, {
            playedAt: date("2026-06-20T04:37:45Z"),
            playedAtPrecision: "exact",
        }),
    ],
    tournaments: [
        {
            _id: T.bracket,
            name: "Superliga",
            format: "league_playin_playoff",
            ongoing: false,
        },
        { _id: T.league, name: "Liga", format: "league", ongoing: false },
        {
            _id: T.legacy,
            name: "Histórico",
            format: "league",
            legacy: true,
            ongoing: false,
            createdAt: date("2017-01-01T10:00:00Z"),
        },
        { _id: T.pending, name: "Futuro", format: "league", ongoing: true },
        { _id: T.running, name: "Mundial", format: "world_cup", ongoing: true },
    ],
})

const NO_OVERRIDES = Object.freeze({ tournamentClosedAt: [] })

const runPlan = (snapshot, context = {}, overrides = NO_OVERRIDES) =>
    m3
        .createMigration({ linkByName: [LINK_NAME], overrides })
        .plan(snapshot, context)

const opFor = (ops, id) => ops.find((op) => String(op._id) === String(id))
const findCheck = (report, fragment) =>
    report.checks.find((item) => item.name.includes(fragment))

test("bracket: startedAt = mínimo con su precisión y closedAt = final (valid:false incluida)", () => {
    const { ops, report } = runPlan(fixture())
    assertValidOps(ops)
    const op = opFor(ops, T.bracket)
    assert.deepEqual(op.after, {
        startedAt: date("2023-01-10T20:00:00Z"),
        startedAtPrecision: "approx",
        closedAt: date("2023-03-01T20:00:00Z"),
        closedAtPrecision: "exact",
    })
    assert.deepEqual(op.filter, {
        _id: T.bracket,
        startedAt: { $exists: false },
        startedAtPrecision: { $exists: false },
        closedAt: { $exists: false },
        closedAtPrecision: { $exists: false },
    })
    assert.deepEqual(
        report.checks.filter((item) => !item.ok),
        []
    )
    assert.equal(report.samples["from-matches"][0].name, "Superliga")
})

test("final de ida y vuelta: sólo cuenta la leg 1 / sin leg", () => {
    const snapshot = fixture()
    const final = snapshot.matches.find((item) => item.playoff_id === 15)
    final.leg = 2
    const { ops } = runPlan(snapshot)
    assert.deepEqual(
        opFor(ops, T.bracket).after.closedAt,
        date("2023-04-01T20:00:00Z")
    )
})

test("liga: closedAt = máximo playedAt con su precisión", () => {
    const { ops } = runPlan(fixture())
    const op = opFor(ops, T.league)
    assert.deepEqual(op.after.startedAt, date("2024-01-05T20:00:00Z"))
    assert.equal(op.after.startedAtPrecision, "day")
    assert.deepEqual(op.after.closedAt, date("2024-03-05T20:00:00Z"))
    assert.equal(op.after.closedAtPrecision, "month")
})

test("legacy sin partidos: createdAt con precisión year en las dos fechas", () => {
    const { ops, report } = runPlan(fixture())
    const op = opFor(ops, T.legacy)
    assert.equal(op.group, "legacy")
    assert.deepEqual(op.after, {
        startedAt: date("2017-01-01T10:00:00Z"),
        startedAtPrecision: "year",
        closedAt: date("2017-01-01T10:00:00Z"),
        closedAtPrecision: "year",
    })
    assert.ok(findCheck(report, "legacy").ok)
})

test("sin jugados y no legacy: sin cambios; en curso: sólo startedAt", () => {
    const { ops } = runPlan(fixture())
    assert.equal(opFor(ops, T.pending), undefined)
    assert.deepEqual(Object.keys(opFor(ops, T.running).after), [
        "startedAt",
        "startedAtPrecision",
    ])
})

test("checks: finalizado sin closedAt, closedAt < startedAt y jugados sin playedAt", () => {
    const snapshot = fixture()
    snapshot.tournaments.push({
        _id: new ObjectId("400000000000000000000009"),
        name: "Cerrado vacío",
        format: "league",
        ongoing: false,
        startedAt: date("2024-05-01T00:00:00Z"),
    })
    snapshot.tournaments.push({
        _id: new ObjectId("40000000000000000000000a"),
        name: "Invertido",
        format: "league",
        ongoing: true,
        startedAt: date("2024-05-01T00:00:00Z"),
        closedAt: date("2024-04-01T00:00:00Z"),
    })
    delete snapshot.matches[0].playedAt
    const { report } = runPlan(snapshot)
    assert.equal(findCheck(report, "tienen closedAt").ok, false)
    assert.equal(findCheck(report, "anterior a su startedAt").ok, false)
    assert.equal(findCheck(report, "sin playedAt").ok, false)

    const broken = fixture()
    broken.tournaments[2].createdAt = undefined
    assert.equal(findCheck(runPlan(broken).report, "legacy").ok, false)
})

test("idempotencia y rollback genérico", () => {
    const snapshot = fixture()
    const first = runPlan(snapshot)
    const simulated = applyOpsInMemory(snapshot, first.ops)
    assert.equal(runPlan(simulated).ops.length, 0)

    // Un valor distinto se corrige con filtro sobre el valor previo.
    const edited = cloneSnapshot(simulated)
    edited.tournaments[1].closedAtPrecision = "exact"
    const fix = runPlan(edited).ops
    assert.equal(fix.length, 1)
    assert.deepEqual(fix[0].update, { $set: { closedAtPrecision: "month" } })
    assert.deepEqual(fix[0].filter, {
        _id: T.league,
        closedAtPrecision: "exact",
    })

    const rollbackOps = buildRollbackOps({
        migrationId: m3.id,
        runId: "run",
        database: "apa-staging",
        entries: first.ops.map(({ _id, collection, before, after }) => ({
            _id,
            collection,
            before,
            after,
        })),
    })
    assert.deepEqual(applyOpsInMemory(simulated, rollbackOps), snapshot)
})

test("dependencias simuladas: usa playedAt de M2, vínculos de M7 y avisa cierres desde agregados tardíos", () => {
    const sle = new ObjectId("400000000000000000000010")
    const oid = (isoDate, n) =>
        new ObjectId(
            Math.floor(new Date(isoDate).getTime() / 1000)
                .toString(16)
                .padStart(8, "0") + n.toString(16).padStart(16, "0")
        )
    const regular = match(sle, {
        _id: oid("2022-05-01T20:00:00Z", 1),
        updatedAt: date("2022-05-01T20:00:00Z"),
    })
    const semi = match(sle, {
        _id: oid("2022-05-20T20:00:00Z", 2),
        type: "playoff",
        playoff_id: 13,
        updatedAt: date("2022-05-20T20:00:00Z"),
    })
    // Final cargada un año después: agregado tardío para M2.
    const final = match(sle, {
        _id: oid("2023-05-08T03:40:05Z", 3),
        type: "playoff",
        playoff_id: 15,
        valid: false,
        updatedAt: date("2023-05-08T03:40:05Z"),
    })
    const linked = [0, 1].map((n) => ({
        _id: oid(`2023-10-2${n}T20:00:00Z`, 10 + n),
        tournament: { name: LINK_NAME },
        type: "regular",
        played: true,
        updatedAt: date(`2023-10-2${n}T22:00:00Z`),
    }))
    const snapshot = {
        matches: [regular, semi, final, ...linked],
        tournaments: [
            {
                _id: sle,
                name: "Superliga",
                format: "league_playin_playoff",
                ongoing: false,
            },
            {
                _id: T.linked,
                name: LINK_NAME,
                format: "league_playin_playoff",
                ongoing: false,
                valid: false,
            },
        ],
    }
    const overrides = {
        version: 1,
        objectIdEra: {
            allMatchesTournamentIds: [String(sle)],
            knockoutOnlyTournamentIds: [],
        },
        groups: [],
        manualMatchDates: [],
    }
    const simulate = (m3Overrides) => {
        const selection = [
            m2.createMigration({ overrides }),
            m7.createMigration({
                expectedOutcomeFixes: {},
                closeTournamentIds: [],
                linkByName: [LINK_NAME],
            }),
            m3.createMigration({
                linkByName: [LINK_NAME],
                overrides: m3Overrides,
            }),
        ].map((migration) => ({ migration, role: "target" }))
        const { results } = runPlans({
            selection,
            snapshot,
            simulate: true,
            context: { mode: "dry-run" },
        })
        return results.find((item) => item.id === m3.id)
    }
    const m3Result = simulate(NO_OVERRIDES)
    const sleOp = opFor(m3Result.ops, sle)
    assert.deepEqual(sleOp.after.startedAt, date("2022-05-01T20:00:00Z"))
    assert.equal(sleOp.after.startedAtPrecision, "exact")
    assert.deepEqual(sleOp.after.closedAt, date("2023-05-08T03:40:05Z"))

    const linkedOp = opFor(m3Result.ops, T.linked)
    assert.deepEqual(linkedOp.after.startedAt, date("2023-10-20T22:00:00Z"))
    assert.deepEqual(linkedOp.after.closedAt, date("2023-10-21T22:00:00Z"))
    assert.ok(findCheck(m3Result.report, "vinculados por nombre").ok)

    const item = m3Result.report.needsConfirmation.find(
        (entry) => entry.kind === "closedAtFromLateAddition"
    )
    assert.deepEqual(item.ids, [String(sle), String(final._id)])
    assert.match(item.suggestion, /2022-05-20T20:00:00.000Z/)

    // Override explícito (como la Superliga Europea 2022): cierra con la
    // semifinal, el último partido real, y ya no queda nada a confirmar.
    const withOverride = simulate({
        tournamentClosedAt: [
            { tournamentId: String(sle), matchId: String(semi._id) },
        ],
    })
    const overridden = opFor(withOverride.ops, sle)
    assert.deepEqual(overridden.after.closedAt, date("2022-05-20T20:00:00Z"))
    assert.equal(overridden.after.closedAtPrecision, "exact")
    assert.match(overridden.rule, /closedAt=closedAt override/)
    assert.ok(findCheck(withOverride.report, "closedAt overrides").ok)
    assert.deepEqual(withOverride.report.needsConfirmation, [])
    const [evidence] = withOverride.report.evidence.closedAtOverrides
    assert.equal(evidence.matchId, String(semi._id))
    assert.equal(evidence.closedAt, "2022-05-20T20:00:00.000Z")
    assert.deepEqual(
        evidence.laterMatches.map((later) => [later.matchId, later.valid]),
        [[String(final._id), false]]
    )
    // Sin override, el resto de los torneos no cambia.
    assert.deepEqual(
        opFor(withOverride.ops, T.linked).after,
        opFor(m3Result.ops, T.linked).after
    )

    // El partido fuente tiene que ser el último válido: si apunta al
    // regular (hay una semi válida después) bloquea.
    const notLast = simulate({
        tournamentClosedAt: [
            { tournamentId: String(sle), matchId: String(regular._id) },
        ],
    })
    assert.equal(findCheck(notLast.report, "closedAt overrides").ok, false)
    assert.match(
        findCheck(notLast.report, "closedAt overrides").detail,
        new RegExp(String(semi._id))
    )
    // Partido de otro torneo o torneo inexistente: bloquea.
    const wrongMatch = simulate({
        tournamentClosedAt: [
            { tournamentId: String(sle), matchId: String(linked[0]._id) },
        ],
    })
    assert.equal(findCheck(wrongMatch.report, "closedAt overrides").ok, false)
    const missingTournament = simulate({
        tournamentClosedAt: [
            {
                tournamentId: "4fffffffffffffffffffffff",
                matchId: String(semi._id),
            },
        ],
    })
    assert.equal(
        findCheck(missingTournament.report, "closedAt overrides").ok,
        false
    )

    // Sin la simulación de M2/M7 no hay fechas de partidos.
    const alone = runPlan(snapshot)
    assert.equal(findCheck(alone.report, "sin playedAt").ok, false)
    assert.equal(findCheck(alone.report, "vinculados por nombre").ok, false)
    assert.deepEqual(m3.dependsOn, [m2.id, m7.id])
})

test("por default usa el closedAt override versionado de la Superliga Europea 2022", () => {
    const sle = new ObjectId("625f32c9cfe012fb71aae3af")
    const semi = new ObjectId("62c381744304d652a2555afb")
    const lateFinal = new ObjectId("64586f153a3919852eac726f")
    const snapshot = {
        matches: [
            match(sle, {
                playedAt: date("2022-04-23T04:45:34Z"),
                playedAtPrecision: "exact",
            }),
            match(sle, {
                _id: semi,
                type: "playoff",
                playoff_id: 13,
                playedAt: semi.getTimestamp(),
                playedAtPrecision: "exact",
            }),
            match(sle, {
                _id: lateFinal,
                type: "playoff",
                playoff_id: 15,
                valid: false,
                playedAt: lateFinal.getTimestamp(),
                playedAtPrecision: "exact",
            }),
        ],
        tournaments: [
            {
                _id: sle,
                name: "Superliga Europea 2022",
                format: "league_playin_playoff",
                ongoing: false,
            },
        ],
    }
    const { ops, report } = m3
        .createMigration({ linkByName: [] })
        .plan(snapshot, {})
    assert.ok(findCheck(report, "closedAt overrides").ok)
    assert.deepEqual(
        opFor(ops, sle).after.closedAt,
        new Date("2022-07-05T00:10:28.000Z")
    )
})

test("el plan es puro", () => {
    const snapshot = fixture()
    const copy = cloneSnapshot(snapshot)
    runPlan(snapshot)
    assert.deepEqual(snapshot, copy)
})

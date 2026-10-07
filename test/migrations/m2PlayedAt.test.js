const assert = require("node:assert/strict")
const test = require("node:test")

const { ObjectId } = require("mongoose").mongo

const m2 = require("../../scripts/migrations/001-m2-played-at")
const {
    ABSENT,
    applyOpsInMemory,
    assertValidOps,
    cloneSnapshot,
} = require("../../scripts/migrations/lib/memory")
const { buildRollbackOps } = require("../../scripts/migrations/lib/rollback")
const { comparePlayedAtDesc } = require("../../utils/playedAt")

const { GROUP_KEYS, buildContext, proposePlayedAt } = m2

// ObjectId con timestamp controlado y contador inventado.
const oid = (isoDate, n = 0) =>
    new ObjectId(
        Math.floor(new Date(isoDate).getTime() / 1000)
            .toString(16)
            .padStart(8, "0") + n.toString(16).padStart(16, "0")
    )
const date = (value) => new Date(value)
const ms = (value) => new Date(value).getTime()

const T = Object.freeze({
    argentino: "100000000000000000000001",
    chempions: "100000000000000000000002",
    italo: "100000000000000000000003",
    worldCup: "100000000000000000000004",
    sli: "100000000000000000000005",
    sle: "100000000000000000000006",
    twoLegged: "100000000000000000000007",
    other: "100000000000000000000008",
})

const match = (fields) => ({
    type: "regular",
    played: true,
    ...fields,
    tournament: { id: fields.tournament, name: "Torneo" },
})

const baseOverrides = (extra = {}) => ({
    version: 1,
    timezoneNote: "ART = UTC-3 sin DST",
    objectIdEra: { allMatchesTournamentIds: [], knockoutOnlyTournamentIds: [] },
    groups: [],
    twoLeggedLeg1Repair: {
        tournamentIds: [T.twoLegged],
        maxGapSeconds: 5,
        offsetSeconds: 1,
        precision: "approx",
    },
    manualMatchDates: [],
    ...extra,
})

const argentinoGroup = (expectedCount) => ({
    key: GROUP_KEYS.argentino,
    tournamentId: T.argentino,
    strategy: "linearSpread",
    from: "2021-11-30T15:00:00.000Z",
    to: "2022-03-31T15:00:00.000Z",
    firstPrecision: "day",
    middlePrecision: "approx",
    lastPrecision: "month",
    expectedCount,
})

const runPlan = (snapshot, overrides) =>
    m2.createMigration({ overrides }).plan(snapshot, { mode: "dry-run" })

const findCheck = (report, fragment) => {
    const found = report.checks.find((item) => item.name.includes(fragment))
    assert.ok(found, `no hay check con "${fragment}"`)
    return found
}

const failedChecks = (report) =>
    report.checks.filter((item) => !item.ok).map((item) => item.name)

const opFor = (ops, id) => ops.find((op) => String(op._id) === String(id))

/*
 * Fixture con todos los grupos: con él todos los checks dan ok. Cada test de
 * "check roto" muta una copia.
 */
const fullFixture = () => {
    const matches = []
    const argentino = [0, 1, 2, 3].map((n) =>
        match({
            _id: oid("2022-04-19T02:00:00Z", 0x100 + n),
            tournament: T.argentino,
            updatedAt: date("2022-04-19T02:30:00Z"),
        })
    )
    const chempions = [0, 1, 2].map((n) =>
        match({
            _id: oid("2023-05-20T00:00:00Z", 0x200 + n),
            tournament: T.chempions,
            updatedAt: date("2023-05-21T02:00:00Z"),
        })
    )
    const italoMembers = [0, 1, 2].map((n) =>
        match({
            _id: oid("2022-11-19T19:03:14Z", 0x300 + n),
            tournament: T.italo,
            updatedAt: date("2022-11-19T19:03:14Z"),
        })
    )
    const italoRest = [
        match({
            _id: oid("2022-11-19T19:03:14Z", 0x310),
            tournament: T.italo,
            updatedAt: date("2023-05-03T20:58:02Z"),
        }),
        match({
            _id: oid("2022-11-19T19:03:14Z", 0x311),
            tournament: T.italo,
            played: false,
            updatedAt: date("2022-11-19T19:03:14Z"),
        }),
    ]
    const worldCupGroups = [0, 1, 2].map((n) =>
        match({
            _id: oid("2022-11-18T02:36:18Z", 0x400 + n),
            tournament: T.worldCup,
            updatedAt: date("2022-11-18T02:40:00Z"),
        })
    )
    const worldCupKnockouts = [0, 1].map((n) =>
        match({
            _id: oid(`2022-12-2${3 + n}T21:44:47Z`, 0x410 + n),
            tournament: T.worldCup,
            type: "playoff",
            playoff_id: 14 + n,
            updatedAt: date("2023-02-24T23:50:53Z"),
        })
    )
    const sliPostman = [0, 1].map((n) =>
        match({
            _id: oid("2023-05-11T18:11:41Z", 0x500 + n),
            tournament: T.sli,
            group: "A",
            teamP1: { id: `${10 + n}` },
            teamP2: { id: `${20 + n}` },
            updatedAt: date("2023-05-11T18:20:00Z"),
        })
    )
    const sliRest = [0, 1].map((n) =>
        match({
            _id: oid(`2022-07-1${2 + n}T22:00:00Z`, 0x510 + n),
            tournament: T.sli,
            group: "A",
            teamP1: { id: "10" },
            teamP2: { id: `${30 + n}` },
            updatedAt: date("2023-01-01T00:00:00Z"),
        })
    )
    const sle = [0, 1].map((n) =>
        match({
            _id: oid(`2022-04-2${3 + n}T04:45:34Z`, 0x600 + n),
            tournament: T.sle,
            updatedAt: date("2022-04-25T00:00:00Z"),
        })
    )
    const other = [
        match({
            _id: oid("2024-01-01T00:00:00Z", 0x800),
            tournament: T.other,
            updatedAt: date("2024-02-01T20:00:00Z"),
        }),
    ]
    matches.push(
        ...argentino,
        ...chempions,
        ...italoMembers,
        ...italoRest,
        ...worldCupGroups,
        ...worldCupKnockouts,
        ...sliPostman,
        ...sliRest,
        ...sle,
        ...other
    )
    matches.sort((a, b) => (String(a._id) < String(b._id) ? -1 : 1))

    const overrides = baseOverrides({
        objectIdEra: {
            allMatchesTournamentIds: [T.sle, T.sli],
            knockoutOnlyTournamentIds: [T.worldCup],
        },
        groups: [
            argentinoGroup(4),
            {
                key: GROUP_KEYS.chempions,
                tournamentId: T.chempions,
                strategy: "fixedInstant",
                at: "2019-07-09T10:00:00.000Z",
                precision: "year",
                expectedCount: 3,
            },
            {
                key: GROUP_KEYS.italo,
                tournamentId: T.italo,
                strategy: "fixedInstant",
                at: "2022-11-19T19:03:13.000Z",
                precision: "approx",
                fixtureInstant: "2022-11-19T19:03:14.000Z",
                matchIds: italoMembers.map((item) => String(item._id)),
                expectedCount: 3,
            },
            {
                key: GROUP_KEYS.worldCupGroups,
                tournamentId: T.worldCup,
                strategy: "objectIdInstant",
                precision: "approx",
                matchIds: worldCupGroups.map((item) => String(item._id)),
                expectedCount: 3,
            },
            {
                key: GROUP_KEYS.sliPostman,
                tournamentId: T.sli,
                strategy: "fixedInstant",
                at: "2022-07-11T22:38:07.000Z",
                precision: "approx",
                matchIds: sliPostman.map((item) => String(item._id)),
                expectedCount: 2,
            },
        ],
    })

    return {
        snapshot: {
            matches,
            tournaments: Object.entries(T).map(([key, id]) => ({
                _id: new ObjectId(id),
                name: `Torneo ${key}`,
                format: "league",
                ongoing: true,
            })),
        },
        overrides,
        ids: {
            argentino,
            chempions,
            italoMembers,
            italoRest,
            worldCupGroups,
            worldCupKnockouts,
            sliPostman,
            sliRest,
            sle,
            other,
        },
    }
}

const clone = (value) => cloneSnapshot(value)

test("overrides versionados: 89/48/18 ids, reparación de ida y vuelta y fechas manuales exactas", () => {
    const overrides = require("../../scripts/migrations/data/played-at-overrides.json")
    assert.deepEqual(m2.validateOverrides(overrides), [])
    const byKey = Object.fromEntries(
        overrides.groups.map((group) => [group.key, group])
    )
    assert.equal(byKey[GROUP_KEYS.italo].matchIds.length, 89)
    assert.equal(byKey[GROUP_KEYS.worldCupGroups].matchIds.length, 48)
    // 17 del 2023-05-11 + el regular del grupo A re-cargado el 2023-05-13.
    const postman = byKey[GROUP_KEYS.sliPostman]
    assert.equal(postman.matchIds.length, 18)
    assert.equal(postman.expectedCount, 18)
    assert.ok(postman.matchIds.includes("645fa72936fe5e01f176a87c"))
    assert.equal(new Set(postman.matchIds).size, 18)
    assert.deepEqual(m2.POSTMAN_REENTRY_DAYS, ["2023-05-11", "2023-05-13"])
    // closedAt explícito de la Superliga Europea 2022 (lo usa M3).
    assert.deepEqual(
        overrides.tournamentClosedAt.map(({ tournamentId, matchId }) => ({
            tournamentId,
            matchId,
        })),
        [
            {
                tournamentId: "625f32c9cfe012fb71aae3af",
                matchId: "62c381744304d652a2555afb",
            },
        ]
    )
    overrides.groups.forEach((group) => {
        if (group.matchIds) {
            assert.equal(group.matchIds.length, group.expectedCount)
        }
    })
    assert.deepEqual(overrides.twoLeggedLeg1Repair.tournamentIds, [
        "6ac43e5daf82ded99b21b660",
    ])
    assert.equal(overrides.manualMatchDates.length, 2)
    overrides.manualMatchDates.forEach((entry) => {
        assert.equal(entry.precision, "exact")
        assert.match(entry.matchId, /^[0-9a-f]{24}$/)
        assert.deepEqual(Object.keys(entry).sort(), [
            "comment",
            "matchId",
            "playedAt",
            "precision",
        ])
    })
})

test("Torneo Argentino: spread lineal con extremos, precisiones, segundos enteros y determinismo", () => {
    const n = 209
    const matches = Array.from({ length: n }, (_, index) =>
        match({
            // _id desordenados respecto del array: el spread va por _id asc.
            _id: oid("2022-04-19T01:26:08Z", (index * 37) % n),
            tournament: T.argentino,
            updatedAt: date("2022-04-19T02:37:03Z"),
        })
    )
    const snapshot = { matches, tournaments: [] }
    const overrides = baseOverrides({ groups: [argentinoGroup(n)] })

    const first = runPlan(snapshot, overrides)
    const second = runPlan(clone(snapshot), overrides)
    assert.equal(first.ops.length, n)
    assert.deepEqual(
        first.ops.map((op) => [String(op._id), op.after.playedAt.getTime()]),
        second.ops.map((op) => [String(op._id), op.after.playedAt.getTime()])
    )

    const sorted = [...first.ops].sort((a, b) =>
        String(a._id) < String(b._id) ? -1 : 1
    )
    assert.equal(
        sorted[0].after.playedAt.toISOString(),
        "2021-11-30T15:00:00.000Z"
    )
    assert.equal(sorted[0].after.playedAtPrecision, "day")
    assert.equal(
        sorted[n - 1].after.playedAt.toISOString(),
        "2022-03-31T15:00:00.000Z"
    )
    assert.equal(sorted[n - 1].after.playedAtPrecision, "month")
    sorted.slice(1, -1).forEach((op) => {
        assert.equal(op.after.playedAtPrecision, "approx")
    })
    sorted.forEach((op, index) => {
        assert.equal(op.after.playedAt.getTime() % 1000, 0)
        if (index > 0) {
            assert.ok(
                op.after.playedAt >= sorted[index - 1].after.playedAt,
                "no decreciente"
            )
        }
    })
    assert.ok(findCheck(first.report, "209 partidos").ok)
    assert.ok(findCheck(first.report, "no decrecientes").ok)
})

test("fixedInstant: mismo instante para todos y el orden queda por _id", () => {
    const { snapshot, overrides, ids } = fullFixture()
    const { ops } = runPlan(snapshot, overrides)
    const chempions = ids.chempions.map((item) => opFor(ops, item._id))
    chempions.forEach((op) => {
        assert.equal(
            op.after.playedAt.toISOString(),
            "2019-07-09T10:00:00.000Z"
        )
        assert.equal(op.after.playedAtPrecision, "year")
    })

    const simulated = applyOpsInMemory(snapshot, ops)
    const ordered = simulated.matches
        .filter((item) => String(item.tournament.id) === T.chempions)
        .sort(comparePlayedAtDesc)
        .map((item) => String(item._id))
    assert.deepEqual(
        ordered,
        ids.chempions.map((item) => String(item._id)).reverse()
    )

    ids.italoMembers.forEach((item) => {
        const op = opFor(ops, item._id)
        assert.equal(
            op.after.playedAt.toISOString(),
            "2022-11-19T19:03:13.000Z"
        )
        assert.equal(op.after.playedAtPrecision, "approx")
    })
})

test("precedencia: manual > ida y vuelta > matchIds > torneo > era ObjectId > default", () => {
    const { snapshot, overrides, ids } = fullFixture()
    const worldCupMember = ids.worldCupGroups[0]
    const manualOverrides = {
        ...overrides,
        manualMatchDates: [
            {
                matchId: String(worldCupMember._id),
                playedAt: "2022-11-20T12:00:00.000Z",
                precision: "day",
            },
        ],
    }
    const ctx = buildContext(snapshot, manualOverrides)
    const propose = (item) => proposePlayedAt(item, ctx)

    const manual = propose(worldCupMember)
    assert.equal(manual.rule, "manualMatchDates")
    assert.equal(manual.time, ms("2022-11-20T12:00:00Z"))
    assert.equal(manual.precision, "day")

    const grouped = propose(ids.worldCupGroups[1])
    assert.equal(grouped.group, GROUP_KEYS.worldCupGroups)
    assert.equal(
        grouped.time,
        ids.worldCupGroups[1]._id.getTimestamp().getTime()
    )
    assert.equal(grouped.precision, "approx")

    // Postman (matchIds) gana sobre la era ObjectId de su torneo.
    assert.equal(propose(ids.sliPostman[0]).group, GROUP_KEYS.sliPostman)
    const era = propose(ids.sliRest[0])
    assert.equal(era.group, "objectid-era")
    assert.equal(era.precision, "exact")
    assert.equal(era.time, ids.sliRest[0]._id.getTimestamp().getTime())

    // Knockouts del Mundial: era ObjectId sólo para los no regular.
    assert.equal(propose(ids.worldCupKnockouts[0]).group, "objectid-era")

    assert.equal(propose(ids.argentino[0]).group, GROUP_KEYS.argentino)
    const fallback = propose(ids.other[0])
    assert.equal(fallback.group, "default")
    assert.equal(fallback.time, ms("2024-02-01T20:00:00Z"))
    assert.equal(fallback.precision, "exact")

    // El manual saca al partido del conteo de su grupo.
    const { report } = runPlan(snapshot, manualOverrides)
    assert.equal(findCheck(report, `${GROUP_KEYS.worldCupGroups}: 3`).ok, false)

    // No jugado: sin propuesta.
    assert.equal(propose({ ...ids.other[0], played: false }), null)
})

const twoLeggedSnapshot = (leg1UpdatedAt, extra = {}) => {
    const leg1 = {
        _id: oid("2026-10-06T00:18:37Z", 1),
        tournament: { id: T.twoLegged, name: "Copa" },
        type: "playoff",
        playoff_id: 6,
        leg: 1,
        played: true,
        scoreP1: 3,
        scoreP2: 4,
        updatedAt: date(leg1UpdatedAt),
        ...extra,
    }
    const leg2 = {
        _id: oid("2026-10-06T00:18:37Z", 2),
        tournament: { id: T.twoLegged, name: "Copa" },
        type: "playoff",
        playoff_id: 6,
        leg: 2,
        played: true,
        updatedAt: date("2026-10-06T19:35:00.000Z"),
    }
    return {
        leg1,
        leg2,
        snapshot: {
            matches: [leg1, leg2],
            tournaments: [
                {
                    _id: new ObjectId(T.twoLegged),
                    name: "Copa",
                    format: "playoff",
                    ongoing: true,
                },
            ],
        },
    }
}

test("ida y vuelta: ida pegada (igual o dentro del gap) se repara; fuera del gap queda default", () => {
    const cases = [
        ["2026-10-06T19:35:00.000Z", true],
        ["2026-10-06T19:35:04.000Z", true],
        ["2026-10-06T19:34:56.000Z", true],
        ["2026-10-06T19:34:50.000Z", false],
        ["2026-10-06T19:35:10.000Z", false],
    ]
    cases.forEach(([updatedAt, repaired]) => {
        const { snapshot, leg1 } = twoLeggedSnapshot(updatedAt)
        const { ops, report } = runPlan(snapshot, baseOverrides())
        const op = opFor(ops, leg1._id)
        if (repaired) {
            assert.equal(op.group, "two-legged-leg1-repair", updatedAt)
            assert.equal(
                op.after.playedAt.toISOString(),
                "2026-10-06T19:34:59.000Z"
            )
            assert.equal(op.after.playedAtPrecision, "approx")
            const item = report.needsConfirmation.find(
                (entry) => entry.kind === "twoLeggedLeg1Repair"
            )
            assert.deepEqual(item.ids, [String(leg1._id)])
            assert.deepEqual(report.templates.manualMatchDates, [
                {
                    matchId: String(leg1._id),
                    playedAt: null,
                    precision: "exact",
                },
            ])
        } else {
            assert.equal(op.group, "default", updatedAt)
            assert.equal(op.after.playedAt.getTime(), ms(updatedAt))
        }
    })

    // Un playedAt exacto que ya cargó el writer no se pisa.
    const { snapshot, leg1 } = twoLeggedSnapshot("2026-10-06T19:35:00.000Z", {
        playedAt: date("2026-10-06T18:40:00.000Z"),
        playedAtPrecision: "exact",
    })
    assert.equal(
        opFor(runPlan(snapshot, baseOverrides()).ops, leg1._id),
        undefined
    )
})

test("manualMatchDates: con fecha gana sobre la reparación (exact); con null se ignora", () => {
    const { snapshot, leg1 } = twoLeggedSnapshot("2026-10-06T19:35:00.000Z")
    const withDate = baseOverrides({
        manualMatchDates: [
            {
                matchId: String(leg1._id),
                playedAt: "2026-10-06T18:40:00.000Z",
                precision: "exact",
            },
        ],
    })
    const { ops, report } = runPlan(snapshot, withDate)
    const op = opFor(ops, leg1._id)
    assert.equal(op.group, "manual-match-dates")
    assert.equal(op.after.playedAt.toISOString(), "2026-10-06T18:40:00.000Z")
    assert.equal(op.after.playedAtPrecision, "exact")
    assert.ok(findCheck(report, "anterior a su vuelta").ok)
    assert.ok(findCheck(report, "existentes y jugados").ok)
    const [evidence] = report.evidence.manualMatchDates
    assert.equal(evidence.scoreP1, 3)
    assert.equal(
        evidence.laterLegs[0].proposedPlayedAt,
        "2026-10-06T19:35:00.000Z"
    )
    // La ida afectada se reporta igual, aunque la cubra el manual: como
    // nota, porque ya tiene fecha confirmada.
    assert.ok(
        report.notes.some(
            (item) =>
                item.kind === "twoLeggedLeg1Repair" &&
                item.ids.includes(String(leg1._id))
        )
    )
    assert.equal(
        report.needsConfirmation.filter(
            (item) => item.kind === "twoLeggedLeg1Repair"
        ).length,
        0
    )
    assert.deepEqual(report.templates.manualMatchDates, [])

    const withNull = baseOverrides({
        manualMatchDates: [
            { matchId: String(leg1._id), playedAt: null, precision: "exact" },
        ],
    })
    assert.equal(
        opFor(runPlan(snapshot, withNull).ops, leg1._id).group,
        "two-legged-leg1-repair"
    )
})

test("idempotencia: el plan sobre el snapshot ya simulado da 0 ops", () => {
    const { snapshot, overrides } = fullFixture()
    const first = runPlan(snapshot, overrides)
    assert.ok(first.ops.length > 0)
    assertValidOps(first.ops)
    assert.deepEqual(failedChecks(first.report), [])

    const simulated = applyOpsInMemory(snapshot, first.ops)
    const second = runPlan(simulated, overrides)
    assert.equal(second.ops.length, 0)
    assert.deepEqual(failedChecks(second.report), [])

    const legs = twoLeggedSnapshot("2026-10-06T19:35:00.000Z")
    const repaired = runPlan(legs.snapshot, baseOverrides())
    assert.equal(
        runPlan(applyOpsInMemory(legs.snapshot, repaired.ops), baseOverrides())
            .ops.length,
        0
    )
})

test("filtros: default sólo si falta playedAt; las excepciones corrigen si difiere", () => {
    const { snapshot, overrides, ids } = fullFixture()
    const other = snapshot.matches.find(
        (item) => String(item._id) === String(ids.other[0]._id)
    )
    other.playedAt = date("2024-01-31T00:00:00Z")
    other.playedAtPrecision = "exact"
    const chempion = snapshot.matches.find(
        (item) => String(item._id) === String(ids.chempions[0]._id)
    )
    chempion.playedAt = date("2023-05-21T02:00:00Z")
    chempion.playedAtPrecision = "exact"

    const { ops } = runPlan(snapshot, overrides)
    assert.equal(opFor(ops, other._id), undefined)
    const fix = opFor(ops, chempion._id)
    assert.equal(fix.before.playedAt.toISOString(), "2023-05-21T02:00:00.000Z")
    assert.equal(fix.after.playedAtPrecision, "year")
    assert.deepEqual(Object.keys(fix.filter.$or[0]), ["playedAt"])
    assert.equal(fix.filter.played, true)

    const fallback = opFor(ops, ids.sle[0]._id)
    assert.ok(fallback)
    // eslint-disable-next-line no-unused-vars
    const { playedAt, playedAtPrecision, ...pending } = ids.other[0]
    const defaultOp = runPlan(
        { matches: [pending], tournaments: [] },
        baseOverrides()
    ).ops[0]
    assert.deepEqual(defaultOp.filter, {
        _id: ids.other[0]._id,
        played: true,
        playedAt: { $exists: false },
    })
})

test("rollback genérico: $unset de playedAt/precision y vuelve al snapshot original", () => {
    const { snapshot, overrides } = fullFixture()
    const { ops } = runPlan(snapshot, overrides)
    const simulated = applyOpsInMemory(snapshot, ops)
    const rollbackOps = buildRollbackOps({
        migrationId: m2.id,
        runId: "run",
        database: "apa-staging",
        entries: ops.map(({ _id, collection, before, after }) => ({
            _id,
            collection,
            before,
            after,
        })),
    })
    rollbackOps.forEach((op) => {
        assert.deepEqual(op.update, {
            $unset: { playedAt: "", playedAtPrecision: "" },
        })
        assert.equal(op.after.playedAt, ABSENT)
    })
    assert.deepEqual(applyOpsInMemory(simulated, rollbackOps), snapshot)
})

test("notas: tandas de >= 5 resultados con gaps < 5 min, fuera de los grupos (informativas)", () => {
    const at = (minutes) =>
        new Date(ms("2024-03-01T20:00:00Z") + minutes * 60 * 1000)
    const build = (count, tournament = T.other) =>
        Array.from({ length: count }, (_, index) =>
            match({
                _id: oid("2024-02-01T00:00:00Z", 0x900 + index),
                tournament,
                updatedAt: at(index * 4),
            })
        )

    const five = runPlan(
        { matches: build(5), tournaments: [] },
        baseOverrides()
    )
    const batch = five.report.notes.filter((item) => item.kind === "batch")
    assert.equal(batch.length, 1)
    assert.equal(batch[0].ids.length, 5)
    assert.equal(batch[0].informational, true)
    // Confirmado por el usuario: no se pide confirmación por las tandas.
    assert.deepEqual(five.report.needsConfirmation, [])
    // Regla default intacta: fechas tal cual (updatedAt).
    five.ops.forEach((op) => assert.equal(op.group, "default"))

    const four = runPlan(
        { matches: build(4), tournaments: [] },
        baseOverrides()
    )
    assert.equal(
        four.report.notes.filter((item) => item.kind === "batch").length,
        0
    )

    // Los de un grupo por torneo (regla 4) no cuentan como tanda.
    const grouped = runPlan(
        { matches: build(6, T.argentino), tournaments: [] },
        baseOverrides({ groups: [argentinoGroup(6)] })
    )
    assert.equal(
        grouped.report.notes.filter((item) => item.kind === "batch").length,
        0
    )
})

test("notas: agregados tardíos después de la final o tras >30 días en la era ObjectId (informativas)", () => {
    const tournamentId = T.sle
    const regular = [0, 1].map((n) =>
        match({
            _id: oid(`2022-05-0${1 + n}T20:00:00Z`, 0xa00 + n),
            tournament: tournamentId,
            updatedAt: date(`2022-05-0${1 + n}T20:00:00Z`),
        })
    )
    const final = match({
        _id: oid("2022-07-05T00:10:00Z", 0xa10),
        tournament: tournamentId,
        type: "playoff",
        playoff_id: 15,
        updatedAt: date("2022-07-05T00:10:00Z"),
    })
    const afterFinal = match({
        _id: oid("2023-05-08T03:45:39Z", 0xa11),
        tournament: tournamentId,
        type: "playoff",
        playoff_id: 3,
        valid: false,
        updatedAt: date("2023-05-08T03:45:39Z"),
    })
    const snapshot = {
        matches: [...regular, final, afterFinal],
        tournaments: [
            {
                _id: new ObjectId(tournamentId),
                name: "Superliga",
                format: "league_playin_playoff",
                ongoing: false,
            },
        ],
    }
    const era = baseOverrides({
        objectIdEra: {
            allMatchesTournamentIds: [tournamentId],
            knockoutOnlyTournamentIds: [],
        },
    })
    const { report } = runPlan(snapshot, era)
    const late = report.notes.find((item) => item.kind === "lateAddition")
    // La final está a >30 días del anterior; el otro, creado después de ella.
    assert.deepEqual(late.ids, [String(final._id), String(afterFinal._id)])
    assert.equal(late.tournamentId, tournamentId)
    assert.equal(late.informational, true)
    assert.equal(
        report.needsConfirmation.filter((item) => item.kind === "lateAddition")
            .length,
        0
    )
    assert.ok(
        report.templates.manualMatchDates.some(
            (entry) => entry.matchId === String(afterFinal._id)
        )
    )

    // Fuera de la era ObjectId el salto de días no es evidencia.
    const fixtureEra = runPlan(snapshot, baseOverrides())
    const lateDefault = fixtureEra.report.notes.find(
        (item) => item.kind === "lateAddition"
    )
    assert.deepEqual(lateDefault.ids, [String(afterFinal._id)])

    // Torneo en curso: no se evalúa.
    snapshot.tournaments[0].ongoing = true
    assert.equal(
        runPlan(snapshot, era).report.notes.filter(
            (item) => item.kind === "lateAddition"
        ).length,
        0
    )
})

test("evidencia de la SLI 2022: cruces, partidos por equipo y round-robin", () => {
    const { snapshot, overrides, ids } = fullFixture()
    const { report } = runPlan(snapshot, overrides)
    const evidence = report.evidence.sliPostman
    assert.equal(evidence.matches.length, 2)
    const first = evidence.matches.find(
        (item) => item._id === String(ids.sliPostman[0]._id)
    )
    assert.equal(first.teamP1Id, "10")
    assert.equal(first.pairingElsewhere, 0)
    assert.equal(first.teamMatches.p1, 3)
    assert.equal(
        first.teamFirstCreatedOutsideGroup.p1,
        ids.sliRest[0]._id.getTimestamp().toISOString()
    )
    assert.equal(evidence.roundRobin.A.fromGroup, 2)
    const item = report.notes.find(
        (entry) => entry.kind === "sliPostmanEarlyRounds"
    )
    assert.equal(item.ids.length, 2)
    assert.equal(item.informational, true)
})

test("SLI 2022 Postman: un re-cargado el 2023-05-13 entra al grupo con la misma fecha y precisión", () => {
    const { snapshot, overrides, ids } = fullFixture()
    // Como 645fa72936fe5e01f176a87c: regular del grupo A, creado dos días
    // después que los otros.
    const lateReentry = match({
        _id: oid("2023-05-13T15:05:13Z", 0x520),
        tournament: T.sli,
        group: "A",
        teamP1: { id: "12" },
        teamP2: { id: "22" },
        updatedAt: date("2023-05-13T15:06:00Z"),
    })
    snapshot.matches.push(lateReentry)
    const postman = overrides.groups.find(
        (group) => group.key === GROUP_KEYS.sliPostman
    )
    postman.matchIds.push(String(lateReentry._id))
    postman.expectedCount = 3

    const { ops, report } = runPlan(snapshot, overrides)
    const op = opFor(ops, lateReentry._id)
    assert.equal(op.group, GROUP_KEYS.sliPostman)
    assert.equal(op.after.playedAt.toISOString(), "2022-07-11T22:38:07.000Z")
    assert.equal(op.after.playedAtPrecision, "approx")
    // Misma fecha que los del 2023-05-11: el orden entre ellos es el de carga.
    assert.equal(
        opFor(ops, ids.sliPostman[0]._id).after.playedAt.getTime(),
        op.after.playedAt.getTime()
    )
    assert.ok(findCheck(report, `${GROUP_KEYS.sliPostman}: 3 partidos`).ok)
    assert.ok(
        findCheck(report, "regulares creados el 2023-05-11 o el 2023-05-13").ok
    )
    assert.ok(findCheck(report, "anterior al primer ObjectId del resto").ok)
    assert.equal(report.evidence.sliPostman.matches.length, 3)

    // Otro día (p. ej. 2023-05-14) sigue fallando el check.
    const wrongDay = fullFixture()
    const other = match({
        _id: oid("2023-05-14T15:05:13Z", 0x521),
        tournament: T.sli,
        group: "A",
        updatedAt: date("2023-05-14T15:06:00Z"),
    })
    wrongDay.snapshot.matches.push(other)
    const group = wrongDay.overrides.groups.find(
        (item) => item.key === GROUP_KEYS.sliPostman
    )
    group.matchIds.push(String(other._id))
    group.expectedCount = 3
    assert.equal(
        findCheck(
            runPlan(wrongDay.snapshot, wrongDay.overrides).report,
            "regulares creados el"
        ).ok,
        false
    )
})

test("checks: cada uno falla con un fixture roto", () => {
    const cases = [
        {
            fragment: "overrides válidos",
            mutate: ({ overrides }) => {
                overrides.groups[0].strategy = "otra"
            },
        },
        {
            fragment: `${GROUP_KEYS.chempions}: 4 partidos`,
            mutate: ({ overrides }) => {
                overrides.groups[1].expectedCount = 4
            },
        },
        {
            fragment: `${GROUP_KEYS.italo}: ids existentes`,
            mutate: ({ overrides }) => {
                overrides.groups[2].matchIds.push(
                    String(oid("2022-11-19T19:03:14Z", 0x3ff))
                )
                overrides.groups[2].expectedCount = 3
            },
        },
        {
            fragment: "updatedAt == fixtureInstant",
            mutate: ({ snapshot, ids }) => {
                snapshot.matches.find(
                    (item) => String(item._id) === String(ids.italoRest[0]._id)
                ).updatedAt = date("2022-11-19T19:03:14Z")
            },
        },
        {
            fragment: `${GROUP_KEYS.italo}: anterior al resto`,
            mutate: ({ overrides }) => {
                overrides.groups[2].at = "2023-06-01T00:00:00.000Z"
            },
        },
        {
            fragment: "son todos los regular",
            mutate: ({ overrides }) => {
                overrides.groups[3].matchIds.pop()
                overrides.groups[3].expectedCount = 2
            },
        },
        {
            fragment: "grupos anteriores a los knockouts",
            mutate: ({ snapshot, ids }) => {
                snapshot.matches.find(
                    (item) =>
                        String(item._id) ===
                        String(ids.worldCupKnockouts[0]._id)
                )._id = oid("2022-11-01T00:00:00Z", 0x4ff)
            },
        },
        {
            fragment: "regulares creados el",
            mutate: ({ snapshot, ids }) => {
                snapshot.matches.find(
                    (item) => String(item._id) === String(ids.sliPostman[0]._id)
                ).type = "playin"
            },
        },
        {
            fragment: "anterior al primer ObjectId del resto",
            mutate: ({ overrides }) => {
                overrides.groups[4].at = "2022-08-01T00:00:00.000Z"
            },
        },
        {
            fragment: "anterior a la era ObjectId",
            mutate: ({ overrides }) => {
                overrides.groups[0].to = "2022-05-01T00:00:00.000Z"
            },
        },
        {
            fragment: `${GROUP_KEYS.chempions}: anterior al`,
            mutate: ({ overrides }) => {
                overrides.groups[1].at = "2021-12-01T00:00:00.000Z"
            },
        },
        {
            fragment: "manualMatchDates: partidos existentes",
            mutate: ({ overrides }) => {
                overrides.manualMatchDates.push({
                    matchId: "1f0000000000000000000000",
                    playedAt: "2024-01-01T00:00:00.000Z",
                    precision: "exact",
                })
            },
        },
        {
            fragment: "0 jugados sin playedAt",
            mutate: ({ snapshot, ids }) => {
                delete snapshot.matches.find(
                    (item) => String(item._id) === String(ids.other[0]._id)
                ).updatedAt
            },
        },
    ]

    cases.forEach(({ fragment, mutate }) => {
        const fixture = fullFixture()
        mutate(fixture)
        const { report } = runPlan(fixture.snapshot, fixture.overrides)
        assert.equal(findCheck(report, fragment).ok, false, fragment)
    })

    // Ida con fecha manual posterior a su vuelta.
    const { snapshot, leg1 } = twoLeggedSnapshot("2026-10-06T19:35:00.000Z")
    const late = baseOverrides({
        manualMatchDates: [
            {
                matchId: String(leg1._id),
                playedAt: "2026-10-06T20:00:00.000Z",
                precision: "exact",
            },
        ],
    })
    assert.equal(
        findCheck(runPlan(snapshot, late).report, "anterior a su vuelta").ok,
        false
    )
})

test("el plan es puro: no muta el snapshot recibido", () => {
    const { snapshot, overrides } = fullFixture()
    const copy = clone(snapshot)
    runPlan(snapshot, overrides)
    assert.deepEqual(snapshot, copy)
})

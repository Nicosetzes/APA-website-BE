const assert = require("node:assert/strict")
const test = require("node:test")

const { ObjectId } = require("mongoose").mongo

const m7 = require("../../scripts/migrations/002-m7-point-fixes")
const {
    applyOpsInMemory,
    assertValidOps,
    cloneSnapshot,
} = require("../../scripts/migrations/lib/memory")
const { buildRollbackOps } = require("../../scripts/migrations/lib/rollback")

const ids = {
    stale: new ObjectId("200000000000000000000001"),
    ok: new ObjectId("200000000000000000000002"),
    nullRef: new ObjectId("200000000000000000000003"),
    linkA: new ObjectId("200000000000000000000004"),
    linkB: new ObjectId("200000000000000000000005"),
    other: new ObjectId("200000000000000000000006"),
    cancelled: new ObjectId("300000000000000000000001"),
    homonym: new ObjectId("300000000000000000000002"),
    league: new ObjectId("300000000000000000000003"),
}
const LINK_NAME = "Liga Inventada 2023/24 (I)"

const options = () => ({
    expectedOutcomeFixes: { [String(ids.stale)]: "49" },
    closeTournamentIds: [String(ids.cancelled)],
    linkByName: [LINK_NAME],
})

const side = (player, team) => ({
    player: { id: player, name: `Jugador ${player}` },
    team: { id: team, name: `Equipo ${team}` },
})

const playedMatch = (_id, { p1, p2, scoreP1, scoreP2, outcome }) => ({
    _id,
    tournament: { id: String(ids.league), name: "Liga" },
    type: "playin",
    played: true,
    playerP1: p1.player,
    teamP1: p1.team,
    playerP2: p2.player,
    teamP2: p2.team,
    scoreP1,
    scoreP2,
    outcome,
})

const fixture = () => {
    const p1 = side("u1", "49")
    const p2 = side("u2", "66")
    return {
        matches: [
            // P1 gana 1-0 pero teamThatWon quedó con el id del otro equipo.
            playedMatch(ids.stale, {
                p1,
                p2,
                scoreP1: 1,
                scoreP2: 0,
                outcome: {
                    draw: false,
                    playerThatWon: p1.player,
                    teamThatWon: { id: "66", name: "Equipo 49" },
                    playerThatLost: p2.player,
                    teamThatLost: p2.team,
                    scoreFromTeamThatWon: "1",
                    scoreFromTeamThatLost: "0",
                },
            }),
            playedMatch(ids.ok, {
                p1,
                p2,
                scoreP1: 3,
                scoreP2: 1,
                outcome: {
                    draw: false,
                    playerThatWon: p1.player,
                    teamThatWon: p1.team,
                    playerThatLost: p2.player,
                    teamThatLost: p2.team,
                },
            }),
            {
                _id: ids.nullRef,
                tournament: { id: null, name: null },
                type: "regular",
                played: true,
                scoreP1: 2,
                scoreP2: 2,
                outcome: { draw: true },
            },
            ...[ids.linkA, ids.linkB].map((_id) => ({
                _id,
                tournament: { name: LINK_NAME },
                type: "regular",
                played: true,
            })),
            {
                _id: ids.other,
                tournament: { name: "Otro nombre" },
                type: "regular",
                played: true,
            },
        ],
        tournaments: [
            {
                _id: ids.cancelled,
                name: "Copa cancelada",
                ongoing: true,
                valid: false,
            },
            { _id: ids.homonym, name: LINK_NAME, ongoing: false, valid: false },
            { _id: ids.league, name: "Liga", ongoing: false },
        ],
    }
}

const runPlan = (snapshot, overrides = {}) =>
    m7.createMigration({ ...options(), ...overrides }).plan(snapshot, {})

const opFor = (ops, id) => ops.find((op) => String(op._id) === String(id))
const findCheck = (report, fragment) =>
    report.checks.find((item) => item.name.includes(fragment))
const failedNames = (report) =>
    report.checks.filter((item) => !item.ok).map((item) => item.name)

test("outcome desactualizado: se recalcula desde los lados guardados", () => {
    const { ops, report } = runPlan(fixture())
    assertValidOps(ops)
    const op = opFor(ops, ids.stale)
    assert.equal(op.group, "outcome")
    assert.deepEqual(op.update.$set, {
        "outcome.teamThatWon": { id: "49", name: "Equipo 49" },
    })
    assert.deepEqual(op.filter, {
        _id: ids.stale,
        "outcome.teamThatWon": { id: "66", name: "Equipo 49" },
    })
    assert.equal(opFor(ops, ids.ok), undefined)
    assert.ok(findCheck(report, "exactamente los esperados").ok)
    assert.ok(findCheck(report, "campos e ids esperados").ok)
    assert.deepEqual(report.summary.outcomeFixes, [
        {
            _id: String(ids.stale),
            changedFields: ["teamThatWon"],
            recomputedIds: { teamThatWon: "49" },
            storedIds: { teamThatWon: "66" },
            teamThatWonId: "49",
            teamP1Id: "49",
            teamP2Id: "66",
        },
    ])
})

test("outcome: perdedor desactualizado (aprobado) cambia sólo ese campo; ganador y seeds intactos", () => {
    // Como 63a621a6… (playerThatLost = el del ganador) y 6459a201…
    // (teamThatLost = un equipo que ya no está), ambos valid:false.
    const p1 = side("u1", "10")
    const p2 = side("u2", "13")
    const staleLoserPlayer = new ObjectId("20000000000000000000000a")
    const staleLoserTeam = new ObjectId("20000000000000000000000b")
    const snapshot = fixture()
    snapshot.matches.push(
        {
            ...playedMatch(staleLoserPlayer, {
                p1,
                p2,
                scoreP1: 2,
                scoreP2: 0,
                outcome: {
                    draw: false,
                    playerThatWon: p1.player,
                    teamThatWon: p1.team,
                    playerThatLost: p1.player,
                    teamThatLost: p2.team,
                },
            }),
            type: "playoff",
            playoff_id: 5,
            valid: false,
            // Seeds en los lados y no en el outcome: no se completan.
            seedP1: "1",
            seedP2: "2",
        },
        {
            ...playedMatch(staleLoserTeam, {
                p1: side("u3", "62"),
                p2: side("u4", "49"),
                scoreP1: 0,
                scoreP2: 2,
                outcome: {
                    draw: false,
                    playerThatWon: side("u4", "49").player,
                    teamThatWon: side("u4", "49").team,
                    playerThatLost: side("u3", "62").player,
                    teamThatLost: { id: "44", name: "Equipo 44" },
                },
            }),
            valid: false,
        }
    )
    const approved = {
        [String(ids.stale)]: { teamThatWon: "49" },
        [String(staleLoserPlayer)]: { playerThatLost: "u2" },
        [String(staleLoserTeam)]: { teamThatLost: "62" },
    }
    const { ops, report } = runPlan(snapshot, {
        expectedOutcomeFixes: approved,
    })
    assertValidOps(ops)
    assert.deepEqual(failedNames(report), [])

    const playerOp = opFor(ops, staleLoserPlayer)
    assert.deepEqual(playerOp.update.$set, {
        "outcome.playerThatLost": p2.player,
    })
    assert.deepEqual(playerOp.filter, {
        _id: staleLoserPlayer,
        "outcome.playerThatLost": p1.player,
    })
    const teamOp = opFor(ops, staleLoserTeam)
    assert.deepEqual(teamOp.update.$set, {
        "outcome.teamThatLost": side("u3", "62").team,
    })
    // El ganador nunca se toca en estos dos.
    ;[playerOp, teamOp].forEach((op) => {
        assert.equal("outcome.teamThatWon" in op.update.$set, false)
        assert.equal("outcome.playerThatWon" in op.update.$set, false)
        assert.deepEqual(Object.keys(op.update.$set).length, 1)
    })
    // Los seeds faltantes del playoff quedan diferidos aunque esté aprobado.
    assert.ok(
        report.evidence.outcomeSeedGaps.some(
            (gap) => gap._id === String(staleLoserPlayer)
        )
    )

    // Si el aprobado esperaba otro campo (p. ej. el ganador), bloquea.
    const wrongField = runPlan(snapshot, {
        expectedOutcomeFixes: {
            ...approved,
            [String(staleLoserTeam)]: { teamThatWon: "49" },
        },
    })
    assert.equal(
        findCheck(wrongField.report, "campos e ids esperados").ok,
        false
    )

    // Idempotencia: aplicado, la segunda corrida da 0 ops de outcome.
    const simulated = applyOpsInMemory(snapshot, ops)
    const second = runPlan(simulated, { expectedOutcomeFixes: approved })
    assert.equal(
        second.ops.filter((op) => op.group.includes("outcome")).length,
        0
    )
    assert.deepEqual(failedNames(second.report), [])
})

test("outcome: un conjunto distinto al esperado o un valor distinto falla el check", () => {
    const unexpected = runPlan(fixture(), { expectedOutcomeFixes: {} })
    assert.equal(findCheck(unexpected.report, "exactamente").ok, false)

    const wrongValue = runPlan(fixture(), {
        expectedOutcomeFixes: { [String(ids.stale)]: "66" },
    })
    assert.equal(
        findCheck(wrongValue.report, "campos e ids esperados").ok,
        false
    )

    const missing = runPlan(fixture(), {
        expectedOutcomeFixes: {
            [String(ids.stale)]: "49",
            [String(ids.other)]: "1",
        },
    })
    assert.equal(findCheck(missing.report, "exactamente").ok, false)
})

test("outcome: sólo los aprobados; los que sólo difieren en seeds quedan como nota diferida", () => {
    const snapshot = fixture()
    const p1 = side("u1", "49")
    const p2 = side("u2", "66")
    // Playoff 2022: ganador/perdedor bien, pero sin seedFromTeamThatWon/Lost.
    const seedGapIds = [7, 8].map(
        (n) => new ObjectId(`20000000000000000000000${n}`)
    )
    seedGapIds.forEach((_id) =>
        snapshot.matches.push({
            ...playedMatch(_id, {
                p1,
                p2,
                scoreP1: 2,
                scoreP2: 1,
                outcome: {
                    draw: false,
                    playerThatWon: p1.player,
                    teamThatWon: p1.team,
                    playerThatLost: p2.player,
                    teamThatLost: p2.team,
                },
            }),
            type: "playoff",
            playoff_id: 9,
            seedP1: "1",
            seedP2: "8",
        })
    )

    const { ops, report } = runPlan(snapshot)
    const outcomeOps = ops.filter((op) => op.group.includes("outcome"))
    assert.deepEqual(
        outcomeOps.map((op) => String(op._id)),
        [String(ids.stale)]
    )
    seedGapIds.forEach((id) => assert.equal(opFor(ops, id), undefined))
    assert.ok(findCheck(report, "exactamente los esperados").ok)
    assert.equal(report.summary.outcomeSeedGaps, 2)
    const note = report.notes.find((entry) => entry.kind === "outcomeSeedGaps")
    assert.equal(note.deferred, true)
    assert.deepEqual(note.ids, seedGapIds.map(String))
    assert.deepEqual(report.evidence.outcomeSeedGaps[0].fields, [
        "outcome.seedFromTeamThatWon",
        "outcome.seedFromTeamThatLost",
    ])

    // Un ganador desactualizado fuera de la lista bloquea (y no se escribe).
    const strayStale = fixture()
    const stray = new ObjectId("200000000000000000000009")
    strayStale.matches.push(
        playedMatch(stray, {
            p1,
            p2,
            scoreP1: 0,
            scoreP2: 4,
            outcome: {
                draw: false,
                playerThatWon: p1.player,
                teamThatWon: p1.team,
                playerThatLost: p2.player,
                teamThatLost: p2.team,
            },
        })
    )
    const blocked = runPlan(strayStale)
    const strict = findCheck(blocked.report, "exactamente los esperados")
    assert.equal(strict.ok, false)
    assert.match(strict.detail, new RegExp(String(stray)))
    assert.equal(opFor(blocked.ops, stray), undefined)
})

test("torneo cancelado: ongoing false con filtro ongoing true y valid intacto", () => {
    const { ops } = runPlan(fixture())
    const op = opFor(ops, ids.cancelled)
    assert.equal(op.collection, "tournaments")
    assert.deepEqual(op.update, { $set: { ongoing: false } })
    assert.deepEqual(op.filter, { _id: ids.cancelled, ongoing: true })
    assert.deepEqual(op.before, { ongoing: true })

    const missing = runPlan(fixture(), {
        closeTournamentIds: ["3fffffffffffffffffffffff"],
    })
    assert.equal(findCheck(missing.report, "torneos a cerrar").ok, false)
})

test("tournament {id: null, name: null} -> null con filtro exacto, y sigue en el snapshot", () => {
    const snapshot = fixture()
    const { ops, report } = runPlan(snapshot)
    const op = opFor(ops, ids.nullRef)
    assert.deepEqual(op.update, { $set: { tournament: null } })
    assert.deepEqual(op.filter, {
        _id: ids.nullRef,
        tournament: { id: null, name: null },
    })
    assert.equal(report.summary.nullTournamentToNull, 1)

    const simulated = applyOpsInMemory(snapshot, ops)
    const kept = simulated.matches.find(
        (item) => String(item._id) === String(ids.nullRef)
    )
    assert.equal(kept.tournament, null)
    assert.equal(kept.played, true)
    assert.equal(simulated.matches.length, snapshot.matches.length)
})

test("vínculo por nombre: default vetable, id como string y torneo único", () => {
    const { ops, report } = runPlan(fixture())
    ;[ids.linkA, ids.linkB].forEach((id) => {
        const op = opFor(ops, id)
        assert.equal(op.group, "link-by-name")
        assert.deepEqual(op.update.$set.tournament, {
            id: String(ids.homonym),
            name: LINK_NAME,
        })
        assert.deepEqual(op.filter.tournament, { name: LINK_NAME })
    })
    assert.equal(opFor(ops, ids.other), undefined)
    // Aprobado por el usuario: nota, no confirmación pendiente.
    assert.deepEqual(report.needsConfirmation, [])
    const item = report.notes.find((entry) => entry.kind === "linkByName")
    assert.equal(item.approved, true)
    assert.deepEqual(item.ids.sort(), [String(ids.linkA), String(ids.linkB)])
    assert.equal(report.summary.linkedByName[LINK_NAME].matches, 2)

    const duplicated = fixture()
    duplicated.tournaments.push({
        _id: new ObjectId("300000000000000000000009"),
        name: LINK_NAME,
    })
    const blocked = runPlan(duplicated)
    assert.equal(findCheck(blocked.report, "único torneo").ok, false)
    assert.equal(opFor(blocked.ops, ids.linkA), undefined)

    const vetoed = runPlan(fixture(), { linkByName: [] })
    assert.equal(opFor(vetoed.ops, ids.linkA), undefined)
    assert.equal(
        vetoed.report.notes.filter((entry) => entry.kind === "linkByName")
            .length,
        0
    )
})

test("idempotencia y rollback genérico", () => {
    const snapshot = fixture()
    const first = runPlan(snapshot)
    assert.equal(first.ops.length, 5)
    const simulated = applyOpsInMemory(snapshot, first.ops)

    const second = runPlan(simulated)
    assert.equal(second.ops.length, 0)
    assert.ok(second.report.checks.every((item) => item.ok))

    const rollbackOps = buildRollbackOps({
        migrationId: m7.id,
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

test("el plan es puro y los defaults apuntan a los casos reales", () => {
    const snapshot = fixture()
    const copy = cloneSnapshot(snapshot)
    runPlan(snapshot)
    assert.deepEqual(snapshot, copy)

    // Exactamente 4 aprobados: 2 ganadores y 2 perdedores desactualizados.
    assert.deepEqual(m7.DEFAULTS.expectedOutcomeFixes, {
        "63405ea14060c65632366faa": { teamThatWon: "49" },
        "692d1bf2917eda907823f8e7": { teamThatWon: "9568" },
        "63a621a6b36157000dea8c1a": {
            playerThatLost: "6268a00eab8b56992d55405c",
        },
        "6459a201c07b38450bfb0c0f": { teamThatLost: "62" },
    })
    assert.deepEqual(m7.DEFAULTS.closeTournamentIds, [
        "664d43458f37f00eba8ea380",
    ])
    assert.equal(m7.DEFAULTS.linkByName.length, 2)
})

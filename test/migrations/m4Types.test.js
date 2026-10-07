const assert = require("node:assert/strict")
const test = require("node:test")

const { ObjectId } = require("mongoose").mongo

const m4 = require("../../scripts/migrations/004-m4-types")
const { deserialize, serialize } = require("../../scripts/migrations/lib/ejson")
const {
    applyOpsInMemory,
    assertValidOps,
    cloneSnapshot,
} = require("../../scripts/migrations/lib/memory")
const { buildRollbackOps } = require("../../scripts/migrations/lib/rollback")

const ids = {
    stringMatch: new ObjectId("600000000000000000000001"),
    numberMatch: new ObjectId("600000000000000000000002"),
    invalidMatch: new ObjectId("600000000000000000000003"),
    unplayed: new ObjectId("600000000000000000000004"),
    tournament: new ObjectId("700000000000000000000001"),
    numericTournament: new ObjectId("700000000000000000000002"),
    legacy: new ObjectId("700000000000000000000003"),
}

const team = (id) => ({ id, name: `Equipo ${id}` })

const fixture = () => ({
    matches: [
        {
            _id: ids.stringMatch,
            tournament: { id: String(ids.tournament), name: "Torneo" },
            played: true,
            teamP1: team("10"),
            teamP2: team("0"),
            outcome: {
                teamThatWon: team("10"),
                teamThatLost: team("0"),
                scoreFromTeamThatWon: "3",
                scoreFromTeamThatLost: "1",
            },
        },
        {
            _id: ids.numberMatch,
            tournament: { id: String(ids.numericTournament), name: "Nuevo" },
            played: true,
            teamP1: team(10),
            teamP2: team(20),
            outcome: {
                teamThatWon: team(10),
                teamThatLost: team(20),
                scoreFromTeamThatWon: 2,
                scoreFromTeamThatLost: 0,
            },
        },
        {
            _id: ids.invalidMatch,
            tournament: null,
            played: true,
            teamP1: team("abc"),
            teamP2: team("007"),
            outcome: {
                teamThatWon: team("abc"),
                teamThatLost: team("007"),
                scoreFromTeamThatWon: "dos",
                scoreFromTeamThatLost: "1",
            },
        },
        {
            _id: ids.unplayed,
            tournament: { id: String(ids.tournament), name: "Torneo" },
            played: false,
            teamP1: team("30"),
            teamP2: { name: "A definir" },
        },
    ],
    tournaments: [
        {
            _id: ids.tournament,
            name: "Torneo",
            teams: [
                { team: team("10"), player: { id: "u1", name: "J1" } },
                {
                    team: team(20),
                    player: { id: "u2", name: "J2" },
                    group: "A",
                },
            ],
            outcome: {
                champion: { team: team("10"), player: { id: "u1" } },
                finalist: { team: team("20"), player: { id: "u2" } },
            },
        },
        {
            _id: ids.numericTournament,
            name: "Nuevo",
            teams: [{ team: team(10), player: { id: "u1" } }],
        },
        { _id: ids.legacy, name: "Histórico", teams: [] },
    ],
})

const opFor = (ops, id) => ops.find((op) => String(op._id) === String(id))
const findCheck = (report, fragment) =>
    report.checks.find((item) => item.name.includes(fragment))

test("toCanonicalNumber: sólo enteros canónicos", () => {
    assert.equal(m4.toCanonicalNumber("10"), 10)
    assert.equal(m4.toCanonicalNumber("0"), 0)
    ;["007", "abc", "", " 1", "1.5", "-1", "99999999999999999999"].forEach(
        (value) => assert.equal(m4.toCanonicalNumber(value), null, value)
    )
    assert.equal(m4.toCanonicalNumber(10), null)
})

test("partidos: ids de equipo y scores string -> number con filtros $type string", () => {
    const { ops, report } = m4.plan(fixture())
    assertValidOps(ops)
    const op = opFor(ops, ids.stringMatch)
    assert.equal(op.group, "match-ids+scores")
    assert.deepEqual(op.update.$set, {
        "teamP1.id": 10,
        "teamP2.id": 0,
        "outcome.teamThatWon.id": 10,
        "outcome.teamThatLost.id": 0,
        "outcome.scoreFromTeamThatWon": 3,
        "outcome.scoreFromTeamThatLost": 1,
    })
    Object.keys(op.update.$set).forEach((path) =>
        assert.deepEqual(op.filter[path], { $type: "string" })
    )
    assert.equal(op.before["teamP1.id"], "10")

    assert.equal(opFor(ops, ids.numberMatch), undefined)
    assert.deepEqual(opFor(ops, ids.unplayed).update.$set, { "teamP1.id": 30 })
    assert.equal(report.summary.matchesWithStringTeamIds, 2)
    // El inválido también convierte su score válido.
    assert.equal(report.summary.matchesWithStringScores, 2)
})

test("torneos: teams[] entero y champion/finalist", () => {
    const { ops, report } = m4.plan(fixture())
    const op = opFor(ops, ids.tournament)
    assert.deepEqual(op.update.$set.teams, [
        { team: team(10), player: { id: "u1", name: "J1" } },
        { team: team(20), player: { id: "u2", name: "J2" }, group: "A" },
    ])
    assert.equal(op.update.$set["outcome.champion.team.id"], 10)
    assert.equal(op.update.$set["outcome.finalist.team.id"], 20)
    assert.deepEqual(op.filter["teams.team.id"], { $type: "string" })
    assert.equal(opFor(ops, ids.numericTournament), undefined)
    assert.equal(opFor(ops, ids.legacy), undefined)
    assert.equal(report.summary.tournamentsWithStringTeams, 1)
})

test("valores inválidos o con ceros a la izquierda: excluidos y check fallido", () => {
    const { ops, report } = m4.plan(fixture())
    const op = opFor(ops, ids.invalidMatch)
    assert.deepEqual(op.update.$set, { "outcome.scoreFromTeamThatLost": 1 })
    const idsCheck = findCheck(report, "ids de equipo")
    assert.equal(idsCheck.ok, false)
    assert.match(idsCheck.detail, /teamP1\.id/)
    assert.match(idsCheck.detail, /teamP2\.id/)
    assert.equal(findCheck(report, "scores").ok, false)
    assert.equal(report.summary.invalidIds, 4)
    assert.equal(report.summary.invalidScores, 1)

    const clean = fixture()
    clean.matches.splice(2, 1)
    assert.ok(m4.plan(clean).report.checks.every((item) => item.ok))
})

test("idempotencia", () => {
    const snapshot = fixture()
    const first = m4.plan(snapshot)
    const simulated = applyOpsInMemory(snapshot, first.ops)
    assert.equal(m4.plan(simulated).ops.length, 0)
})

test("rollback desde un before-file EJSON restaura los strings originales", () => {
    const snapshot = fixture()
    const { ops } = m4.plan(snapshot)
    const simulated = applyOpsInMemory(snapshot, ops)

    const beforeFile = deserialize(
        serialize({
            migrationId: m4.id,
            runId: "run",
            database: "apa-staging",
            entries: ops.map(({ _id, collection, before, after }) => ({
                _id,
                collection,
                before,
                after,
            })),
        })
    )
    const restored = applyOpsInMemory(simulated, buildRollbackOps(beforeFile))
    assert.deepEqual(restored, snapshot)

    const match = restored.matches.find(
        (item) => String(item._id) === String(ids.stringMatch)
    )
    assert.equal(typeof match.teamP1.id, "string")
    assert.equal(typeof match.outcome.scoreFromTeamThatWon, "string")
    const tournament = restored.tournaments.find(
        (item) => String(item._id) === String(ids.tournament)
    )
    assert.equal(tournament.teams[0].team.id, "10")
    assert.equal(tournament.teams[1].team.id, 20)
})

test("el plan es puro", () => {
    const snapshot = fixture()
    const copy = cloneSnapshot(snapshot)
    m4.plan(snapshot)
    assert.deepEqual(snapshot, copy)
})

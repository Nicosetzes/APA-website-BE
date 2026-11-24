const assert = require("node:assert/strict")
const test = require("node:test")
const mongoose = require("mongoose")

const migration = require("../../scripts/migrations/007-tournament-game-version")
const {
    GAME_VERSION_BY_TOURNAMENT,
    createMigration,
} = require("../../scripts/migrations/007-tournament-game-version")
const { applyOpsInMemory } = require("../../scripts/migrations/lib/memory")
const { GAME_VERSIONS } = require("../../service/playerRatings/teamStrength")

const OLD = "64697ac9d542ff4ada3038d3" // Chempions 2019/20, FIFA 19
const NEW = "6ac43e5daf82ded99b21b660" // Copa Afinidades 2026, FC 26
const UNKNOWN = "ffffffffffffffffffffffff"

const oid = (hex) => new mongoose.Types.ObjectId(hex)
const tournament = (hex, extra = {}) => ({
    _id: oid(hex),
    name: `Torneo ${hex.slice(0, 4)}`,
    ...extra,
})
let sequence = 0
const match = (tournamentHex, extra = {}) => {
    sequence += 1
    return {
        _id: oid(String(sequence).padStart(24, "0")),
        tournament: { id: tournamentHex, name: "x", ...extra },
    }
}

const snapshot = () => ({
    tournaments: [tournament(OLD), tournament(NEW), tournament(UNKNOWN)],
    matches: [
        match(OLD),
        match(OLD),
        match(NEW),
        match(UNKNOWN),
        {
            _id: oid("a".repeat(24)),
        },
    ],
})

test("007: registro válido, idempotente por filtro $exists y sin depender de otras", () => {
    assert.equal(migration.id, "007-tournament-game-version")
    assert.deepEqual(migration.dependsOn, [])
    assert.deepEqual(migration.collections, ["face-to-face", "tournaments"])
    const registry = require("../../scripts/migrations")
    assert.ok(registry.some((entry) => entry.id === migration.id))
})

test("007: la tabla tiene los 19 torneos del CSV y solo ediciones con overall", () => {
    assert.equal(Object.keys(GAME_VERSION_BY_TOURNAMENT).length, 19)
    for (const [id, version] of Object.entries(GAME_VERSION_BY_TOURNAMENT)) {
        assert.match(id, /^[0-9a-f]{24}$/)
        assert.ok(GAME_VERSIONS.includes(version), version)
    }
    assert.equal(GAME_VERSION_BY_TOURNAMENT[OLD], "FIFA 19")
    assert.equal(GAME_VERSION_BY_TOURNAMENT[NEW], "FC 26")
})

test("007: completa torneos y sus partidos y deja nota de lo desconocido", () => {
    const { ops, report } = migration.plan(snapshot())
    const tournamentOps = ops.filter((op) => op.collection === "tournaments")
    const matchOps = ops.filter((op) => op.collection === "face-to-face")

    assert.deepEqual(
        tournamentOps.map((op) => [String(op._id), op.update.$set.gameVersion]),
        [
            [OLD, "FIFA 19"],
            [NEW, "FC 26"],
        ]
    )
    for (const op of tournamentOps) {
        assert.deepEqual(op.filter.gameVersion, { $exists: false })
    }
    assert.deepEqual(
        matchOps.map((op) => op.update.$set["tournament.gameVersion"]),
        ["FIFA 19", "FIFA 19", "FC 26"]
    )
    for (const op of matchOps) {
        assert.deepEqual(op.filter["tournament.gameVersion"], {
            $exists: false,
        })
    }
    assert.equal(report.summary.tournamentsToChange, 2)
    assert.equal(report.summary.matchesToChange, 3)
    assert.ok(report.checks.every((check) => check.ok))
    const kinds = report.notes.map((note) => note.kind)
    assert.ok(kinds.some((kind) => /no están en la base/.test(kind)))
    const unknown = report.notes.find((note) =>
        /sin edición conocida/.test(note.kind)
    )
    assert.deepEqual(unknown.ids, [UNKNOWN])
})

test("007: aplicada en memoria, un segundo plan no tiene ops", () => {
    const first = snapshot()
    const { ops } = migration.plan(first)
    const after = applyOpsInMemory(first, ops)
    const second = migration.plan(after)
    assert.equal(second.ops.length, 0)
    assert.ok(second.report.checks.every((check) => check.ok))
    assert.equal(
        after.matches.filter(
            (entry) => entry.tournament?.gameVersion === "FIFA 19"
        ).length,
        2
    )
})

test("007: un torneo que ya tiene edición se respeta y sus partidos la heredan", () => {
    const custom = createMigration({ mapping: {} })
    const { ops, report } = custom.plan({
        tournaments: [tournament(UNKNOWN, { gameVersion: "FC 27" })],
        matches: [match(UNKNOWN)],
    })
    assert.equal(ops.length, 1)
    assert.equal(ops[0].collection, "face-to-face")
    assert.equal(ops[0].update.$set["tournament.gameVersion"], "FC 27")
    assert.ok(report.checks.every((check) => check.ok))
})

test("007: bloquea si un torneo o un partido ya tiene otra edición", () => {
    const { ops, report } = migration.plan({
        tournaments: [
            tournament(OLD, { gameVersion: "FC 26" }),
            tournament(NEW),
        ],
        matches: [match(NEW, { gameVersion: "FIFA 19" })],
    })
    const conflicts = report.checks.find((check) =>
        /otra edición/.test(check.name)
    )
    assert.equal(conflicts.ok, false)
    assert.match(conflicts.detail, /tiene "FC 26" y se esperaba "FIFA 19"/)
    assert.match(conflicts.detail, /tiene "FIFA 19" y su torneo "FC 26"/)
    assert.equal(report.summary.conflicts, 2)
    // El torneo NEW igual se completa; el partido con edición no se pisa.
    assert.deepEqual(
        ops.map((op) => op.collection),
        ["tournaments"]
    )
})

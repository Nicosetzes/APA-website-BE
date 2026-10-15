"use strict"
const assert = require("node:assert/strict")
const test = require("node:test")
const {
    FRESHNESS_REASONS,
    assessFreshness,
} = require("../service/ratingsStore/freshness")
const {
    history,
    SOURCE_STATS: HISTORY_STATS,
} = require("./fixtures/ratingsStore")
const { FINGERPRINT, storedDocsFrom } = require("./fixtures/ratingsReadModel")

const VERSION = "2.0"
const UPDATED_AT = "2026-02-20T12:00:00Z"

const playerDoc = (id, extra = {}) => ({
    ratingVersion: VERSION,
    id,
    rating: 1500,
    matches: 3,
    fingerprint: FINGERPRINT,
    source: { ratedMatches: 20, maxUpdatedAt: new Date(UPDATED_AT) },
    ...extra,
})
const players = () => [playerDoc("a"), playerDoc("b"), playerDoc("c")]
const current = (extra = {}) => ({
    ratedMatches: 20,
    maxUpdatedAt: new Date(UPDATED_AT),
    ...extra,
})
const assess = (overrides = {}) =>
    assessFreshness({
        players: players(),
        currentFingerprint: FINGERPRINT,
        currentSourceStats: current(),
        ratingVersion: VERSION,
        ...overrides,
    })

test("FRESHNESS_REASONS: las 8 razones, en orden y congeladas", () => {
    assert.deepEqual(FRESHNESS_REASONS, [
        "no_players",
        "version_mismatch",
        "inconsistent_players",
        "fingerprint_mismatch",
        "missing_source",
        "stale_count",
        "stale_updated_at",
        "ok",
    ])
    assert.ok(Object.isFrozen(FRESHNESS_REASONS))
})

test("ok: todo coincide", () => {
    assert.deepEqual(assess(), { fresh: true, reason: "ok" })
})

test("no_players: vacío o no arreglo", () => {
    for (const value of [[], undefined, null, "x", {}]) {
        assert.deepEqual(assess({ players: value }), {
            fresh: false,
            reason: "no_players",
        })
    }
})

test("version_mismatch: algún doc con otra ratingVersion", () => {
    const docs = players()
    docs[1] = playerDoc("b", { ratingVersion: "1.0" })
    assert.deepEqual(assess({ players: docs }), {
        fresh: false,
        reason: "version_mismatch",
    })
})

test("inconsistent_players: los docs no comparten una huella", () => {
    const docs = players()
    docs[2] = playerDoc("c", { fingerprint: "e".repeat(64) })
    assert.deepEqual(assess({ players: docs }), {
        fresh: false,
        reason: "inconsistent_players",
    })
})

test("inconsistent_players: los source de los docs difieren", () => {
    const docs = players()
    docs[1] = playerDoc("b", {
        source: { ratedMatches: 19, maxUpdatedAt: new Date(UPDATED_AT) },
    })
    assert.equal(assess({ players: docs }).reason, "inconsistent_players")
    const dates = players()
    dates[2] = playerDoc("c", {
        source: {
            ratedMatches: 20,
            maxUpdatedAt: new Date("2026-02-19T12:00:00Z"),
        },
    })
    assert.equal(assess({ players: dates }).reason, "inconsistent_players")
})

test("fingerprint_mismatch: la huella común no es la actual", () => {
    assert.deepEqual(assess({ currentFingerprint: "0".repeat(64) }), {
        fresh: false,
        reason: "fingerprint_mismatch",
    })
})

test("missing_source: ausente, ratedMatches no entero o maxUpdatedAt inválido", () => {
    const withoutSource = () => {
        const { source, ...doc } = playerDoc("c")
        return doc
    }
    const cases = [
        withoutSource(),
        playerDoc("c", { source: null }),
        playerDoc("c", { source: "x" }),
        playerDoc("c", { source: { ratedMatches: 1.5, maxUpdatedAt: null } }),
        playerDoc("c", { source: { ratedMatches: -1, maxUpdatedAt: null } }),
        playerDoc("c", { source: { ratedMatches: "20", maxUpdatedAt: null } }),
        playerDoc("c", {
            source: { ratedMatches: 20, maxUpdatedAt: UPDATED_AT },
        }),
        playerDoc("c", {
            source: { ratedMatches: 20, maxUpdatedAt: new Date("nope") },
        }),
    ]
    for (const doc of cases) {
        const docs = [playerDoc("a"), playerDoc("b"), doc]
        assert.deepEqual(assess({ players: docs }), {
            fresh: false,
            reason: "missing_source",
        })
    }
})

test("missing_source: docs de la etapa 1 sin source", () => {
    const stage1 = storedDocsFrom(history(), { sourceStats: null }).players
    assert.ok(stage1.length > 0)
    assert.ok(stage1.every((doc) => !("source" in doc)))
    const result = assessFreshness({
        players: stage1,
        currentFingerprint: FINGERPRINT,
        currentSourceStats: HISTORY_STATS,
        ratingVersion: VERSION,
    })
    assert.deepEqual(result, { fresh: false, reason: "missing_source" })
})

test("stale_count: cambió la cantidad de partidos del filtro", () => {
    assert.deepEqual(
        assess({ currentSourceStats: current({ ratedMatches: 21 }) }),
        {
            fresh: false,
            reason: "stale_count",
        }
    )
    assert.equal(
        assess({ currentSourceStats: current({ ratedMatches: 19 }) }).reason,
        "stale_count"
    )
})

test("stale_updated_at: mismo conteo pero otro maxUpdatedAt", () => {
    const newer = current({ maxUpdatedAt: new Date("2026-02-21T00:00:00Z") })
    assert.deepEqual(assess({ currentSourceStats: newer }), {
        fresh: false,
        reason: "stale_updated_at",
    })
})

test("fechas: instancias distintas con el mismo tiempo son frescas", () => {
    const docs = players()
    assert.notEqual(docs[0].source.maxUpdatedAt, docs[1].source.maxUpdatedAt)
    const stats = current({ maxUpdatedAt: new Date(UPDATED_AT) })
    assert.deepEqual(assess({ players: docs, currentSourceStats: stats }), {
        fresh: true,
        reason: "ok",
    })
})

test("null contra null es fresco; null contra Date no lo es (en ambos sentidos)", () => {
    const noDate = () => ({ ratedMatches: 20, maxUpdatedAt: null })
    const docs = [1, 2, 3].map((n) => playerDoc(`p${n}`, { source: noDate() }))
    assert.deepEqual(assess({ players: docs, currentSourceStats: noDate() }), {
        fresh: true,
        reason: "ok",
    })
    assert.equal(
        assess({ players: docs, currentSourceStats: current() }).reason,
        "stale_updated_at"
    )
    assert.equal(
        assess({ currentSourceStats: noDate() }).reason,
        "stale_updated_at"
    )
})

test("maxUpdatedAt ausente (undefined) cuenta igual que null", () => {
    const docs = [1, 2].map((n) =>
        playerDoc(`p${n}`, { source: { ratedMatches: 20 } })
    )
    assert.deepEqual(
        assess({
            players: docs,
            currentSourceStats: { ratedMatches: 20, maxUpdatedAt: null },
        }),
        { fresh: true, reason: "ok" }
    )
})

test("precedencia: la primera razón que aplica gana", () => {
    const stale = current({ ratedMatches: 99 })
    // huella distinta Y conteo distinto -> fingerprint_mismatch
    assert.equal(
        assess({
            currentFingerprint: "0".repeat(64),
            currentSourceStats: stale,
        }).reason,
        "fingerprint_mismatch"
    )
    // versión distinta le gana a la huella inconsistente
    const docs = players()
    docs[0] = playerDoc("a", { ratingVersion: "1.0", fingerprint: "1" })
    assert.equal(assess({ players: docs }).reason, "version_mismatch")
    // huellas inconsistentes le ganan a la huella actual distinta
    const mixed = players()
    mixed[0] = playerDoc("a", { fingerprint: "1".repeat(64) })
    assert.equal(
        assess({
            players: mixed,
            currentFingerprint: "0".repeat(64),
        }).reason,
        "inconsistent_players"
    )
    // sin source le gana al conteo distinto
    const noSource = players()
    noSource[0] = playerDoc("a", { source: undefined })
    assert.equal(
        assess({ players: noSource, currentSourceStats: stale }).reason,
        "missing_source"
    )
    // conteo distinto le gana a maxUpdatedAt distinto
    assert.equal(
        assess({
            currentSourceStats: current({
                ratedMatches: 99,
                maxUpdatedAt: null,
            }),
        }).reason,
        "stale_count"
    )
    // sin jugadores le gana a todo (las entradas válidas)
    assert.equal(
        assess({ players: [], currentFingerprint: "0".repeat(64) }).reason,
        "no_players"
    )
})

test("ratedMatches mayor que eventCount (history()) sigue siendo fresco", () => {
    const { players: docs, events } = storedDocsFrom(history(), {
        sourceStats: HISTORY_STATS,
    })
    assert.ok(HISTORY_STATS.ratedMatches > events.length)
    assert.deepEqual(
        assessFreshness({
            players: docs,
            currentFingerprint: FINGERPRINT,
            currentSourceStats: HISTORY_STATS,
            ratingVersion: VERSION,
        }),
        { fresh: true, reason: "ok" }
    )
})

test("entradas inválidas lanzan TypeError", () => {
    const invalid = [
        { currentFingerprint: undefined },
        { currentFingerprint: "" },
        { currentFingerprint: 5 },
        { ratingVersion: undefined },
        { ratingVersion: "" },
        { currentSourceStats: undefined },
        { currentSourceStats: null },
        { currentSourceStats: { ratedMatches: 1.5, maxUpdatedAt: null } },
        { currentSourceStats: { ratedMatches: -1, maxUpdatedAt: null } },
        { currentSourceStats: { ratedMatches: 1 } },
        {
            currentSourceStats: {
                ratedMatches: 1,
                maxUpdatedAt: "2026-01-01",
            },
        },
        {
            currentSourceStats: {
                ratedMatches: 1,
                maxUpdatedAt: new Date("nope"),
            },
        },
    ]
    for (const overrides of invalid) {
        assert.throws(
            () => assess(overrides),
            TypeError,
            JSON.stringify(overrides)
        )
    }
    assert.throws(() => assessFreshness(), TypeError)
    // Las entradas inválidas también lanzan con players vacío.
    assert.throws(
        () => assess({ players: [], currentFingerprint: 7 }),
        TypeError
    )
})

test("no muta los documentos ni las stats", () => {
    const docs = players()
    const stats = current()
    const docsBefore = structuredClone(docs)
    const statsBefore = structuredClone(stats)
    assess({ players: docs, currentSourceStats: stats })
    assess({
        players: docs,
        currentSourceStats: current({ ratedMatches: 1 }),
    })
    assert.deepEqual(docs, docsBefore)
    assert.deepEqual(stats, statsBefore)
})

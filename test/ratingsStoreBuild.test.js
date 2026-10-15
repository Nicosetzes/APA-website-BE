"use strict"
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const { RATING_CONFIG } = require("../config/ratings")
const teamRatings = require("../data/teamRatings.json")
const {
    buildRatingDocuments,
    canonicalStringify,
    computeFingerprint,
    computeRatingsState,
} = require("../service/ratingsStore")
const { canonicalize } = require("../service/ratingsStore/canonicalJson")
const {
    RATINGS_STORE_SCHEMA_VERSION,
} = require("../service/ratingsStore/constants")
const {
    SOURCE_STATS,
    buildTimeline,
    history,
    objectId,
} = require("./fixtures/ratingsStore")

const COMPUTED_AT = new Date("2026-02-01T00:00:00Z")
const FINGERPRINT = "a".repeat(64)
const build = (timeline = buildTimeline()) =>
    buildRatingDocuments(timeline, {
        fingerprint: FINGERPRINT,
        computedAt: COMPUTED_AT,
    })

test("canonicalize: el orden de claves no importa, el de arreglos sí", () => {
    assert.equal(
        canonicalStringify({ a: 1, b: { c: 2, d: 3 } }),
        canonicalStringify({ b: { d: 3, c: 2 }, a: 1 })
    )
    assert.notEqual(canonicalStringify([1, 2]), canonicalStringify([2, 1]))
    assert.equal(canonicalStringify({ n: -0 }), '{"n":0}')
    assert.equal(canonicalStringify({ a: undefined, b: 1 }), '{"b":1}')
    assert.equal(
        canonicalStringify({ d: new Date("2026-01-01T00:00:00Z") }),
        '{"d":"2026-01-01T00:00:00.000Z"}'
    )
    assert.throws(() => canonicalize(NaN), TypeError)
    assert.throws(() => canonicalize(Infinity), TypeError)
    assert.throws(() => canonicalize(() => 1), TypeError)
    assert.throws(() => canonicalize({ a: 10n }), TypeError)
})

test("builder: seq 1..N en el orden del motor y campos copiados del evento", () => {
    const timeline = buildTimeline()
    const { events } = build(timeline)
    assert.equal(events.length, timeline.events.length)
    assert.equal(events.length, 6)
    events.forEach((doc, index) => {
        const event = timeline.events[index]
        assert.equal(doc.seq, index + 1)
        assert.equal(doc.matchId, event.matchId)
        assert.match(doc.matchId, /^[0-9a-f]{24}$/)
        assert.equal(doc.time.getTime(), event.time)
        for (const field of [
            "scoreP1",
            "scoreP2",
            "expectedP1",
            "resultP1",
            "delta",
            "teamAdjustment",
            "tournament",
            "type",
        ]) {
            assert.equal(doc[field], event[field], field)
        }
        assert.equal(doc.p1.id, event.p1.id)
        assert.equal(doc.p1.before, event.p1.before)
        assert.equal(doc.p1.games, event.p1.games)
        assert.equal(doc.p1.team, event.p1.team)
        assert.equal(doc.p1.teamOverall, event.p1.teamOverall)
        assert.equal(doc.ratingVersion, "2.0")
    })
    // Fechas repetidas (partidos 2, 3 y 4): desempate por _id.
    assert.deepEqual(
        events.map((doc) => doc.matchId),
        [1, 2, 3, 4, 5, 6].map((n) => String(objectId(n)))
    )
})

test("builder: after = before ± delta, simétrico y coincide con el rating final", () => {
    const timeline = buildTimeline()
    const { events, players } = build(timeline)
    for (const doc of events) {
        assert.equal(doc.p1.after, doc.p1.before + doc.delta)
        assert.equal(doc.p2.after, doc.p2.before - doc.delta)
        assert.ok(
            Math.abs(
                doc.p1.after - doc.p1.before + (doc.p2.after - doc.p2.before)
            ) <= 1e-9
        )
    }
    const snapshot = timeline.snapshotAt(null)
    for (const player of players) {
        const last = [...events]
            .reverse()
            .find((doc) => doc.p1.id === player.id || doc.p2.id === player.id)
        const side = last.p1.id === player.id ? last.p1 : last.p2
        assert.equal(side.after, player.rating)
        assert.equal(side.after, timeline.players.get(player.id).rating)
        assert.equal(side.after, snapshot.get(player.id).rating)
    }
})

test("builder: team y teamOverall solo cuando hay término de equipo", () => {
    const { events } = build()
    assert.equal(events[0].p1.teamOverall, 82)
    assert.equal(events[0].p2.teamOverall, 76)
    assert.notEqual(events[0].teamAdjustment, 0)
    assert.equal(events[1].p1.teamOverall, null)
    assert.equal(events[1].teamAdjustment, 0)
    assert.equal(events[0].p1.team, "Boca")
})

test("builder: players solo con eventos, contadores y estado del motor", () => {
    const timeline = buildTimeline()
    const { events, players } = build(timeline)
    assert.deepEqual(
        players.map((player) => player.id),
        ["l", "n", "s"]
    )
    assert.equal(
        players.find((player) => player.id === "z"),
        undefined
    )
    for (const player of players) {
        const engine = timeline.players.get(player.id)
        const appearances = events.filter(
            (doc) => doc.p1.id === player.id || doc.p2.id === player.id
        ).length
        assert.equal(player.eventCount, appearances)
        assert.equal(player.eventCount, engine.matches)
        for (const field of [
            "name",
            "rating",
            "peak",
            "matches",
            "wins",
            "draws",
            "losses",
            "lastChange",
        ]) {
            assert.equal(player[field], engine[field], field)
        }
        assert.equal(player.lastPlayedAt.getTime(), engine.lastPlayedAt)
        assert.equal(player.ratingVersion, "2.0")
    }
})

test("builder: empates (liga y playoff por penales) valen 0,5 y suman un empate a cada lado", () => {
    const timeline = buildTimeline()
    const { events, players } = build(timeline)
    assert.equal(events[1].resultP1, 0.5)
    assert.equal(events[5].resultP1, 0.5)
    assert.equal(events[5].type, "playoff")
    const draws = Object.fromEntries(
        players.map((player) => [player.id, player.draws])
    )
    // Leo-Nico (liga) y Leo-Santi (playoff).
    assert.deepEqual(draws, { l: 2, n: 1, s: 1 })
})

test("builder: fingerprint y computedAt se propagan, sin undefined y sin mutar", () => {
    const timeline = buildTimeline()
    const before = structuredClone({
        players: [...timeline.players],
        events: timeline.events,
    })
    const { events, players } = build(timeline)
    assert.deepEqual(
        { players: [...timeline.players], events: timeline.events },
        before
    )
    const visit = (value, where) => {
        assert.notEqual(value, undefined, where)
        if (value && typeof value === "object" && !(value instanceof Date)) {
            for (const [key, child] of Object.entries(value)) {
                visit(child, `${where}.${key}`)
            }
        }
    }
    for (const doc of [...events, ...players]) {
        assert.equal(doc.fingerprint, FINGERPRINT)
        assert.equal(doc.computedAt, COMPUTED_AT)
        visit(doc, "doc")
    }
})

test("builder: lanza ante matchId nulo, fingerprint ausente o computedAt inválido", () => {
    const timeline = buildTimeline()
    const noId = {
        ...timeline,
        events: [{ ...timeline.events[0], matchId: null }],
    }
    assert.throws(() => build(noId), /sin matchId/)
    assert.throws(
        () => buildRatingDocuments(timeline, { computedAt: COMPUTED_AT }),
        /fingerprint/
    )
    assert.throws(
        () =>
            buildRatingDocuments(timeline, {
                fingerprint: FINGERPRINT,
                computedAt: "2026-02-01",
            }),
        /computedAt/
    )
})

test("builder: sin sourceStats no hay clave source (forma de la etapa 1)", () => {
    const { events, players } = build()
    for (const doc of [...events, ...players]) {
        assert.equal("source" in doc, false)
    }
    const explicitNull = buildRatingDocuments(buildTimeline(), {
        fingerprint: FINGERPRINT,
        computedAt: COMPUTED_AT,
        sourceStats: null,
    })
    assert.deepEqual(explicitNull, build())
})

test("builder: con sourceStats cada jugador trae source (copia de la Date) y los eventos no", () => {
    const sourceStats = {
        ratedMatches: SOURCE_STATS.ratedMatches,
        maxUpdatedAt: new Date(SOURCE_STATS.maxUpdatedAt),
    }
    const { events, players } = buildRatingDocuments(buildTimeline(), {
        fingerprint: FINGERPRINT,
        computedAt: COMPUTED_AT,
        sourceStats,
    })
    assert.equal(players.length, 3)
    for (const player of players) {
        assert.equal(player.source.ratedMatches, 7)
        assert.ok(player.source.maxUpdatedAt instanceof Date)
        assert.equal(
            player.source.maxUpdatedAt.getTime(),
            SOURCE_STATS.maxUpdatedAt.getTime()
        )
        assert.notEqual(player.source.maxUpdatedAt, sourceStats.maxUpdatedAt)
        assert.deepEqual(Object.keys(player.source), [
            "ratedMatches",
            "maxUpdatedAt",
        ])
    }
    assert.notEqual(players[0].source, players[1].source)
    for (const event of events) {
        assert.equal("source" in event, false)
    }
    // ratedMatches cuenta el filtro, no los eventos.
    assert.ok(players[0].source.ratedMatches > events.length)
    // El resto del documento es el de la etapa 1.
    const stage1 = build()
    assert.deepEqual(events, stage1.events)
    assert.deepEqual(
        players.map(({ source, ...rest }) => rest),
        stage1.players
    )
})

test("builder: maxUpdatedAt null se persiste como null y no muta sourceStats", () => {
    const sourceStats = Object.freeze({ ratedMatches: 0, maxUpdatedAt: null })
    const { players } = buildRatingDocuments(buildTimeline(), {
        fingerprint: FINGERPRINT,
        computedAt: COMPUTED_AT,
        sourceStats,
    })
    for (const player of players) {
        assert.deepEqual(player.source, { ratedMatches: 0, maxUpdatedAt: null })
    }
    assert.deepEqual(sourceStats, { ratedMatches: 0, maxUpdatedAt: null })
})

test("builder: sourceStats inválidas lanzan", () => {
    const withStats = (sourceStats) => () =>
        buildRatingDocuments(buildTimeline(), {
            fingerprint: FINGERPRINT,
            computedAt: COMPUTED_AT,
            sourceStats,
        })
    const date = SOURCE_STATS.maxUpdatedAt
    for (const ratedMatches of [-1, 1.5, "7", NaN, null, undefined]) {
        assert.throws(
            withStats({ ratedMatches, maxUpdatedAt: date }),
            /ratedMatches/,
            String(ratedMatches)
        )
    }
    for (const maxUpdatedAt of [undefined, "2026-01-09", 0, new Date("nope")]) {
        assert.throws(
            withStats({ ratedMatches: 1, maxUpdatedAt }),
            /maxUpdatedAt/,
            String(maxUpdatedAt)
        )
    }
    assert.throws(withStats("7"), /sourceStats/)
})

test("builder: timeline vacío da documentos vacíos", () => {
    assert.deepEqual(build(buildTimeline([])), { events: [], players: [] })
})

test("fingerprint: hex de 64, estable e independiente del orden de claves", () => {
    const fingerprint = computeFingerprint()
    assert.match(fingerprint, /^[0-9a-f]{64}$/)
    assert.equal(computeFingerprint(), fingerprint)
    assert.equal(
        computeFingerprint({
            config: RATING_CONFIG,
            teamRatings,
        }),
        fingerprint
    )
    const reversed = (object) =>
        Object.fromEntries(Object.entries(object).reverse())
    assert.equal(
        computeFingerprint({
            config: reversed(RATING_CONFIG),
            teamRatings: {
                overallByTeamEdition: reversed(
                    teamRatings.overallByTeamEdition
                ),
                editionByTournament: reversed(teamRatings.editionByTournament),
            },
        }),
        fingerprint
    )
})

test("fingerprint: cambia con cualquier parámetro, overall, edición o versión", () => {
    const base = computeFingerprint()
    for (const override of [
        { kFactor: RATING_CONFIG.kFactor + 1 },
        { teamStrengthWeight: RATING_CONFIG.teamStrengthWeight + 1 },
        { initialRating: RATING_CONFIG.initialRating + 1 },
        { scale: RATING_CONFIG.scale + 1 },
        { marginWeight: 0.1 },
        { provisionalMatches: RATING_CONFIG.provisionalMatches + 1 },
        { version: "2.1" },
    ]) {
        assert.notEqual(
            computeFingerprint({ config: { ...RATING_CONFIG, ...override } }),
            base,
            JSON.stringify(override)
        )
    }
    const overallKey = Object.keys(teamRatings.overallByTeamEdition)[0]
    const withOverall = structuredClone(teamRatings)
    withOverall.overallByTeamEdition[overallKey] += 1
    assert.notEqual(computeFingerprint({ teamRatings: withOverall }), base)
    const editionKey = Object.keys(teamRatings.editionByTournament)[0]
    const withEdition = structuredClone(teamRatings)
    withEdition.editionByTournament[editionKey] = "FIFA 99"
    assert.notEqual(computeFingerprint({ teamRatings: withEdition }), base)
    assert.notEqual(computeFingerprint({ engineVersion: "engine-2" }), base)
    assert.notEqual(
        computeFingerprint({
            schemaVersion: RATINGS_STORE_SCHEMA_VERSION + 1,
        }),
        base
    )
})

test("fingerprint: no depende de computedAt ni menciona el modelo de empate", () => {
    const first = computeRatingsState(history(), {
        now: new Date("2026-02-01T00:00:00Z"),
    })
    const second = computeRatingsState(history(), {
        now: new Date("2026-03-01T00:00:00Z"),
    })
    assert.equal(first.fingerprint, second.fingerprint)
    assert.equal(first.fingerprint, computeFingerprint())
    const source = fs.readFileSync(
        path.join(__dirname, "../service/ratingsStore/fingerprint.js"),
        "utf8"
    )
    assert.doesNotMatch(source, /require\([^)]*drawModel/)
})

test("computeRatingsState: igual al builder directo con el motor de producción", () => {
    const now = new Date("2026-02-01T00:00:00Z")
    const state = computeRatingsState(history(), { now })
    assert.equal(state.ratingVersion, "2.0")
    assert.equal(state.matchCount, 8)
    assert.equal(state.fingerprint, computeFingerprint())
    assert.deepEqual(
        state.computed,
        buildRatingDocuments(state.timeline, {
            fingerprint: state.fingerprint,
            computedAt: now,
        })
    )
    assert.equal(state.computed.events.length, 6)
})

test("computeRatingsState: sourceStats llega a los jugadores y no cambia el fingerprint", () => {
    const now = new Date("2026-02-01T00:00:00Z")
    const plain = computeRatingsState(history(), { now })
    const withSource = computeRatingsState(history(), {
        now,
        sourceStats: SOURCE_STATS,
    })
    assert.equal(withSource.fingerprint, plain.fingerprint)
    assert.deepEqual(
        withSource.computed,
        buildRatingDocuments(withSource.timeline, {
            fingerprint: withSource.fingerprint,
            computedAt: now,
            sourceStats: SOURCE_STATS,
        })
    )
    assert.ok(withSource.computed.players.every((p) => p.source))
    assert.ok(plain.computed.players.every((p) => !("source" in p)))
    assert.deepEqual(SOURCE_STATS, {
        ratedMatches: 7,
        maxUpdatedAt: new Date("2026-01-09T12:00:00Z"),
    })
})

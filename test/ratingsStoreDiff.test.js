"use strict"
const assert = require("node:assert/strict")
const test = require("node:test")
const {
    buildRatingDocuments,
    checkRatingsDrift,
    countDiff,
    diffRatingDocuments,
    formatSummary,
    isEmptyDiff,
    summarizeDiff,
} = require("../service/ratingsStore")
const {
    SOURCE_STATS,
    buildTimeline,
    objectId,
} = require("./fixtures/ratingsStore")

const FINGERPRINT = "a".repeat(64)
const computedAt = new Date("2026-02-01T00:00:00Z")
const computed = () =>
    buildRatingDocuments(buildTimeline(), {
        fingerprint: FINGERPRINT,
        computedAt,
    })
const computedWithSource = (sourceStats = SOURCE_STATS) =>
    buildRatingDocuments(buildTimeline(), {
        fingerprint: FINGERPRINT,
        computedAt,
        sourceStats,
    })
const clone = (docs) => structuredClone(docs)
const EMPTY = { events: [], players: [] }

test("stored vacío: todo es insert", () => {
    for (const stored of [EMPTY, {}, undefined]) {
        const diff = diffRatingDocuments(computed(), stored)
        assert.equal(diff.events.insert.length, 6)
        assert.equal(diff.players.insert.length, 3)
        assert.equal(countDiff(diff).update, 0)
        assert.equal(countDiff(diff).delete, 0)
    }
})

test("computado vacío con stored lleno: todo es delete", () => {
    const diff = diffRatingDocuments(EMPTY, computed())
    assert.equal(diff.events.delete.length, 6)
    assert.equal(diff.players.delete.length, 3)
    assert.equal(countDiff(diff).insert, 0)
})

test("idempotencia: el mismo contenido da un diff vacío", () => {
    const diff = diffRatingDocuments(computed(), clone(computed()))
    assert.ok(isEmptyDiff(diff))
    assert.deepEqual(Object.keys(diff), ["events", "players"])
    assert.deepEqual(Object.keys(diff.events), ["insert", "update", "delete"])
})

test("ignora computedAt y lo que agrega Mongo (_id, __v, ObjectId)", () => {
    const stored = clone(computed())
    const later = new Date("2026-06-01T00:00:00Z")
    for (const doc of [...stored.events, ...stored.players]) {
        doc.computedAt = later
        doc._id = objectId(999)
        doc.__v = 0
    }
    stored.events.forEach((doc) => {
        doc.matchId = objectId(Number(doc.matchId.slice(-6)))
    })
    assert.ok(isEmptyDiff(diffRatingDocuments(computed(), stored)))
})

test("update por cambios en distintos campos (devuelve el doc calculado)", () => {
    const mutations = [
        ["events", (doc) => (doc.delta += 0.5)],
        ["events", (doc) => (doc.p2.after += 0.5)],
        ["events", (doc) => (doc.p1.name = "Otro")],
        ["events", (doc) => (doc.fingerprint = "b".repeat(64))],
        ["events", (doc) => (doc.time = new Date("2020-01-01T00:00:00Z"))],
        ["players", (doc) => (doc.rating += 0.5)],
        ["players", (doc) => (doc.lastPlayedAt = new Date(0))],
        ["players", (doc) => (doc.draws += 1)],
    ]
    for (const [collection, mutate] of mutations) {
        const stored = clone(computed())
        mutate(stored[collection][1])
        const diff = diffRatingDocuments(computed(), stored)
        assert.equal(diff[collection].update.length, 1, mutate.toString())
        assert.equal(countDiff(diff).insert + countDiff(diff).delete, 0)
        assert.deepEqual(diff[collection].update[0], computed()[collection][1])
    }
})

test("tolerancia numérica: 1e-12 no cambia, 1e-6 sí, configurable", () => {
    const tiny = clone(computed())
    tiny.events[0].delta += 1e-12
    tiny.players[0].rating += 1e-12
    assert.ok(isEmptyDiff(diffRatingDocuments(computed(), tiny)))
    const small = clone(computed())
    small.events[0].delta += 1e-6
    assert.equal(diffRatingDocuments(computed(), small).events.update.length, 1)
    assert.ok(
        isEmptyDiff(diffRatingDocuments(computed(), small, { tolerance: 1e-3 }))
    )
})

test("delete de evento huérfano y de jugador sin eventos", () => {
    const stored = clone(computed())
    stored.events.push({
        ...clone(stored.events[0]),
        seq: 99,
        matchId: String(objectId(77)),
    })
    stored.players.push({ ...clone(stored.players[0]), id: "fantasma" })
    const diff = diffRatingDocuments(computed(), stored)
    assert.equal(diff.events.delete.length, 1)
    assert.equal(diff.events.delete[0].seq, 99)
    assert.equal(diff.players.delete.length, 1)
    assert.equal(diff.players.delete[0].id, "fantasma")
    assert.equal(countDiff(diff).insert + countDiff(diff).update, 0)
})

test("otra ratingVersion no se empareja (el DAO solo lee la versión actual)", () => {
    const stored = clone(computed())
    for (const doc of [...stored.events, ...stored.players]) {
        doc.ratingVersion = "1.0"
    }
    const diff = diffRatingDocuments(computed(), stored)
    assert.equal(diff.events.insert.length, 6)
    assert.equal(diff.events.delete.length, 6)
    assert.equal(diff.players.insert.length, 3)
    assert.equal(diff.players.delete.length, 3)
})

test("insertar en el medio: el nuevo es insert, los desplazados update, nada se borra", () => {
    const stored = clone(computed())
    const removed = stored.events.splice(2, 1)[0]
    stored.events.forEach((doc, index) => {
        doc.seq = index + 1
    })
    const diff = diffRatingDocuments(computed(), stored)
    assert.equal(diff.events.insert.length, 1)
    assert.equal(diff.events.insert[0].matchId, removed.matchId)
    assert.ok(diff.events.update.length >= 1)
    assert.ok(diff.events.update.every((doc) => doc.seq > 3))
    assert.equal(diff.events.delete.length, 0)
})

test("claves duplicadas lanzan", () => {
    const duplicated = clone(computed())
    duplicated.events.push(clone(duplicated.events[0]))
    assert.throws(
        () => diffRatingDocuments(duplicated, EMPTY),
        /clave duplicada/
    )
    assert.throws(
        () => diffRatingDocuments(EMPTY, duplicated),
        /clave duplicada/
    )
})

test("summarizeDiff y formatSummary: conteos, ejemplos acotados y sin diferencias", () => {
    const empty = summarizeDiff(diffRatingDocuments(computed(), computed()))
    assert.equal(empty.inSync, true)
    assert.deepEqual(formatSummary(empty), ["Sin diferencias"])

    const summary = summarizeDiff(diffRatingDocuments(computed(), EMPTY), {
        maxExamples: 2,
    })
    assert.equal(summary.inSync, false)
    assert.deepEqual(summary.totals, { insert: 9, update: 0, delete: 0 })
    assert.equal(summary.events.insert.count, 6)
    assert.equal(summary.events.insert.examples.length, 2)
    assert.equal(summary.events.insert.examples[0], String(objectId(1)))
    assert.deepEqual(summary.players.insert.examples, ["l", "n"])
    const lines = formatSummary(summary)
    assert.match(lines[0], /^eventos: \+6 nuevos \(ej: /)
    assert.match(lines[1], /^jugadores: \+3 nuevos/)

    for (const invalid of [-1, 51, 1.5, "3"]) {
        assert.throws(
            () =>
                summarizeDiff(diffRatingDocuments(computed(), EMPTY), {
                    maxExamples: invalid,
                }),
            RangeError
        )
    }
})

test("checkRatingsDrift: en sync no hay razones", () => {
    const drift = checkRatingsDrift({
        computed: computed(),
        stored: clone(computed()),
        fingerprint: FINGERPRINT,
    })
    assert.equal(drift.inSync, true)
    assert.deepEqual(drift.reasons, [])
    assert.deepEqual(drift.storedFingerprints, [FINGERPRINT])
})

test("checkRatingsDrift: cada tipo de drift da su razón", () => {
    const check = (stored) =>
        checkRatingsDrift({
            computed: computed(),
            stored,
            fingerprint: FINGERPRINT,
        })
    const missing = clone(computed())
    missing.events.pop()
    assert.match(check(missing).reasons.join("|"), /1 eventos faltantes/)

    const orphan = clone(computed())
    orphan.events.push({
        ...clone(orphan.events[0]),
        matchId: String(objectId(77)),
    })
    assert.match(check(orphan).reasons.join("|"), /1 eventos huérfanos/)

    const different = clone(computed())
    different.events[0].delta += 1
    assert.match(
        check(different).reasons.join("|"),
        /1 eventos con valores distintos/
    )

    const players = clone(computed())
    players.players[0].rating += 1
    assert.match(
        check(players).reasons.join("|"),
        /1 jugadores desincronizados/
    )

    const none = check(EMPTY)
    assert.equal(none.inSync, false)
    assert.deepEqual(none.reasons, ["no hay ratings persistidos"])

    for (const result of [missing, orphan, different, players].map(check)) {
        assert.equal(result.inSync, false)
    }
})

test("source: guardado sin source (etapa 1) y calculado con source es update de jugadores", () => {
    const diff = diffRatingDocuments(computedWithSource(), computed())
    assert.equal(diff.players.update.length, 3)
    assert.ok(diff.players.update.every((doc) => doc.source))
    assert.equal(countDiff(diff).insert + countDiff(diff).delete, 0)
    assert.equal(diff.events.update.length, 0)
})

test("source: Date iguales en instancias distintas no son diferencia", () => {
    const stored = clone(computedWithSource())
    assert.notEqual(
        stored.players[0].source.maxUpdatedAt,
        computedWithSource().players[0].source.maxUpdatedAt
    )
    assert.ok(isEmptyDiff(diffRatingDocuments(computedWithSource(), stored)))
})

test("source: ratedMatches o maxUpdatedAt distintos son update (la fecha se compara por tiempo)", () => {
    const count = clone(computedWithSource())
    count.players[1].source.ratedMatches += 1
    assert.equal(
        diffRatingDocuments(computedWithSource(), count).players.update.length,
        1
    )
    const later = clone(computedWithSource())
    later.players[2].source.maxUpdatedAt = new Date(
        SOURCE_STATS.maxUpdatedAt.getTime() + 1
    )
    assert.equal(
        diffRatingDocuments(computedWithSource(), later).players.update.length,
        1
    )
})

test("source: maxUpdatedAt null contra Date es update; null contra undefined es igual", () => {
    const nullStats = { ratedMatches: 7, maxUpdatedAt: null }
    const dated = diffRatingDocuments(
        computedWithSource(nullStats),
        computedWithSource()
    )
    assert.equal(dated.players.update.length, 3)
    const reverse = diffRatingDocuments(
        computedWithSource(),
        computedWithSource(nullStats)
    )
    assert.equal(reverse.players.update.length, 3)
    const stored = clone(computedWithSource(nullStats))
    for (const player of stored.players) delete player.source.maxUpdatedAt
    assert.ok(
        isEmptyDiff(diffRatingDocuments(computedWithSource(nullStats), stored))
    )
})

test("checkRatingsDrift: jugadores sin source o con source distinto dan su razón", () => {
    const check = (stored, comp = computedWithSource()) =>
        checkRatingsDrift({
            computed: comp,
            stored,
            fingerprint: FINGERPRINT,
        })
    const stage1 = check(computed())
    assert.equal(stage1.inSync, false)
    assert.ok(
        stage1.reasons.includes("3 jugadores desincronizados"),
        stage1.reasons.join("|")
    )
    assert.ok(
        stage1.reasons.includes("3 jugadores sin source o con source distinto")
    )

    const different = clone(computedWithSource())
    different.players[0].source.ratedMatches += 1
    assert.ok(
        check(different).reasons.includes(
            "1 jugadores sin source o con source distinto"
        )
    )

    // En sync: sin razones. Y sin source calculado no se agrega la razón.
    assert.deepEqual(check(clone(computedWithSource())).reasons, [])
    const noSourceComputed = check(clone(computed()), computed())
    assert.deepEqual(noSourceComputed.reasons, [])
    const storedWithSource = check(computedWithSource(), computed())
    assert.ok(!storedWithSource.reasons.some((reason) => /source/.test(reason)))
})

test("checkRatingsDrift: fingerprint distinto con valores iguales", () => {
    const stored = clone(computed())
    for (const doc of [...stored.events, ...stored.players]) {
        doc.fingerprint = "c".repeat(64)
    }
    // Los valores iguales no alcanzan: el diff ya lo marca por `fingerprint`.
    const drift = checkRatingsDrift({
        computed: computed(),
        stored,
        fingerprint: FINGERPRINT,
    })
    assert.equal(drift.inSync, false)
    assert.ok(
        drift.reasons.includes("fingerprint distinto al del código actual")
    )
    assert.deepEqual(drift.storedFingerprints, ["c".repeat(64)])
    // Es la misma salida que llamar al diff directo.
    assert.deepEqual(drift.diff, diffRatingDocuments(computed(), stored))
})

"use strict"
const assert = require("node:assert/strict")
const test = require("node:test")
const {
    checkRatingsDrift,
    computeFingerprint,
    diffRatingDocuments,
} = require("../service/ratingsStore")
const {
    NOW,
    countWrites,
    createFakeDatabase,
    createSyncHarness,
    eventsBeforePlayers,
} = require("./fixtures/ratingsSyncFakes")
const { LEO, NICO, SANTI, match, objectId } = require("./fixtures/ratingsStore")

const SAVED = { trigger: "match_result_saved" }
const REMOVED = { trigger: "match_result_removed" }

// Un resultado nuevo al final del historial.
const newResult = (n, day = 10 + n) =>
    match(n, NICO, 2, SANTI, 1, `2026-01-${day}T15:00:00Z`)

// Historial grande (> 300 documentos): una cadena de partidos entre tres.
const bigHistory = (count) => {
    const players = [NICO, SANTI, LEO]
    return Array.from({ length: count }, (_, index) =>
        match(
            index + 1,
            players[index % 3],
            index % 4,
            players[(index + 1) % 3],
            (index * 7) % 3,
            new Date(Date.UTC(2025, 0, 1) + index * 3_600_000).toISOString()
        )
    )
}

const assertInSync = (db) => {
    const stored = db.snapshot()
    const expected = db.expected()
    const diff = diffRatingDocuments(expected.computed, stored)
    for (const section of [diff.events, diff.players]) {
        assert.equal(section.insert.length, 0)
        assert.equal(section.update.length, 0)
        assert.equal(section.delete.length, 0)
    }
    assert.equal(
        checkRatingsDrift({
            computed: expected.computed,
            stored,
            fingerprint: expected.fingerprint,
        }).inSync,
        true
    )
    assert.deepEqual(db.freshness(), { fresh: true, reason: "ok" })
}

const lastLog = (harness) => harness.logs.at(-1).fields

test("relleno inicial con umbral alto: el store queda igual al recomputado y fresco", async () => {
    const db = createFakeDatabase()
    const harness = createSyncHarness(db)
    assert.equal((await harness.hook(SAVED)).result, "applied")
    assertInSync(db)
    assert.equal(db.snapshot().events.length, 6)
    assert.equal(db.snapshot().players.length, 3)
    assert.equal(harness.logs.length, 1)
    assert.equal(harness.logs[0].event, "rating_sync")
})

test("agregar un resultado al final: 1 evento nuevo, jugadores actualizados y fresco", async () => {
    const db = createFakeDatabase()
    const harness = createSyncHarness(db)
    await harness.hook(SAVED)
    db.addResult(newResult(9))
    assert.deepEqual(db.freshness(), { fresh: false, reason: "stale_count" })
    const from = db.log.length
    const outcome = await harness.hook(SAVED)
    assert.equal(outcome.result, "applied")
    assert.deepEqual(outcome.changes, {
        events: { insert: 1, update: 0, delete: 0 },
        players: { insert: 0, update: 3, delete: 0 },
    })
    assert.deepEqual(countWrites(db, from), {
        "rating-events": 1,
        "player-ratings": 1,
    })
    assert.equal(db.snapshot().events.length, 7)
    assertInSync(db)
})

test("editar el último resultado: un evento actualizado y fresco", async () => {
    const db = createFakeDatabase()
    const harness = createSyncHarness(db)
    db.addResult(newResult(9))
    await harness.hook(SAVED)
    db.editResult(9, { scoreP1: 0, scoreP2: 4 })
    assert.deepEqual(db.freshness(), {
        fresh: false,
        reason: "stale_updated_at",
    })
    const outcome = await harness.hook(SAVED)
    assert.equal(outcome.result, "applied")
    assert.deepEqual(outcome.changes.events, {
        insert: 0,
        update: 1,
        delete: 0,
    })
    assertInSync(db)
})

test("editar un resultado viejo: umbral chico lo saltea y deja el store intacto; umbral alto lo aplica", async () => {
    const db = createFakeDatabase()
    const harness = createSyncHarness(db)
    await harness.hook(SAVED)
    const before = db.snapshot()
    db.editResult(1, { scoreP1: 0, scoreP2: 3 })

    harness.config.maxChanges = 4
    const from = db.log.length
    const skipped = await harness.hook(SAVED)
    assert.equal(skipped.result, "skipped")
    assert.equal(skipped.reason, "large_diff")
    assert.ok(skipped.changes.events.update > 1, "muchos eventos cambian")
    assert.equal(db.log.length, from)
    assert.deepEqual(db.snapshot(), before)
    assert.deepEqual(db.freshness(), {
        fresh: false,
        reason: "stale_updated_at",
    })

    harness.config.maxChanges = 300
    assert.equal((await harness.hook(SAVED)).result, "applied")
    assertInSync(db)
})

test("borrar un resultado: el evento huérfano se elimina, jugadores actualizados y fresco", async () => {
    const db = createFakeDatabase()
    const harness = createSyncHarness(db)
    db.addResult(newResult(9))
    await harness.hook(SAVED)
    assert.equal(db.snapshot().events.length, 7)
    db.removeResult(9)
    const outcome = await harness.hook(REMOVED)
    assert.equal(outcome.result, "applied")
    assert.deepEqual(outcome.changes, {
        events: { insert: 0, update: 0, delete: 1 },
        players: { insert: 0, update: 3, delete: 0 },
    })
    assert.equal(db.snapshot().events.length, 6)
    assertInSync(db)
})

test("resultado simulado o W.O. (valid:false): un resultado nuevo no cambia nada rateable y da noop", async () => {
    const db = createFakeDatabase()
    const harness = createSyncHarness(db)
    await harness.hook(SAVED)
    db.addResult(
        match(9, NICO, 3, LEO, 0, "2026-01-12T15:00:00Z", { valid: false })
    )
    const from = db.log.length
    const outcome = await harness.hook(SAVED)
    assert.equal(outcome.result, "noop")
    assert.equal(db.log.length, from)
    assertInSync(db)
})

test("convertir un resultado rateado en simulado/W.O.: el evento se borra y queda fresco", async () => {
    const db = createFakeDatabase()
    const harness = createSyncHarness(db)
    await harness.hook(SAVED)
    db.editResult(6, { valid: false })
    const outcome = await harness.hook(SAVED)
    assert.equal(outcome.result, "applied")
    assert.equal(outcome.changes.events.delete, 1)
    assert.ok(outcome.changes.events.update >= 0)
    assert.equal(db.snapshot().events.length, 5)
    assertInSync(db)
})

test("segunda corrida sin cambios: noop y cero llamadas a bulkWrite", async () => {
    const db = createFakeDatabase()
    const harness = createSyncHarness(db)
    await harness.hook(SAVED)
    const from = db.log.length
    const outcome = await harness.hook(SAVED)
    assert.equal(outcome.result, "noop")
    assert.equal(db.log.length, from)
    assert.equal(lastLog(harness).result, "noop")
})

test("cambio de fingerprint y primera carga grande dan skipped/large_diff con el umbral por defecto", async () => {
    // Fingerprint distinto: todo lo guardado se considera cambiado.
    const base = createFakeDatabase()
    await createSyncHarness(base).hook(SAVED)
    const stale = createFakeDatabase()
    const seeded = base.snapshot()
    for (const doc of [...seeded.events, ...seeded.players]) {
        doc.fingerprint = "c".repeat(64)
    }
    stale.seed(seeded)
    const staleHarness = createSyncHarness(stale, {
        settings: { maxChanges: 8 },
    })
    const changed = await staleHarness.hook(SAVED)
    assert.equal(changed.result, "skipped")
    assert.equal(changed.reason, "large_diff")
    assert.equal(stale.log.length, 0)

    // Primera carga sobre un historial grande con el umbral por defecto (300).
    const big = createFakeDatabase({ matches: bigHistory(400) })
    const bigHarness = createSyncHarness(big)
    const first = await bigHarness.hook(SAVED)
    assert.equal(first.result, "skipped")
    assert.equal(first.reason, "large_diff")
    assert.ok(first.changes.events.insert >= 300)
    assert.equal(big.log.length, 0)
    assert.equal(bigHarness.config.maxChanges, 300)
})

test("ORDEN: en todas las corridas ningún player-ratings.bulkWrite precede a un rating-events.bulkWrite", async () => {
    const db = createFakeDatabase()
    const harness = createSyncHarness(db)
    const steps = [
        () => {},
        () => db.addResult(newResult(9)),
        () => db.editResult(9, { scoreP1: 5 }),
        () => db.removeResult(9),
        () => db.editResult(2, { scoreP1: 3 }),
        () => db.addResult(newResult(10)),
    ]
    for (const step of steps) {
        step()
        const from = db.log.length
        await harness.hook(SAVED)
        assert.ok(
            eventsBeforePlayers(db.log.slice(from)),
            JSON.stringify(db.log)
        )
    }
    assertInSync(db)
})

test("el estado intermedio (eventos escritos, jugadores no) NUNCA parece fresco, ni con borrado de huérfanos", async () => {
    const db = createFakeDatabase()
    const harness = createSyncHarness(db)
    db.addResult(newResult(9))
    await harness.hook(SAVED)
    const intermediate = []
    db.afterBulkWrite = (name) => {
        if (name === "rating-events") intermediate.push(db.freshness())
    }

    // Alta: el evento ya está, los jugadores todavía no.
    db.addResult(newResult(10))
    await harness.hook(SAVED)
    // Edición del último: evento actualizado antes de los jugadores.
    db.editResult(10, { scoreP1: 0, scoreP2: 2 })
    await harness.hook(SAVED)
    // Borrado: el huérfano ya no está, los jugadores todavía no.
    db.removeResult(10)
    await harness.hook(REMOVED)

    assert.equal(intermediate.length, 3)
    for (const freshness of intermediate) {
        assert.equal(freshness.fresh, false, JSON.stringify(freshness))
        assert.match(freshness.reason, /^(stale_count|stale_updated_at)$/)
    }
    db.afterBulkWrite = null
    assertInSync(db)
})

test("el lector de la etapa 2: stale antes del sync, index después, y otra vez tras borrar", async () => {
    const db = createFakeDatabase()
    const harness = createSyncHarness(db)
    await harness.hook(SAVED)
    const ninth = newResult(9)
    db.addResult(ninth)
    const requested = [String(ninth._id)]

    assert.deepEqual(await db.retrieveIndex(requested), {
        stale: "stale_count",
    })
    await harness.hook(SAVED)
    const fresh = await db.retrieveIndex(requested)
    assert.ok(fresh.index, JSON.stringify(fresh))
    assert.equal(fresh.stale, undefined)

    db.removeResult(9)
    assert.deepEqual(await db.retrieveIndex([String(objectId(1))]), {
        stale: "stale_count",
    })
    await harness.hook(REMOVED)
    const afterDelete = await db.retrieveIndex([String(objectId(1))])
    assert.ok(afterDelete.index, JSON.stringify(afterDelete))
    // El evento borrado ya no existe: pedirlo da missing_event, no un dato viejo.
    assert.deepEqual(await db.retrieveIndex(requested), {
        stale: "missing_event",
    })
})

test("falla el bulkWrite de eventos: error, jugadores sin tocar, no fresco; el siguiente sync converge", async () => {
    const db = createFakeDatabase()
    const harness = createSyncHarness(db)
    await harness.hook(SAVED)
    db.addResult(newResult(9))
    const playersBefore = db.snapshot().players
    db.failOn = "rating-events"
    const outcome = await harness.hook(SAVED)
    assert.equal(outcome.result, "error")
    assert.equal(outcome.reason, "MongoBulkWriteError")
    assert.ok(!JSON.stringify(harness.logs).includes("secreto"))
    assert.equal(harness.logs.at(-1).level, "warn")
    assert.deepEqual(db.snapshot().players, playersBefore)
    assert.equal(db.freshness().fresh, false)

    db.failOn = null
    assert.equal((await harness.hook(SAVED)).result, "applied")
    assertInSync(db)
})

test("falla el bulkWrite de jugadores: eventos escritos pero no fresco; el siguiente sync converge", async () => {
    const db = createFakeDatabase()
    const harness = createSyncHarness(db)
    await harness.hook(SAVED)
    db.addResult(newResult(9))
    db.failOn = "player-ratings"
    const outcome = await harness.hook(SAVED)
    assert.equal(outcome.result, "error")
    assert.equal(db.snapshot().events.length, 7)
    assert.equal(db.freshness().fresh, false)
    assert.deepEqual(await db.retrieveIndex([String(objectId(9))]), {
        stale: "stale_count",
    })

    db.failOn = null
    assert.equal((await harness.hook(SAVED)).result, "applied")
    assertInSync(db)
})

test("corte por deadline entre eventos y jugadores: no fresco y el siguiente sync converge", async () => {
    const db = createFakeDatabase()
    let now = 0
    const harness = createSyncHarness(db, { clock: () => now })
    await harness.hook(SAVED)
    db.addResult(newResult(9))
    db.afterBulkWrite = (name) => {
        if (name === "rating-events") now += 10_000
    }
    const outcome = await harness.hook(SAVED)
    assert.equal(outcome.result, "timeout")
    assert.equal(outcome.reason, "deadline")
    assert.equal(db.snapshot().events.length, 7)
    assert.equal(db.freshness().fresh, false)

    db.afterBulkWrite = null
    now = 0
    assert.equal((await harness.hook(SAVED)).result, "applied")
    assertInSync(db)
})

test("concurrencia: 5 hooks simultáneos tras 5 escrituras hacen a lo sumo 2 pasadas y dejan el store consistente", async () => {
    const db = createFakeDatabase()
    const harness = createSyncHarness(db)
    await harness.hook(SAVED)
    const loadsBefore = db.reads.loadMatches
    for (let n = 9; n <= 13; n += 1) db.addResult(newResult(n))
    const outcomes = await Promise.all(
        Array.from({ length: 5 }, () => harness.hook(SAVED))
    )
    assert.ok(outcomes.every((outcome) => outcome.result !== "error"))
    assert.ok(db.reads.loadMatches - loadsBefore <= 2)
    assert.equal(db.reads.loadMatches - loadsBefore, 2)
    assertInSync(db)
})

test("una escritura que cambia las stats mientras corre un sync provoca una pasada extra y queda fresco", async () => {
    const db = createFakeDatabase()
    const harness = createSyncHarness(db)
    await harness.hook(SAVED)
    db.addResult(newResult(9))
    let injected = false
    db.afterBulkWrite = (name) => {
        if (name === "player-ratings" && !injected) {
            injected = true
            db.addResult(newResult(10))
        }
    }
    const outcome = await harness.hook(SAVED)
    assert.equal(outcome.result, "applied")
    assert.equal(outcome.passes, 2)
    assert.equal(lastLog(harness).passes, 2)
    assert.equal(db.snapshot().events.length, 8)
    assertInSync(db)
})

test("el kill switch apagado no toca la base", async () => {
    const db = createFakeDatabase()
    const harness = createSyncHarness(db, { settings: { enabled: false } })
    db.addResult(newResult(9))
    const outcome = await harness.hook(SAVED)
    assert.equal(outcome.result, "disabled")
    assert.deepEqual(db.reads, {
        loadSourceStats: 0,
        loadMatches: 0,
        findStored: 0,
    })
    assert.equal(db.log.length, 0)
    assert.deepEqual(db.freshness().fresh, false)
    // Y el fingerprint que usa el lector coincide con el del sync.
    assert.equal(db.expected(NOW).fingerprint, computeFingerprint())
})

"use strict"
const assert = require("node:assert/strict")
const test = require("node:test")
const {
    computeRatingsState,
    describeChanges,
    diffAgainstStored,
    diffRatingDocuments,
    loadRatingsState,
    sameSourceStats,
} = require("../service/ratingsStore")
const { SOURCE_STATS, history } = require("./fixtures/ratingsStore")

const NOW = new Date("2026-02-01T00:00:00Z")

test("loadRatingsState: lee primero las stats y después el historial", async () => {
    const calls = []
    const { sourceStats, state } = await loadRatingsState({
        loadSourceStats: async () => {
            calls.push("loadSourceStats")
            return SOURCE_STATS
        },
        loadMatches: async () => {
            calls.push("loadMatches")
            return history()
        },
        now: () => NOW,
    })
    assert.deepEqual(calls, ["loadSourceStats", "loadMatches"])
    assert.equal(sourceStats, SOURCE_STATS)
    const direct = computeRatingsState(history(), {
        now: NOW,
        sourceStats: SOURCE_STATS,
    })
    assert.deepEqual(state.computed, direct.computed)
    assert.equal(state.fingerprint, direct.fingerprint)
    assert.ok(state.computed.players.every((p) => p.computedAt === NOW))
})

test("loadRatingsState: un fallo en las stats no lee el historial", async () => {
    let matchesRead = false
    await assert.rejects(
        loadRatingsState({
            loadSourceStats: async () => {
                throw new Error("sin stats")
            },
            loadMatches: async () => {
                matchesRead = true
                return []
            },
        }),
        /sin stats/
    )
    assert.equal(matchesRead, false)
})

test("diffAgainstStored: pide lo guardado de la ratingVersion y arma el diff", async () => {
    const { state } = await loadRatingsState({
        loadSourceStats: async () => SOURCE_STATS,
        loadMatches: async () => history(),
        now: () => NOW,
    })
    const asked = []
    const empty = await diffAgainstStored(state, async (version) => {
        asked.push(version)
        return { events: [], players: [] }
    })
    assert.deepEqual(asked, [state.ratingVersion])
    assert.equal(empty.diff.events.insert.length, 6)
    assert.equal(empty.diff.players.insert.length, 3)
    const full = await diffAgainstStored(state, async () => state.computed)
    assert.deepEqual(
        full.diff,
        diffRatingDocuments(state.computed, full.stored)
    )
    assert.equal(describeChanges(full.diff).total, 0)
})

test("describeChanges: diff vacío y mixto", () => {
    const section = (insert, update, remove) => ({
        insert: Array.from({ length: insert }, () => ({})),
        update: Array.from({ length: update }, () => ({})),
        delete: Array.from({ length: remove }, () => ({})),
    })
    assert.deepEqual(
        describeChanges({
            events: section(0, 0, 0),
            players: section(0, 0, 0),
        }),
        {
            events: { insert: 0, update: 0, delete: 0 },
            players: { insert: 0, update: 0, delete: 0 },
            total: 0,
        }
    )
    assert.deepEqual(
        describeChanges({
            events: section(1, 2, 3),
            players: section(4, 5, 6),
        }),
        {
            events: { insert: 1, update: 2, delete: 3 },
            players: { insert: 4, update: 5, delete: 6 },
            total: 21,
        }
    )
})

test("sameSourceStats: null, instancias distintas de Date y conteos", () => {
    const at = "2026-01-09T12:00:00Z"
    assert.equal(
        sameSourceStats(
            { ratedMatches: 0, maxUpdatedAt: null },
            { ratedMatches: 0, maxUpdatedAt: null }
        ),
        true
    )
    assert.equal(
        sameSourceStats(
            { ratedMatches: 3, maxUpdatedAt: new Date(at) },
            { ratedMatches: 3, maxUpdatedAt: new Date(at) }
        ),
        true
    )
    assert.equal(
        sameSourceStats(
            { ratedMatches: 3, maxUpdatedAt: new Date(at) },
            { ratedMatches: 4, maxUpdatedAt: new Date(at) }
        ),
        false
    )
    assert.equal(
        sameSourceStats(
            { ratedMatches: 3, maxUpdatedAt: new Date(at) },
            { ratedMatches: 3, maxUpdatedAt: new Date("2026-01-10T00:00:00Z") }
        ),
        false
    )
    assert.equal(
        sameSourceStats(
            { ratedMatches: 3, maxUpdatedAt: null },
            { ratedMatches: 3, maxUpdatedAt: new Date(at) }
        ),
        false
    )
})

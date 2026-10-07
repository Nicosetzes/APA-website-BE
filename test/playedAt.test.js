const assert = require("node:assert/strict")
const test = require("node:test")

const Match = require("../dao/models/matches")
const {
    PLAYED_AT_PRECISIONS,
    PLAYED_AT_SORT_STAGES,
    comparePlayedAtDesc,
    getPlayedAt,
    getPlayedAtPrecision,
    playedAtRangeCondition,
    resolvePlayedAtOnResult,
} = require("../utils/playedAt")

const PLAYED = new Date("2022-11-30T21:00:00.000Z")
const UPDATED = new Date("2023-05-10T12:00:00.000Z")

test("getPlayedAt prefers playedAt and falls back to updatedAt", () => {
    assert.equal(getPlayedAt({ playedAt: PLAYED, updatedAt: UPDATED }), PLAYED)
    assert.equal(getPlayedAt({ updatedAt: UPDATED }), UPDATED)
    assert.equal(getPlayedAt({}), null)
    assert.equal(getPlayedAt(null), null)
    assert.equal(getPlayedAt(undefined), null)
})

test("getPlayedAtPrecision defaults to exact and is null without dates", () => {
    assert.equal(
        getPlayedAtPrecision({ playedAt: PLAYED, playedAtPrecision: "year" }),
        "year"
    )
    assert.equal(getPlayedAtPrecision({ playedAt: PLAYED }), "exact")
    // La precisión sin playedAt no aplica a updatedAt.
    assert.equal(
        getPlayedAtPrecision({ updatedAt: UPDATED, playedAtPrecision: "year" }),
        "exact"
    )
    assert.equal(getPlayedAtPrecision({}), null)
    assert.equal(getPlayedAtPrecision(null), null)
})

test("comparePlayedAtDesc mixes playedAt and updatedAt, ties by _id desc and nulls last", () => {
    const matches = [
        { _id: "a1", updatedAt: new Date("2024-01-01T00:00:00Z") },
        { _id: "a2", playedAt: new Date("2019-06-01T00:00:00Z") },
        { _id: "a3", updatedAt: new Date("2024-01-01T00:00:00Z") },
        { _id: "a4" },
        {
            _id: "a5",
            playedAt: new Date("2025-01-01T00:00:00Z"),
            // updatedAt más viejo no importa: manda playedAt.
            updatedAt: new Date("2018-01-01T00:00:00Z"),
        },
        {
            _id: "a6",
            playedAt: new Date("2020-01-01T00:00:00Z"),
            // updatedAt más nuevo no importa: manda playedAt.
            updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
        { _id: "a0" },
    ]

    const sorted = [...matches].sort(comparePlayedAtDesc)

    assert.deepEqual(
        sorted.map(({ _id }) => _id),
        ["a5", "a3", "a1", "a6", "a2", "a4", "a0"]
    )
})

test("PLAYED_AT_SORT_STAGES sorts by playedAt ?? updatedAt then _id and drops the helper", () => {
    assert.deepEqual(PLAYED_AT_SORT_STAGES, [
        {
            $addFields: {
                _sortPlayedAt: { $ifNull: ["$playedAt", "$updatedAt"] },
            },
        },
        { $sort: { _sortPlayedAt: -1, _id: -1 } },
        { $project: { _sortPlayedAt: 0 } },
    ])
})

test("playedAtRangeCondition falls back to updatedAt only without playedAt", () => {
    const range = { $gte: PLAYED }

    assert.deepEqual(playedAtRangeCondition(range), {
        $or: [
            { playedAt: range },
            { playedAt: { $exists: false }, updatedAt: range },
        ],
    })
})

test("resolvePlayedAtOnResult keeps an existing playedAt", () => {
    const now = new Date("2026-04-01T00:00:00Z")

    assert.deepEqual(
        resolvePlayedAtOnResult(
            { played: true, playedAt: PLAYED, updatedAt: UPDATED },
            now
        ),
        {}
    )
})

test("resolvePlayedAtOnResult keeps the visible date of a match played before the backfill", () => {
    const now = new Date("2026-04-01T00:00:00Z")

    assert.deepEqual(
        resolvePlayedAtOnResult({ played: true, updatedAt: UPDATED }, now),
        { playedAt: UPDATED, playedAtPrecision: "exact" }
    )
    // Sin updatedAt cae a la fecha del ObjectId.
    assert.deepEqual(
        resolvePlayedAtOnResult(
            { played: true, _id: "5f5e10000000000000000000" },
            now
        ),
        {
            playedAt: new Date(0x5f5e1000 * 1000),
            playedAtPrecision: "exact",
        }
    )
})

test("resolvePlayedAtOnResult uses now for a first load", () => {
    const now = new Date("2026-04-01T00:00:00Z")

    assert.deepEqual(
        resolvePlayedAtOnResult({ played: false, updatedAt: UPDATED }, now),
        { playedAt: now, playedAtPrecision: "exact" }
    )
    assert.deepEqual(resolvePlayedAtOnResult(undefined, now), {
        playedAt: now,
        playedAtPrecision: "exact",
    })
})

test("match schema accepts playedAt and validates its precision without index", async () => {
    assert.deepEqual(PLAYED_AT_PRECISIONS, [
        "exact",
        "day",
        "month",
        "year",
        "approx",
    ])
    assert.equal(Match.schema.path("playedAt").instance, "Date")
    assert.deepEqual(
        Match.schema.path("playedAtPrecision").enumValues,
        PLAYED_AT_PRECISIONS
    )
    assert.equal(Match.schema.path("playedAt").defaultValue, undefined)
    assert.equal(
        Match.schema
            .indexes()
            .some(([fields]) =>
                Object.keys(fields).some((key) => key.startsWith("playedAt"))
            ),
        false
    )

    const invalid = new Match({ playedAtPrecision: "week" })
    const error = invalid.validateSync()
    assert.ok(error?.errors?.playedAtPrecision)

    const valid = new Match({ playedAt: PLAYED, playedAtPrecision: "year" })
    assert.equal(valid.validateSync()?.errors?.playedAtPrecision, undefined)
})

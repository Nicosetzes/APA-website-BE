const assert = require("node:assert/strict")
const test = require("node:test")

const Match = require("../dao/models/matches")
const {
    PLAYED_AT_PRECISIONS,
    PLAYED_AT_SORT,
    comparePlayedAtDesc,
    resolvePlayedAtOnResult,
} = require("../utils/playedAt")

const PLAYED = new Date("2022-11-30T21:00:00.000Z")
const UPDATED = new Date("2023-05-10T12:00:00.000Z")

test("PLAYED_AT_SORT sorts by playedAt desc then _id desc", () => {
    assert.deepEqual(PLAYED_AT_SORT, { playedAt: -1, _id: -1 })
})

test("comparePlayedAtDesc orders by playedAt, ties by _id desc and undated last", () => {
    const matches = [
        // updatedAt no cuenta: sin playedAt va al final.
        { _id: "a1", updatedAt: new Date("2030-01-01T00:00:00Z") },
        { _id: "a2", playedAt: new Date("2019-06-01T00:00:00Z") },
        {
            _id: "a3",
            playedAt: new Date("2025-01-01T00:00:00Z"),
            updatedAt: new Date("2018-01-01T00:00:00Z"),
        },
        { _id: "a4", playedAt: new Date("2025-01-01T00:00:00Z") },
        {
            _id: "a5",
            playedAt: new Date("2020-01-01T00:00:00Z"),
            updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
        { _id: "a0" },
    ]

    const sorted = [...matches].sort(comparePlayedAtDesc)

    assert.deepEqual(
        sorted.map(({ _id }) => _id),
        ["a4", "a3", "a5", "a2", "a1", "a0"]
    )
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

test("resolvePlayedAtOnResult uses now when there is no playedAt, played or not", () => {
    const now = new Date("2026-04-01T00:00:00Z")

    assert.deepEqual(
        resolvePlayedAtOnResult({ played: false, updatedAt: UPDATED }, now),
        { playedAt: now, playedAtPrecision: "exact" }
    )
    // Un jugado sin playedAt ya no conserva updatedAt ni la fecha del ObjectId.
    assert.deepEqual(
        resolvePlayedAtOnResult(
            {
                played: true,
                updatedAt: UPDATED,
                _id: "5f5e10000000000000000000",
            },
            now
        ),
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

"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
    FREE_TIER_WEEKLY_OUT_BYTES,
    formatBytes,
    formatMs,
    median,
    projectionFromString,
    readsWithinBudget,
    summarizeTimes,
} = require("../scripts/lib/readCost")
const findRatingMatches = require("../dao/findRatingMatches")

test("median handles odd, even and empty lists", () => {
    assert.equal(median([3, 1, 2]), 2)
    assert.equal(median([4, 1, 3, 2]), 2.5)
    assert.equal(median([]), null)
})

test("summarizeTimes returns min, median and max without mutating the input", () => {
    const values = [30, 10, 20]
    assert.deepEqual(summarizeTimes(values), { min: 10, median: 20, max: 30 })
    assert.deepEqual(values, [30, 10, 20])
    assert.equal(summarizeTimes([]), null)
})

test("formatBytes picks a readable unit", () => {
    assert.equal(formatBytes(512), "512 B")
    assert.equal(formatBytes(2048), "2.0 KB")
    assert.equal(formatBytes(1.5 * 1024 ** 2), "1.50 MB")
    assert.equal(formatBytes(null), "n/a")
})

test("formatMs formats milliseconds and handles missing values", () => {
    assert.equal(formatMs(12.345), "12.3 ms")
    assert.equal(formatMs(undefined), "n/a")
})

test("readsWithinBudget divides the weekly budget by the size of a read", () => {
    assert.equal(readsWithinBudget(1024 ** 2), 10 * 1024)
    assert.equal(readsWithinBudget(FREE_TIER_WEEKLY_OUT_BYTES), 1)
    assert.equal(readsWithinBudget(0), null)
})

test("projectionFromString turns a find projection into a $project stage", () => {
    assert.deepEqual(projectionFromString("a b.c  d"), {
        a: 1,
        "b.c": 1,
        d: 1,
    })
})

test("the measured projection and filter are the ones findRatingMatches uses", () => {
    assert.deepEqual(findRatingMatches.RATING_FILTER, {
        played: { $ne: false },
        valid: { $ne: false },
    })
    assert.ok(
        Object.keys(
            projectionFromString(findRatingMatches.RATING_PROJECTION)
        ).includes("tournament.id")
    )
})

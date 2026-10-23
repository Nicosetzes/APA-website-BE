const assert = require("node:assert/strict")
const test = require("node:test")

const {
    getArgentinaDayRange,
    getArgentinaToday,
    shiftArgentinaDate,
} = require("../utils/argentinaDay")

test("getArgentinaToday uses the fixed UTC-3 day boundary", () => {
    assert.equal(
        getArgentinaToday(new Date("2026-10-21T02:59:59.999Z")),
        "2026-10-20"
    )
    assert.equal(
        getArgentinaToday(new Date("2026-10-21T03:00:00.000Z")),
        "2026-10-21"
    )
    assert.equal(
        getArgentinaToday(new Date("2026-01-01T01:00:00.000Z")),
        "2025-12-31"
    )
})

test("getArgentinaToday defaults to the current instant", () => {
    const before = getArgentinaToday(new Date())
    const today = getArgentinaToday()

    assert.match(today, /^\d{4}-\d{2}-\d{2}$/)
    assert.ok(today >= before)
})

test("shiftArgentinaDate moves calendar days across months and years", () => {
    assert.equal(shiftArgentinaDate("2026-10-21", -7), "2026-10-14")
    assert.equal(shiftArgentinaDate("2026-03-02", -7), "2026-02-23")
    assert.equal(shiftArgentinaDate("2026-01-03", -7), "2025-12-27")
    assert.equal(shiftArgentinaDate("2028-03-01", -1), "2028-02-29")
    assert.equal(shiftArgentinaDate("2026-12-30", 3), "2027-01-02")
    assert.equal(shiftArgentinaDate("2026-10-21", 0), "2026-10-21")
})

test("a shifted date still starts at 03:00Z", () => {
    const { start } = getArgentinaDayRange(
        shiftArgentinaDate(
            getArgentinaToday(new Date("2026-10-21T10:00:00Z")),
            -7
        )
    )

    assert.equal(start.toISOString(), "2026-10-14T03:00:00.000Z")
})

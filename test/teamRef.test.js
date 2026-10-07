const assert = require("node:assert/strict")
const test = require("node:test")

const matchesModel = require("../dao/models/matches")
const findTeamRemainingMatchesByTournamentId = require("../dao/findTeamRemainingMatchesByTournamentId")
const {
    normalizeTeamEntries,
    normalizeTeamRef,
    sameTeamId,
    toTeamId,
} = require("../utils/teamRef")

test("toTeamId turns integers and numeric strings into numbers", () => {
    assert.equal(toTeamId(10), 10)
    assert.equal(toTeamId("10"), 10)
    assert.equal(toTeamId("0"), 0)
    assert.equal(toTeamId("legacy-id"), "legacy-id")
    assert.equal(toTeamId("-1"), "-1")
    assert.equal(toTeamId("1.5"), "1.5")
    assert.equal(toTeamId(1.5), 1.5)
    assert.equal(toTeamId(undefined), undefined)
})

test("normalizeTeamRef and normalizeTeamEntries are null-safe copies", () => {
    const team = { id: "435", name: "Team" }
    assert.deepEqual(normalizeTeamRef(team), { id: 435, name: "Team" })
    assert.equal(team.id, "435")
    assert.equal(normalizeTeamRef(null), null)
    assert.equal(normalizeTeamRef(undefined), undefined)

    const entries = [
        { team: { id: "1", name: "A" }, player: { id: "p" }, group: "A" },
        { team: null, player: { id: "q" } },
        null,
    ]
    assert.deepEqual(normalizeTeamEntries(entries), [
        { team: { id: 1, name: "A" }, player: { id: "p" }, group: "A" },
        { team: null, player: { id: "q" } },
        null,
    ])
    assert.equal(normalizeTeamEntries(undefined), undefined)
})

test("sameTeamId compares through String and never matches missing ids", () => {
    assert.equal(sameTeamId("10", 10), true)
    assert.equal(sameTeamId(10, 10), true)
    assert.equal(sameTeamId("10", "11"), false)
    assert.equal(sameTeamId(undefined, undefined), false)
    assert.equal(sameTeamId(null, "null"), false)
})

test("remaining matches query both id types of the team", async (t) => {
    const originalFind = matchesModel.find
    const filters = []
    t.after(() => {
        matchesModel.find = originalFind
    })
    matchesModel.find = async (filter) => {
        filters.push(filter)
        return []
    }

    const numeric = await findTeamRemainingMatchesByTournamentId(
        "tournament",
        "10"
    )
    await findTeamRemainingMatchesByTournamentId("tournament", "legacy-id")

    assert.deepEqual(numeric, { team: { id: "10" }, matches: [] })
    assert.deepEqual(filters[0].$or, [
        { "teamP1.id": { $in: ["10", 10] } },
        { "teamP2.id": { $in: ["10", 10] } },
    ])
    assert.deepEqual(filters[1].$or, [
        { "teamP1.id": { $in: ["legacy-id"] } },
        { "teamP2.id": { $in: ["legacy-id"] } },
    ])
    assert.equal(filters[0]["tournament.id"], "tournament")
})

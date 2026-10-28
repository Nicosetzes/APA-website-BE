process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
    getNextPlayoffRound,
    getPlayoffStartRound,
} = require("../config/playoffFormats")

test("getNextPlayoffRound follows the bracket of the format", () => {
    assert.equal(
        getNextPlayoffRound("world_cup_2026", "round_of_32"),
        "round_of_16"
    )
    assert.equal(
        getNextPlayoffRound("world_cup_2026", "round_of_16"),
        "quarterfinal"
    )
    assert.equal(getNextPlayoffRound("world_cup_2026", "semifinal"), "final")
    assert.equal(getNextPlayoffRound("world_cup_2026", "final"), null)
    assert.equal(
        getNextPlayoffRound("champions_league", "round_of_16"),
        "quarterfinal"
    )
    assert.equal(getNextPlayoffRound("champions_league", "final"), null)
})

test("getNextPlayoffRound is null for unknown rounds or null input", () => {
    assert.equal(getNextPlayoffRound("world_cup_2026", "preliminary"), null)
    assert.equal(getNextPlayoffRound("world_cup_2026", null), null)
    assert.equal(getNextPlayoffRound("world_cup_2026", undefined), null)
})

test("getPlayoffStartRound is the round played by the starting size", () => {
    assert.equal(getPlayoffStartRound("world_cup_2026"), "round_of_32")
    assert.equal(getPlayoffStartRound("playoff"), "round_of_32")
    assert.equal(getPlayoffStartRound("world_cup"), "round_of_16")
    assert.equal(getPlayoffStartRound("super_cup"), "round_of_16")
    assert.equal(getPlayoffStartRound("champions_league"), "round_of_16")
    assert.equal(getPlayoffStartRound("formato_desconocido"), "round_of_16")
})

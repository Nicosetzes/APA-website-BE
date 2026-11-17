const assert = require("node:assert/strict")
const test = require("node:test")
const { createGetStatistics } = require("../controller/getStatistics")

const response = () => ({
    statusCode: null,
    body: null,
    status(code) {
        this.statusCode = code
        return this
    },
    json(body) {
        this.body = body
        return this
    },
})

const baseDependencies = (calls) => ({
    retrieveAllUsers: async () => [{ id: 1, nickname: "Nico" }],
    retrieveAllMatches: async (options) => {
        calls.matches = options
        return []
    },
    retrieveTournamentsForStatistics: async () => {
        calls.tournaments += 1
        return []
    },
})

test("players section returns general and elimination stats without tournament reads", async () => {
    const calls = { tournaments: 0 }
    const controller = createGetStatistics(baseDependencies(calls), {
        sections: ["players"],
    })
    const res = response()

    await controller({ query: {} }, res)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(Object.keys(res.body), [
        "scope",
        "players",
        "decisiveMatchesStats",
    ])
    assert.deepEqual(calls.matches, { includeAllPlayoffs: false })
    assert.equal(calls.tournaments, 0)
})

test("leaderboards section returns only its requested aggregate", async () => {
    const calls = { tournaments: 0 }
    const controller = createGetStatistics(baseDependencies(calls), {
        sections: ["leaderboards"],
    })
    const res = response()

    await controller({ query: {} }, res)

    assert.deepEqual(Object.keys(res.body), ["scope", "leaderboards"])
    assert.deepEqual(calls.matches, { includeAllPlayoffs: false })
    assert.equal(calls.tournaments, 0)
})

test("records section loads playoff and tournament context", async () => {
    const calls = { tournaments: 0 }
    const controller = createGetStatistics(baseDependencies(calls), {
        sections: ["records"],
    })
    const res = response()

    await controller({ query: {}, requestId: "test" }, res)

    assert.deepEqual(Object.keys(res.body), [
        "scope",
        "records",
        "activeStreaks",
    ])
    assert.deepEqual(calls.matches, { includeAllPlayoffs: true })
    assert.equal(calls.tournaments, 1)
})

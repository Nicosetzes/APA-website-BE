const assert = require("node:assert/strict")
const test = require("node:test")

const tournamentsModel = require("../dao/models/tournaments")
const matchesModel = require("../dao/models/matches")
const createTournament = require("../dao/createTournament")
const createPlayoffByTournamentId = require("../dao/createPlayoffByTournamentId")
const {
    createPostTournaments,
} = require("../controller/postTournaments")
const withTransaction = require("../utils/withTransaction")

const createResponse = () => ({
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

test("withTransaction returns committed work and always closes its session", async () => {
    const events = []
    const session = {
        withTransaction: async (callback) => {
            events.push("begin")
            await callback()
            events.push("commit")
        },
        endSession: async () => events.push("end"),
    }

    const result = await withTransaction(
        async (activeSession) => {
            assert.equal(activeSession, session)
            events.push("work")
            return "result"
        },
        { startSession: async () => session }
    )

    assert.equal(result, "result")
    assert.deepEqual(events, ["begin", "work", "commit", "end"])
})

test("withTransaction propagates failure and closes its session", async () => {
    let ended = false
    const expectedError = new Error("insert failed")
    const session = {
        withTransaction: async (callback) => callback(),
        endSession: async () => {
            ended = true
        },
    }

    await assert.rejects(
        withTransaction(
            async () => {
                throw expectedError
            },
            { startSession: async () => session }
        ),
        expectedError
    )
    assert.equal(ended, true)
})

test("tournament DAO uses the array form required for session options", async (t) => {
    const originalCreate = tournamentsModel.create
    const session = { id: "session" }
    let received

    t.after(() => {
        tournamentsModel.create = originalCreate
    })

    tournamentsModel.create = async (...args) => {
        received = args
        return [{ _id: "tournament" }]
    }

    const result = await createTournament({ name: "Tournament" }, { session })

    assert.deepEqual(received, [[{ name: "Tournament" }], { session }])
    assert.equal(result._id, "tournament")
})

test("playoff DAO passes the same session to insertMany", async (t) => {
    const originalInsertMany = matchesModel.insertMany
    const session = { id: "session" }
    const matches = [{ type: "playoff" }]
    let received

    t.after(() => {
        matchesModel.insertMany = originalInsertMany
    })

    matchesModel.insertMany = async (...args) => {
        received = args
        return matches
    }

    const result = await createPlayoffByTournamentId(matches, { session })

    assert.deepEqual(received, [matches, { session }])
    assert.equal(result, matches)
})

test("playoff tournament creation shares one session and responds after commit", async () => {
    const session = { id: "session" }
    const createdTournament = { _id: "tournament", name: "Playoff" }
    const calls = []
    let committed = false

    const controller = createPostTournaments({
        originateTournament: async (payload, options) => {
            calls.push(["tournament", payload, options])
            return createdTournament
        },
        originatePlayoffByTournamentId: async (tournament, teams, options) => {
            calls.push(["playoff", tournament, teams, options])
        },
        withTransaction: async (work) => {
            const result = await work(session)
            committed = true
            return result
        },
    })
    const response = createResponse()
    const originalJson = response.json
    response.json = function json(body) {
        assert.equal(committed, true)
        return originalJson.call(this, body)
    }

    await controller(
        {
            body: {
                format: "playoff",
                name: "Playoff",
                players: [{ id: "player", name: "Player" }],
                teams: [{ playoff_id: 1 }, { playoff_id: 1 }],
            },
        },
        response
    )

    assert.equal(calls[0][2].session, session)
    assert.equal(calls[1][1], createdTournament)
    assert.equal(calls[1][3].session, session)
    assert.equal(response.statusCode, 200)
    assert.equal(response.body, createdTournament)
})

test("non-playoff tournament creation does not open a transaction", async () => {
    let transactionCalls = 0
    const controller = createPostTournaments({
        originateTournament: async () => ({ _id: "tournament" }),
        originatePlayoffByTournamentId: async () => {},
        withTransaction: async () => {
            transactionCalls += 1
        },
    })
    const response = createResponse()

    await controller(
        {
            body: {
                format: "league",
                name: "League",
                players: [{ id: "player", name: "Player" }],
                teams: [{ team: {}, player: {} }],
            },
        },
        response
    )

    assert.equal(transactionCalls, 0)
    assert.equal(response.statusCode, 200)
})

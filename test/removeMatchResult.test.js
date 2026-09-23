const assert = require("node:assert/strict")
const test = require("node:test")

const matchesModel = require("../dao/models/matches")
const updateMatchResultToRemoveIt = require("../dao/updateMatchResultToRemoveIt")
const {
    createPutRemoveMatchByTournamentId,
} = require("../controller/putRemoveMatchByTournamentId")

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

test("remove result controller returns the match without result", async () => {
    let receivedMatchId
    const matchWithoutResult = { _id: "match", played: false }
    const controller = createPutRemoveMatchByTournamentId({
        modifyMatchResultToRemoveIt: async (matchId) => {
            receivedMatchId = matchId
            return matchWithoutResult
        },
    })
    const response = createResponse()

    await controller(
        {
            params: {
                tournament: "aaaaaaaaaaaaaaaaaaaaaaaa",
                match: "bbbbbbbbbbbbbbbbbbbbbbbb",
            },
        },
        response
    )

    assert.equal(receivedMatchId, "bbbbbbbbbbbbbbbbbbbbbbbb")
    assert.equal(response.statusCode, 200)
    assert.equal(response.body, matchWithoutResult)
})

test("remove result controller answers 404 when the match disappeared", async () => {
    const controller = createPutRemoveMatchByTournamentId({
        modifyMatchResultToRemoveIt: async () => null,
    })
    const response = createResponse()

    await assert.rejects(
        controller(
            {
                params: {
                    tournament: "aaaaaaaaaaaaaaaaaaaaaaaa",
                    match: "bbbbbbbbbbbbbbbbbbbbbbbb",
                },
            },
            response
        ),
        (error) => {
            assert.equal(error.status, 404)
            assert.equal(error.code, "MATCH_NOT_FOUND")
            return true
        }
    )
    assert.equal(response.statusCode, null)
})

test("remove result controller propagates persistence failures", async () => {
    const expectedError = new Error("Mongo failed")
    const controller = createPutRemoveMatchByTournamentId({
        modifyMatchResultToRemoveIt: async () => {
            throw expectedError
        },
    })

    await assert.rejects(
        controller(
            {
                params: {
                    tournament: "aaaaaaaaaaaaaaaaaaaaaaaa",
                    match: "bbbbbbbbbbbbbbbbbbbbbbbb",
                },
            },
            createResponse()
        ),
        expectedError
    )
})

test("remove result DAO clears scores and outcome without touching history", async (t) => {
    const originalFindByIdAndUpdate = matchesModel.findByIdAndUpdate
    let receivedId
    let receivedUpdate
    let receivedOptions

    t.after(() => {
        matchesModel.findByIdAndUpdate = originalFindByIdAndUpdate
    })

    matchesModel.findByIdAndUpdate = async (id, update, options) => {
        receivedId = id
        receivedUpdate = update
        receivedOptions = options
        return { _id: id, played: false }
    }

    await updateMatchResultToRemoveIt("bbbbbbbbbbbbbbbbbbbbbbbb")

    assert.equal(receivedId, "bbbbbbbbbbbbbbbbbbbbbbbb")
    assert.deepEqual(receivedUpdate, {
        $unset: { scoreP1: 1, scoreP2: 1, outcome: 1 },
        played: false,
    })
    assert.equal(receivedOptions.new, true)
})

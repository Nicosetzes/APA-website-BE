const assert = require("node:assert/strict")
const test = require("node:test")

const {
    calculateOutcome,
    createPutMatchByTournamentId,
} = require("../controller/putMatchByTournamentId")

const playerP1 = { id: "player-1", name: "Player 1" }
const playerP2 = { id: "player-2", name: "Player 2" }
const teamP1 = { id: "team-1", name: "Team 1" }
const teamP2 = { id: "team-2", name: "Team 2" }

const createResponse = () => ({
    statusCode: null,
    body: null,
    status(code) {
        this.statusCode = code
        return this
    },
    send(body) {
        this.body = body
        return this
    },
})

const createRequest = (overrides = {}) => ({
    params: { tournament: "tournament", match: "match" },
    body: {
        playerP1,
        teamP1,
        seedP1: "1A",
        scoreP1: 1,
        penaltyScoreP1: 5,
        playerP2,
        teamP2,
        seedP2: "1B",
        scoreP2: 1,
        penaltyScoreP2: 4,
        valid: true,
        isThisTheFinal: true,
        ...overrides,
    },
})

test("outcome calculation preserves regular and penalty semantics", () => {
    const regular = calculateOutcome({
        playerP1,
        teamP1,
        scoreP1: 2,
        playerP2,
        teamP2,
        scoreP2: 1,
    })
    const draw = calculateOutcome({
        playerP1,
        teamP1,
        scoreP1: 1,
        playerP2,
        teamP2,
        scoreP2: 1,
    })
    const penalties = calculateOutcome({
        playerP1,
        teamP1,
        seedP1: "1A",
        scoreP1: 1,
        penaltyScoreP1: 5,
        playerP2,
        teamP2,
        seedP2: "1B",
        scoreP2: 1,
        penaltyScoreP2: 4,
    })

    assert.equal(regular.teamThatWon, teamP1)
    assert.equal(regular.scoringDifference, 1)
    assert.deepEqual(draw, { draw: true, penalties: false })
    assert.equal(penalties.teamThatWon, teamP1)
    assert.equal(penalties.draw, true)
    assert.equal(penalties.penalties, true)
})

test("result, final outcome and playoff progression share one transaction", async () => {
    const session = { id: "session" }
    const updatedMatch = {
        _id: "match",
        type: "playoff",
        tournament: { id: "tournament", name: "Tournament" },
    }
    const calls = []
    let committed = false

    const controller = createPutMatchByTournamentId({
        modifyMatchResult: async (...args) => {
            calls.push(["match", args.at(-1)])
            return updatedMatch
        },
        modifyTournamentOutcome: async (...args) => {
            calls.push(["outcome", args.at(-1)])
        },
        retrieveTournamentById: async (...args) => {
            calls.push(["tournament", args.at(-1)])
            return { id: "tournament", name: "Tournament", format: "world_cup" }
        },
        retrievePlayoffMatchesByTournamentId: async (...args) => {
            calls.push(["matches", args.at(-1)])
            return [updatedMatch]
        },
        generatePlayoffUpdate: async (...args) => {
            calls.push(["playoff", args.at(-1)])
        },
        withTransaction: async (work) => {
            const result = await work(session)
            committed = true
            return result
        },
    })
    const response = createResponse()
    const originalSend = response.send
    response.send = function send(body) {
        assert.equal(committed, true)
        return originalSend.call(this, body)
    }

    await controller(createRequest(), response)

    assert.deepEqual(
        calls.map(([name, options]) => [name, options.session]),
        [
            ["match", session],
            ["outcome", session],
            ["tournament", session],
            ["matches", session],
            ["playoff", session],
        ]
    )
    assert.equal(response.statusCode, 200)
    assert.equal(response.body, updatedMatch)
})

test("a late playoff failure rejects before sending a response", async () => {
    const expectedError = new Error("playoff update failed")
    let aborted = false
    const controller = createPutMatchByTournamentId({
        modifyMatchResult: async () => ({
            type: "playoff",
            tournament: { id: "tournament" },
        }),
        modifyTournamentOutcome: async () => {},
        retrieveTournamentById: async () => ({
            id: "tournament",
            name: "Tournament",
            format: "world_cup",
        }),
        retrievePlayoffMatchesByTournamentId: async () => [],
        generatePlayoffUpdate: async () => {
            throw expectedError
        },
        withTransaction: async (work) => {
            try {
                return await work({ id: "session" })
            } catch (error) {
                aborted = true
                throw error
            }
        },
    })
    const response = createResponse()

    await assert.rejects(controller(createRequest(), response), expectedError)

    assert.equal(aborted, true)
    assert.equal(response.statusCode, null)
    assert.equal(response.body, null)
})

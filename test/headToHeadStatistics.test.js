const assert = require("node:assert/strict")
const test = require("node:test")

const {
    buildHeadToHeadSummary,
} = require("../service/retrieveHeadToHeadSummary")
const {
    createGetHeadToHeadSummary,
} = require("../controller/getHeadToHeadSummary")
const {
    createGetHeadToHeadDetail,
} = require("../controller/getHeadToHeadDetail")
const {
    buildHeadToHeadFilter,
} = require("../dao/findHeadToHeadMatchesForAssistant")

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

const users = [
    { id: 1, nickname: "Nico" },
    { id: 2, nickname: "Santi" },
    { id: 3, nickname: "Leo" },
]

const match = (playerP1, scoreP1, playerP2, scoreP2) => ({
    playerP1: { id: playerP1 },
    scoreP1,
    playerP2: { id: playerP2 },
    scoreP2,
})

test("head-to-head summary aggregates every pair in one mirrored record", () => {
    const result = buildHeadToHeadSummary({
        users,
        matches: [match(1, 3, 2, 1), match(2, 2, 1, 2), match(2, 4, 1, 0)],
    })

    assert.equal(result.players.length, 3)
    assert.equal(result.pairs.length, 3)

    const pair = result.pairs.find(
        ({ playerA, playerB }) =>
            [playerA.id, playerB.id].includes("1") &&
            [playerA.id, playerB.id].includes("2")
    )
    assert.deepEqual(pair, {
        playerA: { id: "1", name: "Nico" },
        playerB: { id: "2", name: "Santi" },
        matches: 3,
        playerAWins: 1,
        draws: 1,
        playerBWins: 1,
        playerAGoals: 5,
        playerBGoals: 7,
        playerAGoalDifference: -2,
        playerBGoalDifference: 2,
        bestWin: {
            playerA: {
                score: "3-1",
                winnerTeam: null,
                loserTeam: null,
            },
            playerB: {
                score: "4-0",
                winnerTeam: null,
                loserTeam: null,
            },
        },
    })

    const empty = result.pairs.filter(({ matches }) => matches === 0)
    assert.equal(empty.length, 2)
})

test("head-to-head summary skips incomplete and unknown-player matches", () => {
    const result = buildHeadToHeadSummary({
        users: users.slice(0, 2),
        matches: [match(1, null, 2, 0), match(1, 2, 99, 0)],
    })
    assert.equal(result.pairs[0].matches, 0)
})

test("date filters use inclusive Argentine calendar days", () => {
    const filter = buildHeadToHeadFilter({
        playerA: "1",
        playerB: "2",
        dateFrom: "2026-01-01",
        dateTo: "2026-01-31",
    })
    const dateCondition = filter.$and.find(({ playedAt }) => playedAt)

    assert.equal(
        dateCondition.playedAt.$gte.toISOString(),
        "2026-01-01T03:00:00.000Z"
    )
    assert.equal(
        dateCondition.playedAt.$lt.toISOString(),
        "2026-02-01T03:00:00.000Z"
    )
})

test("summary controller returns the public response", async () => {
    const expected = { players: [], pairs: [] }
    const controller = createGetHeadToHeadSummary({
        retrieveHeadToHeadSummary: async () => expected,
    })
    const res = response()
    await controller({}, res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body, expected)
})

test("detail controller forwards path and query filters", async () => {
    let received
    const expected = { record: { matches: 2 } }
    const controller = createGetHeadToHeadDetail({
        retrieveHeadToHead: async (...args) => {
            received = args
            return expected
        },
    })
    const res = response()

    await controller(
        {
            params: { playerA: "1", playerB: "2" },
            query: {
                stage: "playoff",
                tournamentId: "t",
                dateFrom: "2026-01-01",
                dateTo: "2026-12-31",
                limit: 8,
            },
        },
        res
    )

    assert.deepEqual(received, [
        {
            playerA: "1",
            playerB: "2",
            stage: "playoff",
            tournamentId: "t",
            dateFrom: "2026-01-01",
            dateTo: "2026-12-31",
            limit: 8,
        },
        { addRatingChanges: undefined },
    ])
    assert.equal(res.statusCode, 200)
    assert.equal(res.body, expected)
})

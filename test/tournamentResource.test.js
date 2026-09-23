const assert = require("node:assert/strict")
const test = require("node:test")

const { createGetTournamentById } = require("../controller/getTournamentById")
const {
    buildTournamentSummary,
    createGetTournamentSummaryByTournamentId,
} = require("../controller/getTournamentSummaryByTournamentId")

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

test("tournament detail preserves the full document response", async () => {
    const tournament = { _id: "tournament", name: "Tournament", teams: [] }
    const controller = createGetTournamentById({
        retrieveTournamentById: async () => tournament,
    })
    const response = createResponse()

    await controller({ params: { tournament: "tournament" } }, response)

    assert.equal(response.statusCode, 200)
    assert.equal(response.body, tournament)
})

test("tournament detail returns canonical not-found", async () => {
    const controller = createGetTournamentById({
        retrieveTournamentById: async () => null,
    })

    const error = await controller(
        { params: { tournament: "tournament" } },
        createResponse()
    ).catch((caughtError) => caughtError)

    assert.equal(error.status, 404)
    assert.equal(error.code, "TOURNAMENT_NOT_FOUND")
})

test("tournament summary keeps recent ordering and participant statistics", () => {
    const tournament = {
        id: "tournament",
        name: "Tournament",
        ongoing: false,
        outcome: { champion: { id: "champion" }, finalist: { id: "finalist" } },
        players: [
            { id: "p1", name: "Player 1" },
            { id: "p2", name: "Player 2" },
            { id: "p3", name: "Player 3" },
        ],
    }
    const matches = [
        {
            _id: "older",
            playerP1: { id: "p1" },
            teamP1: { id: "t1" },
            scoreP1: 1,
            playerP2: { id: "p2" },
            teamP2: { id: "t2" },
            scoreP2: 1,
            type: "regular",
            updatedAt: new Date("2026-01-01"),
        },
        {
            _id: "newer",
            playerP1: { id: "p1" },
            teamP1: { id: "t1" },
            scoreP1: 2,
            playerP2: { id: "p2" },
            teamP2: { id: "t2" },
            scoreP2: 1,
            type: "regular",
            updatedAt: new Date("2026-02-01"),
        },
    ]

    const summary = buildTournamentSummary(tournament, matches)

    assert.deepEqual(
        summary.matches.recent.map(({ id }) => id),
        ["newer", "older"]
    )
    assert.equal(summary.matches.totalPlayed, 2)
    assert.deepEqual(summary.participants[0], {
        player: { id: "p1", name: "Player 1", nickname: undefined },
        played: 2,
        wins: 1,
        draws: 1,
        losses: 0,
        goalsFor: 3,
        goalsAgainst: 2,
        scoringDifference: 1,
        effectiveness: 66.67,
        streak: "1W",
    })
    assert.equal(summary.participants[2].played, 0)
    assert.deepEqual(summary.outcome, tournament.outcome)
})

test("ongoing tournament summary does not expose an outcome section", () => {
    const summary = buildTournamentSummary(
        { id: "tournament", name: "Tournament", ongoing: true, players: [] },
        []
    )

    assert.equal(summary.outcome, undefined)
    assert.deepEqual(summary.participants, [])
})

test("summary not-found does not query matches", async () => {
    let matchQueries = 0
    const controller = createGetTournamentSummaryByTournamentId({
        retrieveTournamentById: async () => null,
        retrieveAllPlayedMatchesByTournamentId: async () => {
            matchQueries += 1
            return []
        },
    })

    const error = await controller(
        { params: { tournament: "tournament" } },
        createResponse()
    ).catch((caughtError) => caughtError)

    assert.equal(error.status, 404)
    assert.equal(error.code, "TOURNAMENT_NOT_FOUND")
    assert.equal(matchQueries, 0)
})

test("summary controller preserves dependency arguments and response", async () => {
    let received
    const controller = createGetTournamentSummaryByTournamentId({
        retrieveTournamentById: async () => ({
            id: "tournament",
            name: "Tournament",
            ongoing: true,
            players: [],
        }),
        retrieveAllPlayedMatchesByTournamentId: async (...args) => {
            received = args
            return []
        },
    })
    const response = createResponse()

    await controller({ params: { tournament: "tournament" } }, response)

    assert.deepEqual(received, ["tournament", false])
    assert.equal(response.statusCode, 200)
    assert.equal(response.body.matches.totalPlayed, 0)
})

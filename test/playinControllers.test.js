const assert = require("node:assert/strict")
const test = require("node:test")

const {
    createGetPlayinMatchesByTournamentId,
} = require("../controller/getPlayinMatchesByTournamentId")
const {
    createPostPlayinByTournamentId,
} = require("../controller/postPlayinByTournamentId")
const {
    createPostPlayinUpdateByTournamentId,
} = require("../controller/postPlayinUpdateByTournamentId")

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

const createTeams = (group = "A") =>
    Array.from({ length: 10 }, (_, index) => ({
        group,
        team: { id: `team-${index + 1}`, name: `Team ${index + 1}` },
        player: { id: `player-${index + 1}`, name: `Player ${index + 1}` },
    }))

const outcome = (prefix) => ({
    playerThatWon: { id: `${prefix}-winner`, name: "Winner" },
    teamThatWon: { id: `${prefix}-winner-team`, name: "Winner Team" },
    seedFromTeamThatWon: `${prefix}-winner-seed`,
    playerThatLost: { id: `${prefix}-loser`, name: "Loser" },
    teamThatLost: { id: `${prefix}-loser-team`, name: "Loser Team" },
    seedFromTeamThatLost: `${prefix}-loser-seed`,
})

test("GET play-in preserves an empty successful response", async () => {
    const controller = createGetPlayinMatchesByTournamentId({
        retrieveTournamentById: async () => ({ _id: "tournament" }),
        retrievePlayinMatchesByTournamentId: async () => [],
    })
    const response = createResponse()

    await controller({ params: { tournament: "tournament" } }, response)

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.body, { matches: [] })
})

test("GET play-in returns canonical tournament not-found", async () => {
    const controller = createGetPlayinMatchesByTournamentId({
        retrieveTournamentById: async () => null,
        retrievePlayinMatchesByTournamentId: async () => [],
    })

    const error = await controller(
        { params: { tournament: "tournament" } },
        createResponse()
    ).catch((caughtError) => caughtError)

    assert.equal(error.status, 404)
    assert.equal(error.code, "TOURNAMENT_NOT_FOUND")
})

test("POST play-in creates the expected first-round IDs and seeds", async () => {
    let created
    const controller = createPostPlayinByTournamentId({
        retrieveTournamentById: async () => ({
            id: "tournament",
            name: "Tournament",
            format: "league_playin_playoff",
            groups: ["A", "B"],
            teams: createTeams("A"),
        }),
        retrievePlayinMatchesByTournamentId: async () => [],
        orderMatchesFromTournamentById: async () => [],
        originatePlayinByTournamentId: async (matches) => {
            created = matches
            return matches
        },
    })
    const response = createResponse()

    await controller(
        { params: { tournament: "tournament" }, body: { group: "A" } },
        response
    )

    assert.deepEqual(
        created.map(({ playoff_id }) => playoff_id),
        [1, 2]
    )
    assert.deepEqual(
        created.map(({ seedP1, seedP2 }) => [seedP1, seedP2]),
        [
            ["7", "8"],
            ["9", "10"],
        ]
    )
    assert.equal(response.body, created)
})

test("POST play-in rejects duplicate generation and invalid participants", async () => {
    const baseTournament = {
        id: "tournament",
        name: "Tournament",
        format: "league_playin_playoff",
        groups: ["A"],
        teams: createTeams("A"),
    }
    const duplicateController = createPostPlayinByTournamentId({
        retrieveTournamentById: async () => baseTournament,
        retrievePlayinMatchesByTournamentId: async () => [{ group: "A" }],
        orderMatchesFromTournamentById: async () => [],
        originatePlayinByTournamentId: async () => [],
    })
    const invalidController = createPostPlayinByTournamentId({
        retrieveTournamentById: async () => ({
            ...baseTournament,
            teams: createTeams("A").slice(0, 9),
        }),
        retrievePlayinMatchesByTournamentId: async () => [],
        orderMatchesFromTournamentById: async () => [],
        originatePlayinByTournamentId: async () => [],
    })
    const request = {
        params: { tournament: "tournament" },
        body: { group: "A" },
    }

    const duplicateError = await duplicateController(
        request,
        createResponse()
    ).catch((error) => error)
    const invalidError = await invalidController(
        request,
        createResponse()
    ).catch((error) => error)

    assert.equal(duplicateError.code, "PLAYIN_ALREADY_EXISTS")
    assert.equal(duplicateError.status, 409)
    assert.equal(invalidError.code, "PLAYIN_PARTICIPANTS_INVALID")
    assert.equal(invalidError.status, 422)
})

test("play-in update uses playoff IDs rather than array positions", async () => {
    let created
    const matches = [
        { playoff_id: 4, played: true, group: "B", outcome: outcome("4") },
        { playoff_id: 2, played: true, group: "A", outcome: outcome("2") },
        { playoff_id: 3, played: true, group: "B", outcome: outcome("3") },
        { playoff_id: 1, played: true, group: "A", outcome: outcome("1") },
    ]
    const controller = createPostPlayinUpdateByTournamentId({
        retrieveTournamentById: async () => ({
            id: "tournament",
            name: "Tournament",
            format: "league_playin_playoff",
        }),
        retrievePlayinMatchesByTournamentId: async () => matches,
        originatePlayinByTournamentId: async (newMatches) => {
            created = newMatches
            return newMatches
        },
    })
    const response = createResponse()

    await controller(
        { params: { tournament: "tournament" }, body: { round: 2 } },
        response
    )

    assert.deepEqual(
        created.map(({ playoff_id }) => playoff_id),
        [5, 6]
    )
    assert.equal(created[0].playerP1.id, "1-loser")
    assert.equal(created[0].playerP2.id, "2-winner")
    assert.equal(response.body, created)
})

test("play-in update reports not-ready and already-generated states as 409", async () => {
    const tournament = {
        id: "tournament",
        name: "Tournament",
        format: "league_playin_playoff",
    }
    const createController = (matches) =>
        createPostPlayinUpdateByTournamentId({
            retrieveTournamentById: async () => tournament,
            retrievePlayinMatchesByTournamentId: async () => matches,
            originatePlayinByTournamentId: async () => [],
        })
    const request = {
        params: { tournament: "tournament" },
        body: { round: 2 },
    }

    const notReady = await createController([])(
        request,
        createResponse()
    ).catch((error) => error)
    const alreadyGenerated = await createController([
        { playoff_id: 5 },
        { playoff_id: 6 },
    ])(request, createResponse()).catch((error) => error)

    assert.equal(notReady.code, "PLAYIN_ROUND_NOT_READY")
    assert.equal(alreadyGenerated.code, "PLAYIN_ROUND_ALREADY_GENERATED")
})

test("play-in update rejects played sources without complete outcomes", async () => {
    const controller = createPostPlayinUpdateByTournamentId({
        retrieveTournamentById: async () => ({
            id: "tournament",
            name: "Tournament",
            format: "league_playin_playoff",
        }),
        retrievePlayinMatchesByTournamentId: async () => [
            { playoff_id: 1, played: true, outcome: {} },
            { playoff_id: 2, played: true, outcome: {} },
        ],
        originatePlayinByTournamentId: async () => [],
    })

    const error = await controller(
        { params: { tournament: "tournament" }, body: { round: 2 } },
        createResponse()
    ).catch((caughtError) => caughtError)

    assert.equal(error.status, 422)
    assert.equal(error.code, "PLAYIN_DATA_INVALID")
})

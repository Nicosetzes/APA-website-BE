const assert = require("node:assert/strict")
const test = require("node:test")

const {
    createGetPlayinMatchesByTournamentId,
} = require("../controller/getPlayinMatchesByTournamentId")
const {
    createPostPlayinByTournamentId,
} = require("../controller/postPlayinByTournamentId")

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

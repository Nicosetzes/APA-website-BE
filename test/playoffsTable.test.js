const assert = require("node:assert/strict")
const test = require("node:test")

const {
    createGetPlayoffsTableByTournamentId,
} = require("../controller/getPlayoffsTableByTournamentId")

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

const TOURNAMENT_ID = "aaaaaaaaaaaaaaaaaaaaaaaa"

const team = (id, name, group) => ({
    team: { id, name },
    player: { id: `p${id}`, name: `Player ${id}` },
    group,
})

// Ocho equipos por grupo, como exige el formato.
const createTeams = () => [
    ...Array.from({ length: 8 }, (_, index) =>
        team(`a${index + 1}`, `A${index + 1}`, "A")
    ),
    ...Array.from({ length: 8 }, (_, index) =>
        team(`b${index + 1}`, `B${index + 1}`, "B")
    ),
]

// A1 gana su partido, así queda arriba de todos por puntos.
const createMatches = () => [
    {
        playerP1: { id: "pa1", name: "Player a1" },
        teamP1: { id: "a1", name: "A1" },
        scoreP1: 2,
        playerP2: { id: "pa2", name: "Player a2" },
        teamP2: { id: "a2", name: "A2" },
        scoreP2: 0,
        outcome: { draw: false, teamThatWon: { id: "a1" } },
    },
]

const createController = (overrides = {}) =>
    createGetPlayoffsTableByTournamentId({
        retrieveTournamentById: async () => ({
            format: "league_playin_playoff",
            teams: createTeams(),
        }),
        orderMatchesFromTournamentById: async () => createMatches(),
        retrievePlayinMatchesByTournamentId: async () => [],
        ...overrides,
    })

test("playoffs table returns the six best teams of each group", async () => {
    const controller = createController()
    const response = createResponse()

    await controller({ params: { tournament: TOURNAMENT_ID } }, response)

    assert.equal(response.statusCode, 200)
    assert.equal(response.body.standings.length, 12)
    assert.equal(response.body.standings[0].team.id, "a1")
    assert.equal(response.body.standings[0].points, 3)
    assert.equal(response.body.standings[0].scoringDifference, 2)

    // A2 perdió, así que no entra entre los seis mejores de su grupo.
    const ids = response.body.standings.map((row) => row.team.id)
    assert.equal(ids.includes("a2"), false)
})

test("playoffs table appends play-in qualifiers after the direct ones", async () => {
    const controller = createController({
        // Sin partidos jugados el orden de cada grupo es el de carga, así los
        // seeds 7 y 8 caen sobre a7/a8 y b7/b8.
        orderMatchesFromTournamentById: async () => [],
        retrievePlayinMatchesByTournamentId: async () => [
            // Ronda 1: ganan los séptimos de cada grupo.
            {
                played: true,
                playoff_id: "1",
                outcome: { seedFromTeamThatWon: "7" },
            },
            {
                played: true,
                playoff_id: "3",
                outcome: { seedFromTeamThatWon: "7" },
            },
            // Ronda 2: ganan los octavos.
            {
                played: true,
                playoff_id: "5",
                outcome: { seedFromTeamThatWon: "8" },
            },
            {
                played: true,
                playoff_id: "6",
                outcome: { seedFromTeamThatWon: "8" },
            },
            { played: false, playoff_id: "2", outcome: {} },
        ],
    })
    const response = createResponse()

    await controller({ params: { tournament: TOURNAMENT_ID } }, response)

    const ids = response.body.standings.map((row) => row.team.id)

    assert.equal(ids.length, 16)
    // Los clasificados de la primera ronda quedan antes que los de la segunda.
    assert.deepEqual(ids.slice(12), ["a7", "b7", "a8", "b8"])
})

test("playoffs table stays empty for other formats", async () => {
    let askedForMatches = false
    const controller = createController({
        retrieveTournamentById: async () => ({
            format: "league",
            teams: createTeams(),
        }),
        retrievePlayinMatchesByTournamentId: async () => {
            askedForMatches = true
            return []
        },
    })
    const response = createResponse()

    await controller({ params: { tournament: TOURNAMENT_ID } }, response)

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.body, { standings: [] })
    assert.equal(askedForMatches, false)
})

test("playoffs table tolerates historical tournaments with incomplete groups", async () => {
    const controller = createController({
        retrieveTournamentById: async () => ({
            format: "league_playin_playoff",
            teams: [team("a1", "A1", "A"), team("b1", "B1", "B")],
        }),
        orderMatchesFromTournamentById: async () => [],
    })
    const response = createResponse()

    await controller({ params: { tournament: TOURNAMENT_ID } }, response)

    assert.equal(response.statusCode, 200)
    assert.equal(response.body.standings.length, 2)
    assert.deepEqual(response.body.standings.map((row) => row.team.id).sort(), [
        "a1",
        "b1",
    ])
})

test("playoffs table answers 404 for a missing tournament", async () => {
    const controller = createController({
        retrieveTournamentById: async () => null,
    })
    const response = createResponse()

    await assert.rejects(
        controller({ params: { tournament: TOURNAMENT_ID } }, response),
        (error) => {
            assert.equal(error.status, 404)
            assert.equal(error.code, "TOURNAMENT_NOT_FOUND")
            return true
        }
    )
    assert.equal(response.statusCode, null)
})

test("playoffs table propagates persistence failures", async () => {
    const expectedError = new Error("Mongo failed")
    const controller = createController({
        orderMatchesFromTournamentById: async () => {
            throw expectedError
        },
    })

    await assert.rejects(
        controller({ params: { tournament: TOURNAMENT_ID } }, createResponse()),
        expectedError
    )
})

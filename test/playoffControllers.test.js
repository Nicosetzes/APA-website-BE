const assert = require("node:assert/strict")
const test = require("node:test")

const {
    createGetPlayoffMatchesByTournamentId,
} = require("../controller/getPlayoffMatchesByTournamentId")
const {
    createPostPlayoffByTournamentId,
} = require("../controller/postPlayoffByTournamentId")

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

const teams = [
    {
        group: "A",
        team: { id: 1, name: "Team 1" },
        player: { id: "player-1", name: "Player 1" },
    },
    {
        group: "A",
        team: { id: 2, name: "Team 2" },
        player: { id: "player-2", name: "Player 2" },
    },
]

const createDependencies = (overrides = {}) => ({
    retrieveTournamentById: async () => ({
        id: "tournament",
        name: "Tournament",
        format: "world_cup",
        teams,
    }),
    retrievePlayoffMatchesByTournamentId: async () => [],
    orderMatchesFromTournamentById: async () => [],
    retrievePlayinMatchesByTournamentId: async () => [],
    originateChampionsLeaguePlayoffByTournamentId: async () => [],
    originatePlayoffWithPlayinByTournamentId: async () => [],
    originateWorldCupPlayoffByTournamentId: async () => [],
    calculateGroupStagePlayoff: () => ({ playoffMatches: [] }),
    createPlayoffByTournamentId: async () => [],
    ...overrides,
})

test("GET playoff preserves an empty successful response", async () => {
    const controller = createGetPlayoffMatchesByTournamentId({
        retrieveTournamentById: async () => ({ _id: "tournament" }),
        retrievePlayoffMatchesByTournamentId: async () => [],
    })
    const response = createResponse()

    await controller({ params: { tournament: "tournament" } }, response)

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.body, { matches: [] })
})

test("GET playoff returns canonical tournament not-found", async () => {
    const controller = createGetPlayoffMatchesByTournamentId({
        retrieveTournamentById: async () => null,
        retrievePlayoffMatchesByTournamentId: async () => [],
    })

    const error = await controller(
        { params: { tournament: "tournament" } },
        createResponse()
    ).catch((caughtError) => caughtError)

    assert.equal(error.status, 404)
    assert.equal(error.code, "TOURNAMENT_NOT_FOUND")
})

const NICO = { id: "n", name: "Nico" }
const SANTI = { id: "s", name: "Santi" }
const TEAM_A = { id: 1, name: "Equipo A" }
const TEAM_B = { id: 2, name: "Equipo B" }
const RATED_HISTORY = [
    {
        _id: "h1",
        playerP1: NICO,
        scoreP1: 2,
        playerP2: SANTI,
        scoreP2: 0,
        teamP1: TEAM_A,
        teamP2: TEAM_B,
        played: true,
        playedAt: new Date("2026-01-01"),
    },
]
const bracketMatch = (overrides = {}) => ({
    _id: "bracket",
    type: "playoff",
    playerP1: NICO,
    playerP2: SANTI,
    teamP1: TEAM_A,
    teamP2: TEAM_B,
    scoreP1: null,
    scoreP2: null,
    played: false,
    playoff_id: 1,
    ...overrides,
})
const createPredictionController = (tournament, matches, overrides = {}) =>
    createGetPlayoffMatchesByTournamentId({
        retrieveTournamentById: async () => tournament,
        retrievePlayoffMatchesByTournamentId: async () => matches,
        retrieveAllMatches: async () => RATED_HISTORY,
        predictionOptions: { teamStrength: null },
        logger: { warn: () => {} },
        ...overrides,
    })
const getMatches = async (controller) => {
    const response = createResponse()
    await controller({ params: { tournament: "tournament" } }, response)
    assert.equal(response.statusCode, 200)
    return response.body.matches
}

test("GET playoff adds prediction without changing the other fields", async () => {
    const played = bracketMatch({
        _id: "h1",
        scoreP1: 2,
        scoreP2: 0,
        played: true,
        playoff_id: 2,
    })
    const upcoming = bracketMatch()

    const matches = await getMatches(
        createPredictionController(
            { _id: "tournament", format: "world_cup_2026" },
            [played, upcoming]
        )
    )

    const { prediction: playedPrediction, ...playedRest } = matches[0]
    const { prediction: upcomingPrediction, ...upcomingRest } = matches[1]
    assert.deepEqual(playedRest, played)
    assert.deepEqual(upcomingRest, upcoming)
    assert.equal(playedPrediction.basis, "pre_match")
    assert.equal(upcomingPrediction.basis, "current")
    assert.equal(playedPrediction.p1, 0.5)
    assert.ok(upcomingPrediction.p1 > 0.5)
})

test("GET playoff returns null prediction outside the single-leg scope", async () => {
    for (const tournament of [
        { _id: "tournament", format: "champions_league" },
        { _id: "tournament", format: "playoff", playoffMode: "two_legged" },
    ]) {
        let reads = 0
        const matches = await getMatches(
            createPredictionController(tournament, [bracketMatch()], {
                retrieveAllMatches: async () => {
                    reads += 1
                    return RATED_HISTORY
                },
            })
        )

        assert.equal(matches.length, 1)
        assert.equal(matches[0].prediction, null)
        assert.equal(matches[0]._id, "bracket")
        assert.equal(reads, 0)
    }
})

test("GET playoff returns null prediction for same player, invalid and empty sides", async () => {
    const matches = await getMatches(
        createPredictionController(
            { _id: "tournament", format: "world_cup_2026" },
            [
                bracketMatch({ _id: "same", playerP2: NICO }),
                bracketMatch({
                    _id: "sim",
                    valid: false,
                    played: true,
                    scoreP1: 3,
                    scoreP2: 0,
                }),
                bracketMatch({ _id: "empty-player", playerP2: null }),
                bracketMatch({ _id: "empty-team", teamP2: null }),
            ]
        )
    )

    assert.deepEqual(
        matches.map((match) => match.prediction),
        [null, null, null, null]
    )
})

test("GET playoff stays successful with null predictions when the ratings read fails", async () => {
    const warnings = []

    const matches = await getMatches(
        createPredictionController(
            { _id: "tournament", format: "world_cup_2026" },
            [bracketMatch()],
            {
                retrieveAllMatches: async () => {
                    throw new Error("db caída")
                },
                logger: {
                    warn: (event, fields) => warnings.push({ event, fields }),
                },
            }
        )
    )

    assert.equal(matches[0].prediction, null)
    assert.equal(matches[0]._id, "bracket")
    assert.equal(warnings.length, 1)
    assert.equal(warnings[0].event, "match_predictions_unavailable")
})

test("GET playoff serializes documents that expose toJSON", async () => {
    const plain = bracketMatch({ _id: "doc" })
    const document = { toJSON: () => plain, internals: "no deben salir" }

    const matches = await getMatches(
        createPredictionController(
            { _id: "tournament", format: "league_playin_playoff" },
            [document]
        )
    )

    assert.equal(matches[0]._id, "doc")
    assert.equal(matches[0].internals, undefined)
    assert.equal(matches[0].playerP1.name, "Nico")
    assert.equal(matches[0].prediction.basis, "current")
})

test("POST playoff rejects an existing bracket before generation", async () => {
    let generationCalls = 0
    const controller = createPostPlayoffByTournamentId(
        createDependencies({
            retrievePlayoffMatchesByTournamentId: async () => [
                { playoff_id: 1 },
            ],
            originateWorldCupPlayoffByTournamentId: async () => {
                generationCalls += 1
            },
        })
    )

    const error = await controller(
        { params: { tournament: "tournament" }, body: {} },
        createResponse()
    ).catch((caughtError) => caughtError)

    assert.equal(error.status, 409)
    assert.equal(error.code, "PLAYOFF_ALREADY_EXISTS")
    assert.equal(generationCalls, 0)
})

test("POST playoff rejects formats that are automatic or unsupported", async () => {
    const request = { params: { tournament: "tournament" }, body: {} }
    const createController = (format) =>
        createPostPlayoffByTournamentId(
            createDependencies({
                retrieveTournamentById: async () => ({
                    id: "tournament",
                    name: "Tournament",
                    format,
                    teams,
                }),
            })
        )

    const automatic = await createController("playoff")(
        request,
        createResponse()
    ).catch((error) => error)
    const unsupported = await createController("league")(
        request,
        createResponse()
    ).catch((error) => error)

    assert.equal(automatic.code, "PLAYOFF_UNSUPPORTED_TOURNAMENT")
    assert.equal(unsupported.code, "PLAYOFF_UNSUPPORTED_TOURNAMENT")
    assert.equal(automatic.status, 422)
})

test("league play-in playoff requires all six completed play-in matches", async () => {
    const controller = createPostPlayoffByTournamentId(
        createDependencies({
            retrieveTournamentById: async () => ({
                id: "tournament",
                name: "Tournament",
                format: "league_playin_playoff",
                teams,
            }),
            retrievePlayinMatchesByTournamentId: async () => [
                { playoff_id: 1, played: true, outcome: {} },
            ],
        })
    )

    const error = await controller(
        { params: { tournament: "tournament" }, body: {} },
        createResponse()
    ).catch((caughtError) => caughtError)

    assert.equal(error.status, 409)
    assert.equal(error.code, "PLAYOFF_NOT_READY")
})

test("world cup generation preserves service and response contracts", async () => {
    let received
    const generated = [{ _id: "match" }]
    const controller = createPostPlayoffByTournamentId(
        createDependencies({
            originateWorldCupPlayoffByTournamentId: async (...args) => {
                received = args
                return generated
            },
        })
    )
    const response = createResponse()

    await controller(
        { params: { tournament: "tournament" }, body: {} },
        response
    )

    assert.deepEqual(received[0], {
        id: "tournament",
        name: "Tournament",
    })
    assert.ok(received[1].A)
    assert.deepEqual(received[2], [])
    assert.equal(response.statusCode, 200)
    assert.equal(response.body, generated)
})

test("group-stage calculation must produce a non-empty bracket", async () => {
    const controller = createPostPlayoffByTournamentId(
        createDependencies({
            retrieveTournamentById: async () => ({
                id: "tournament",
                name: "Tournament",
                format: "world_cup_2026",
                teams,
            }),
        })
    )

    const error = await controller(
        { params: { tournament: "tournament" }, body: {} },
        createResponse()
    ).catch((caughtError) => caughtError)

    assert.equal(error.status, 422)
    assert.equal(error.code, "PLAYOFF_DATA_INVALID")
})

test("POST playoff copies the tournament team ids into the generated bracket", async () => {
    let received
    const controller = createPostPlayoffByTournamentId(
        createDependencies({
            retrieveTournamentById: async () => ({
                id: "tournament",
                name: "Tournament",
                format: "world_cup",
                teams: [
                    {
                        group: "A",
                        team: { id: 10, name: "Team 10" },
                        player: { id: "player-1", name: "Player 1" },
                    },
                    {
                        group: "A",
                        team: { id: 20, name: "Team 20" },
                        player: { id: "player-2", name: "Player 2" },
                    },
                    {
                        group: "A",
                        team: { id: 30, name: "Team 30" },
                        player: { id: "player-3", name: "Player 3" },
                    },
                ],
            }),
            originateWorldCupPlayoffByTournamentId: async (...args) => {
                received = args
                return []
            },
        })
    )

    await controller(
        { params: { tournament: "tournament" }, body: {} },
        createResponse()
    )

    assert.deepEqual(
        received[1].A.map(({ team }) => team.id),
        [10, 20, 30]
    )
    assert.equal(received[1].A[0].player.id, "player-1")
})

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
        team: { id: index + 1, name: `Team ${index + 1}` },
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
    type: "playin",
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
    createGetPlayinMatchesByTournamentId({
        retrieveTournamentById: async () => tournament,
        retrievePlayinMatchesByTournamentId: async () => matches,
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

test("GET play-in adds prediction without changing the other fields", async () => {
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

test("GET play-in returns null prediction outside the single-leg scope", async () => {
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

test("GET play-in returns null prediction for same player, invalid and empty sides", async () => {
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

test("GET play-in stays successful with null predictions when the ratings read fails", async () => {
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

test("GET play-in serializes documents that expose toJSON", async () => {
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

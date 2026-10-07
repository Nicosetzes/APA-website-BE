const assert = require("node:assert/strict")
const test = require("node:test")

const validateRequest = require("../middleware/validateRequest")
const schemas = require("../validation/requestSchemas")
const { MATCH_RULE_MESSAGES } = require("../validation/errorMessages")

const runValidation = (schema, request) =>
    new Promise((resolve) => {
        validateRequest(schema)(request, {}, (error) => {
            resolve(error)
        })
    })

test("update match validation converts scores and accepts current payload", async () => {
    const request = {
        params: {
            tournament: "aaaaaaaaaaaaaaaaaaaaaaaa",
            match: "bbbbbbbbbbbbbbbbbbbbbbbb",
        },
        query: {},
        body: {
            playerP1: { id: "1", name: "Nico" },
            teamP1: { id: "10", name: "Team A" },
            scoreP1: "2",
            playerP2: { id: "2", name: "Santi" },
            teamP2: { id: "20", name: "Team B" },
            scoreP2: "1",
        },
    }

    const error = await runValidation(schemas.updateMatch, request)

    assert.equal(error, undefined)
    assert.equal(request.body.scoreP1, 2)
    assert.equal(request.body.scoreP2, 1)
})

test("Joi leaves knockout result rules to contextual validation", async () => {
    const baseRequest = {
        params: {
            tournament: "aaaaaaaaaaaaaaaaaaaaaaaa",
            match: "bbbbbbbbbbbbbbbbbbbbbbbb",
        },
        query: {},
        body: {
            playerP1: { id: "1", name: "Nico" },
            teamP1: { id: "10", name: "Team A" },
            seedP1: "1",
            scoreP1: 1,
            playerP2: { id: "2", name: "Santi" },
            teamP2: { id: "20", name: "Team B" },
            seedP2: "2",
            scoreP2: 1,
        },
    }

    const missingPenalties = await runValidation(schemas.updateMatch, {
        ...baseRequest,
        body: { ...baseRequest.body },
    })
    const tiedPenalties = await runValidation(schemas.updateMatch, {
        ...baseRequest,
        body: {
            ...baseRequest.body,
            penaltyScoreP1: 4,
            penaltyScoreP2: 4,
        },
    })
    const incompletePenalties = await runValidation(schemas.updateMatch, {
        ...baseRequest,
        body: { ...baseRequest.body, penaltyScoreP1: 4 },
    })

    assert.equal(missingPenalties, undefined)
    assert.equal(tiedPenalties, undefined)
    assert.equal(incompletePenalties.code, "VALIDATION_ERROR")
})

const knockoutRequest = (body = {}) => ({
    params: {
        tournament: "aaaaaaaaaaaaaaaaaaaaaaaa",
        match: "bbbbbbbbbbbbbbbbbbbbbbbb",
    },
    query: {},
    body: {
        playerP1: { id: "1", name: "Nico" },
        teamP1: { id: "10", name: "Team A" },
        seedP1: "1",
        scoreP1: 1,
        playerP2: { id: "2", name: "Santi" },
        teamP2: { id: "20", name: "Team B" },
        seedP2: "2",
        scoreP2: 1,
        ...body,
    },
})

test("structural match rules explain incomplete pairs", async () => {
    const cases = [
        [{ penaltyScoreP1: 4 }, "match.penaltiesIncomplete"],
        [{ seedP2: undefined, scoreP1: 2 }, "match.seedsIncomplete"],
    ]

    for (const [body, code] of cases) {
        const error = await runValidation(
            schemas.updateMatch,
            knockoutRequest(body)
        )

        assert.equal(error.code, "VALIDATION_ERROR", code)
        assert.equal(error.message, MATCH_RULE_MESSAGES[code])
        assert.deepEqual(
            error.details.map(({ code: detailCode }) => detailCode),
            [code]
        )
        assert.equal(error.details[0].message, MATCH_RULE_MESSAGES[code])
    }
})

test("an emptied penalty input counts as not loaded", async () => {
    const request = knockoutRequest({
        scoreP1: 2,
        penaltyScoreP1: "",
        penaltyScoreP2: "",
    })

    assert.equal(await runValidation(schemas.updateMatch, request), undefined)
    assert.equal(request.body.penaltyScoreP1, undefined)
    assert.equal(request.body.penaltyScoreP2, undefined)
})

test("field errors name the field in Spanish and never echo the value", async () => {
    const scoreError = await runValidation(
        schemas.updateMatch,
        knockoutRequest({ scoreP1: 30, scoreP2: "secret-value" })
    )
    const loginError = await runValidation(schemas.login, {
        body: { email: "secret-value" },
    })
    const pageError = await runValidation(schemas.getEdits, {
        query: { page: "0" },
    })
    const statusError = await runValidation(schemas.getTournaments, {
        query: { status: "secret-value" },
        body: {},
    })

    assert.deepEqual(
        scoreError.details.map(({ path, message }) => [path, message]),
        [
            ["scoreP1", "Los goles del equipo 1 no pueden ser mayores a 24"],
            ["scoreP2", "Los goles del equipo 2 deben ser un número"],
        ]
    )
    assert.equal(
        scoreError.message,
        "Los goles del equipo 1 no pueden ser mayores a 24; Los goles del equipo 2 deben ser un número"
    )
    assert.equal(
        loginError.message,
        "El email no tiene un formato válido; Falta la contraseña"
    )
    assert.equal(pageError.message, "La página no puede ser menor a 1")
    assert.equal(
        statusError.message,
        'El estado debe ser uno de estos valores: "active", "finalized"'
    )

    for (const error of [scoreError, loginError, statusError]) {
        assert.equal(JSON.stringify(error).includes("secret-value"), false)
    }
})

test("unknown fields are named and long summaries are capped", async () => {
    const error = await runValidation(schemas.updateMatch, {
        params: { tournament: "invalid", match: "invalid" },
        query: {},
        body: { unexpected: "value" },
    })

    assert.ok(
        error.details.some(
            ({ message }) =>
                message === 'El campo "unexpected" no está permitido'
        )
    )
    assert.match(error.message, /^El torneo no tiene un formato válido; /)
    assert.match(error.message, /\(y \d+ más\)$/)
})

test("validation rejects malformed IDs, missing fields and unknown fields", async () => {
    const request = {
        params: {
            tournament: "not-an-object-id",
            match: "bbbbbbbbbbbbbbbbbbbbbbbb",
        },
        query: {},
        body: { unexpected: "value" },
    }

    const error = await runValidation(schemas.updateMatch, request)

    assert.equal(error.code, "VALIDATION_ERROR")
    assert.equal(error.status, 400)
    assert.ok(error.details.length > 1)
    assert.ok(
        error.details.every(
            (detail) =>
                Object.hasOwn(detail, "source") &&
                Object.hasOwn(detail, "path") &&
                Object.hasOwn(detail, "code") &&
                !Object.hasOwn(detail, "value")
        )
    )
})

test("edits pagination applies defaults, converts values and rejects invalid pages", async () => {
    const defaultRequest = { query: {} }
    const convertedRequest = { query: { page: "2" } }
    const invalidRequest = { query: { page: "0", unexpected: "value" } }

    const defaultError = await runValidation(schemas.getEdits, defaultRequest)
    const convertedError = await runValidation(
        schemas.getEdits,
        convertedRequest
    )
    const invalidError = await runValidation(schemas.getEdits, invalidRequest)

    assert.equal(defaultError, undefined)
    assert.equal(defaultRequest.query.page, 1)
    assert.equal(convertedError, undefined)
    assert.equal(convertedRequest.query.page, 2)
    assert.equal(invalidError.code, "VALIDATION_ERROR")
})

test("fixture GET parses active FE filters and rejects malformed players/page", async () => {
    const validRequest = {
        params: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        query: {
            page: "2",
            team: "10",
            group: "a",
            players: ["player-1", "player-2"],
        },
        body: {},
    }
    const singlePlayerRequest = {
        params: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        query: { players: "player-1" },
        body: {},
    }
    const invalidRequest = {
        params: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        query: { page: "0", players: ["1", "2"] },
        body: {},
    }
    const tooManyPlayersRequest = {
        params: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        query: { players: ["1", "2", "3"] },
        body: {},
    }
    const duplicatedPlayersRequest = {
        params: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        query: { players: ["1", "1"] },
        body: {},
    }

    assert.equal(
        await runValidation(schemas.getFixture, validRequest),
        undefined
    )
    assert.equal(validRequest.query.page, 2)
    assert.equal(validRequest.query.group, "A")
    assert.deepEqual(validRequest.query.players, ["player-1", "player-2"])

    assert.equal(
        await runValidation(schemas.getFixture, singlePlayerRequest),
        undefined
    )
    assert.deepEqual(singlePlayerRequest.query.players, ["player-1"])

    assert.equal(
        (await runValidation(schemas.getFixture, invalidRequest)).code,
        "VALIDATION_ERROR"
    )
    assert.equal(
        (await runValidation(schemas.getFixture, tooManyPlayersRequest)).code,
        "VALIDATION_ERROR"
    )
    assert.equal(
        (await runValidation(schemas.getFixture, duplicatedPlayersRequest))
            .code,
        "VALIDATION_ERROR"
    )
})

test("serialized JSON arrays still work while the deployed FE catches up", async () => {
    const legacyFixtureRequest = {
        params: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        query: { players: '["player-1","player-2"]' },
        body: {},
    }
    const legacyCalculatorRequest = {
        params: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        query: { teams: '["team-1","team-2"]' },
        body: {},
    }
    const legacyTooManyPlayersRequest = {
        params: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        query: { players: '["1","2","3"]' },
        body: {},
    }

    assert.equal(
        await runValidation(schemas.getFixture, legacyFixtureRequest),
        undefined
    )
    assert.deepEqual(legacyFixtureRequest.query.players, [
        "player-1",
        "player-2",
    ])

    assert.equal(
        await runValidation(schemas.getCalculator, legacyCalculatorRequest),
        undefined
    )
    assert.deepEqual(legacyCalculatorRequest.query.teams, ["team-1", "team-2"])

    assert.equal(
        (await runValidation(schemas.getFixture, legacyTooManyPlayersRequest))
            .code,
        "VALIDATION_ERROR"
    )
})

test("play-in GET validates tournament and rejects extra query fields", async () => {
    const validRequest = {
        params: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        query: {},
        body: {},
    }
    const invalidRequest = {
        params: { tournament: "invalid" },
        query: { unexpected: "value" },
        body: {},
    }

    assert.equal(
        await runValidation(schemas.getPlayin, validRequest),
        undefined
    )
    assert.equal(
        (await runValidation(schemas.getPlayin, invalidRequest)).code,
        "VALIDATION_ERROR"
    )
})

test("playoff GET validates tournament and rejects extra input", async () => {
    const validRequest = {
        params: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        query: {},
        body: {},
    }
    const invalidRequest = {
        params: { tournament: "invalid" },
        query: { unexpected: "value" },
        body: {},
    }

    assert.equal(
        await runValidation(schemas.getPlayoff, validRequest),
        undefined
    )
    assert.equal(
        (await runValidation(schemas.getPlayoff, invalidRequest)).code,
        "VALIDATION_ERROR"
    )
})

test("tournament listing validates status and converts legacy boolean", async () => {
    const validRequest = {
        query: { status: "active", legacy: "false" },
        body: {},
    }
    const invalidRequest = {
        query: { status: "unknown", extra: "value" },
        body: {},
    }

    assert.equal(
        await runValidation(schemas.getTournaments, validRequest),
        undefined
    )
    assert.equal(validRequest.query.legacy, false)
    assert.equal(validRequest.query.status, "active")
    assert.equal(
        (await runValidation(schemas.getTournaments, invalidRequest)).code,
        "VALIDATION_ERROR"
    )
})

test("tournament resource schema validates detail and summary inputs", async () => {
    const validRequest = {
        params: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        query: {},
        body: {},
    }
    const invalidRequest = {
        params: { tournament: "invalid" },
        query: { unexpected: "value" },
        body: {},
    }

    assert.equal(
        await runValidation(schemas.getTournamentResource, validRequest),
        undefined
    )
    assert.equal(
        (await runValidation(schemas.getTournamentResource, invalidRequest))
            .code,
        "VALIDATION_ERROR"
    )
})

test("tournament creation accepts a null group and rejects an invalid letter", async () => {
    const team = (group) => ({
        team: { id: 435, name: "River Plate" },
        player: { id: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "Nico" },
        ...(group === undefined ? {} : { group }),
    })
    const body = (teams) => ({
        params: {},
        query: {},
        body: {
            format: "league",
            name: "Liga única",
            players: [{ id: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "Nico" }],
            teams,
        },
    })

    // El FE manda `group: null` cuando el formato no tiene grupos.
    const nullGroupRequest = body([team(null)])
    const absentGroupRequest = body([team(undefined)])
    const letterRequest = body([team("a")])
    const invalidLetterRequest = body([team("Z")])
    const invalidTypeRequest = body([team(1)])

    assert.equal(
        await runValidation(schemas.createTournament, nullGroupRequest),
        undefined
    )
    assert.equal(nullGroupRequest.body.teams[0].group, null)

    assert.equal(
        await runValidation(schemas.createTournament, absentGroupRequest),
        undefined
    )

    assert.equal(
        await runValidation(schemas.createTournament, letterRequest),
        undefined
    )
    assert.equal(letterRequest.body.teams[0].group, "A")

    assert.equal(
        (await runValidation(schemas.createTournament, invalidLetterRequest))
            .code,
        "VALIDATION_ERROR"
    )
    assert.equal(
        (await runValidation(schemas.createTournament, invalidTypeRequest))
            .code,
        "VALIDATION_ERROR"
    )
})

test("tournament creation stores team ids as numbers", async () => {
    const request = (teamId) => ({
        params: {},
        query: {},
        body: {
            format: "league",
            name: "Liga",
            players: [{ id: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "Player" }],
            teams: [
                {
                    team: { id: teamId, name: "Team" },
                    player: { id: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "Player" },
                },
            ],
        },
    })

    const numericString = request("435")
    assert.equal(
        await runValidation(schemas.createTournament, numericString),
        undefined
    )
    assert.equal(numericString.body.teams[0].team.id, 435)

    const numeric = request(10)
    assert.equal(
        await runValidation(schemas.createTournament, numeric),
        undefined
    )
    assert.equal(numeric.body.teams[0].team.id, 10)

    for (const invalid of ["river", "-1", 1.5, -3]) {
        assert.equal(
            (await runValidation(schemas.createTournament, request(invalid)))
                ?.code,
            "VALIDATION_ERROR",
            String(invalid)
        )
    }
})

test("match updates keep accepting string and number team ids", async () => {
    const request = (teamId) => ({
        params: {
            tournament: "aaaaaaaaaaaaaaaaaaaaaaaa",
            match: "bbbbbbbbbbbbbbbbbbbbbbbb",
        },
        query: {},
        body: {
            playerP1: { id: "1", name: "Player 1" },
            teamP1: { id: teamId, name: "Team A" },
            scoreP1: 2,
            playerP2: { id: "2", name: "Player 2" },
            teamP2: { id: 20, name: "Team B" },
            scoreP2: 1,
        },
    })

    assert.equal(
        await runValidation(schemas.updateMatch, request("10")),
        undefined
    )
    assert.equal(
        await runValidation(schemas.updateMatch, request(10)),
        undefined
    )
})

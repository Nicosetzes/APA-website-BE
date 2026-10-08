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
        playoff_id: 15,
        tournament: { id: "tournament", name: "Tournament" },
    }
    const calls = []
    let committed = false

    const controller = createPutMatchByTournamentId({
        modifyTournamentStartedAt: async () => null,
        modifyMatchResult: async (...args) => {
            calls.push(["match", args.at(-1)])
            return updatedMatch
        },
        modifyTournamentOutcome: async (...args) => {
            calls.push(["outcome", args[3]])
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
            ["tournament", session],
            ["outcome", session],
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
        modifyTournamentStartedAt: async () => null,
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

const createFinalDetectionController = ({ match, format }) => {
    const outcomeCalls = []
    const playoffCalls = []
    const controller = createPutMatchByTournamentId({
        modifyTournamentStartedAt: async () => null,
        modifyMatchResult: async () => match,
        modifyTournamentOutcome: async (tournament, champion, finalist) => {
            outcomeCalls.push({ tournament, champion, finalist })
        },
        retrieveTournamentById: async () => ({
            id: "tournament",
            name: "Tournament",
            format,
        }),
        retrievePlayoffMatchesByTournamentId: async () => [match],
        generatePlayoffUpdate: async (tournament, matches, startSize) => {
            playoffCalls.push({ tournament, matches, startSize })
        },
        withTransaction: async (work) => work({ id: "session" }),
    })

    return { controller, outcomeCalls, playoffCalls }
}

test("the final closes the tournament from persisted data, without the client flag", async () => {
    const { controller, outcomeCalls } = createFinalDetectionController({
        match: {
            _id: "match",
            type: "playoff",
            playoff_id: 15,
            tournament: { id: "tournament", name: "Tournament" },
        },
        format: "world_cup",
    })

    await controller(createRequest(), createResponse())

    assert.equal(outcomeCalls.length, 1)
    assert.equal(outcomeCalls[0].tournament, "tournament")
    assert.equal(outcomeCalls[0].champion.team, teamP1)
    assert.equal(outcomeCalls[0].finalist.team, teamP2)
})

test("a non-final playoff match is not closed even if the client claims it is the final", async () => {
    const { controller, outcomeCalls, playoffCalls } =
        createFinalDetectionController({
            match: {
                _id: "match",
                type: "playoff",
                playoff_id: 14,
                tournament: { id: "tournament", name: "Tournament" },
            },
            format: "world_cup",
        })

    await controller(createRequest({ isThisTheFinal: true }), createResponse())

    assert.deepEqual(outcomeCalls, [])
    assert.equal(playoffCalls.length, 1)
})

test("bracket size and final id follow the tournament format", async () => {
    const bigBracket = createFinalDetectionController({
        match: {
            _id: "match",
            type: "playoff",
            playoff_id: 31,
            tournament: { id: "tournament", name: "Tournament" },
        },
        format: "playoff",
    })

    await bigBracket.controller(createRequest(), createResponse())

    assert.equal(bigBracket.outcomeCalls.length, 1)
    assert.equal(bigBracket.playoffCalls[0].startSize, 32)

    const bigBracketSemifinal = createFinalDetectionController({
        match: {
            _id: "match",
            type: "playoff",
            playoff_id: 15,
            tournament: { id: "tournament", name: "Tournament" },
        },
        format: "playoff",
    })

    await bigBracketSemifinal.controller(createRequest(), createResponse())

    assert.deepEqual(bigBracketSemifinal.outcomeCalls, [])
})

test("champions_league closes on its own final and never regenerates the bracket", async () => {
    const final = createFinalDetectionController({
        match: {
            _id: "match",
            type: "playoff",
            playoff_id: 29,
            tournament: { id: "tournament", name: "Tournament" },
        },
        format: "champions_league",
    })

    await final.controller(createRequest(), createResponse())

    assert.equal(final.outcomeCalls.length, 1)
    assert.deepEqual(final.playoffCalls, [])

    const earlierRound = createFinalDetectionController({
        match: {
            _id: "match",
            type: "playoff",
            playoff_id: 15,
            tournament: { id: "tournament", name: "Tournament" },
        },
        format: "champions_league",
    })

    await earlierRound.controller(createRequest(), createResponse())

    assert.deepEqual(earlierRound.outcomeCalls, [])
    assert.deepEqual(earlierRound.playoffCalls, [])
})

test("a play-in match never closes the tournament nor touches the playoff", async () => {
    const outcomeCalls = []
    const playoffCalls = []
    const controller = createPutMatchByTournamentId({
        modifyTournamentStartedAt: async () => null,
        modifyMatchResult: async () => ({
            _id: "match",
            type: "playin",
            playoff_id: 15,
            tournament: { id: "tournament", name: "Tournament" },
        }),
        modifyTournamentOutcome: async () => {
            outcomeCalls.push(true)
        },
        retrieveTournamentById: async () => {
            throw new Error("tournament should not be read for a play-in match")
        },
        retrievePlayoffMatchesByTournamentId: async () => [],
        generatePlayoffUpdate: async () => {
            playoffCalls.push(true)
        },
        retrievePlayinMatchesByTournamentId: async () => [],
        generatePlayinUpdate: async () => ({ created: [], updated: [] }),
        withTransaction: async (work) => work({ id: "session" }),
    })

    await controller(createRequest({ isThisTheFinal: true }), createResponse())

    assert.deepEqual(outcomeCalls, [])
    assert.deepEqual(playoffCalls, [])
})

test("a play-in result advances the play-in inside the same transaction", async () => {
    const session = { id: "session" }
    const updatedMatch = {
        _id: "match",
        type: "playin",
        playoff_id: 1,
        tournament: { id: "tournament", name: "Tournament" },
    }
    const playinMatches = [updatedMatch]
    const calls = []
    let committed = false

    const controller = createPutMatchByTournamentId({
        modifyTournamentStartedAt: async () => null,
        modifyMatchResult: async (...args) => {
            calls.push(["match", args.at(-1)])
            return updatedMatch
        },
        modifyTournamentOutcome: async () => {},
        retrievePlayoffMatchesByTournamentId: async () => [],
        generatePlayoffUpdate: async () => {},
        retrievePlayinMatchesByTournamentId: async (id, options) => {
            calls.push(["matches", options, id])
            return playinMatches
        },
        generatePlayinUpdate: async (tournament, matches, options) => {
            calls.push(["playin", options, tournament, matches])
            return { created: [], updated: [] }
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
            ["matches", session],
            ["playin", session],
        ]
    )
    assert.equal(calls[1][2], "tournament")
    assert.deepEqual(calls[2][2], { id: "tournament", name: "Tournament" })
    assert.equal(calls[2][3], playinMatches)
    assert.equal(response.statusCode, 200)
    assert.equal(response.body, updatedMatch)
})

test("a late play-in failure rejects before sending a response", async () => {
    const expectedError = new Error("play-in update failed")
    let aborted = false
    const controller = createPutMatchByTournamentId({
        modifyTournamentStartedAt: async () => null,
        modifyMatchResult: async () => ({
            type: "playin",
            playoff_id: 2,
            tournament: { id: "tournament", name: "Tournament" },
        }),
        retrievePlayinMatchesByTournamentId: async () => [],
        generatePlayinUpdate: async () => {
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
})

test("regular matches never trigger bracket progression", async () => {
    const calls = []
    const controller = createPutMatchByTournamentId({
        modifyTournamentStartedAt: async () => null,
        modifyMatchResult: async () => ({
            type: "regular",
            tournament: { id: "tournament", name: "Tournament" },
        }),
        retrievePlayoffMatchesByTournamentId: async () => {
            calls.push("playoff")
            return []
        },
        retrievePlayinMatchesByTournamentId: async () => {
            calls.push("playin")
            return []
        },
        withTransaction: async (work) => work({ id: "session" }),
    })

    await controller(
        createRequest({
            seedP1: undefined,
            seedP2: undefined,
            penaltyScoreP1: undefined,
            penaltyScoreP2: undefined,
        }),
        createResponse()
    )

    assert.deepEqual(calls, [])
})

test("an undecidable final leaves a warning instead of failing silently", async () => {
    const warnings = []
    const createController = ({ match, format }) =>
        createPutMatchByTournamentId({
            modifyTournamentStartedAt: async () => null,
            modifyMatchResult: async () => match,
            modifyTournamentOutcome: async () => {},
            retrieveTournamentById: async () => ({
                id: "tournament",
                name: "Tournament",
                format,
            }),
            retrievePlayoffMatchesByTournamentId: async () => [match],
            generatePlayoffUpdate: async () => {},
            withTransaction: async (work) => work({ id: "session" }),
            logger: {
                warn: (event, fields) => warnings.push({ event, fields }),
            },
        })

    // Ronda intermedia de un formato conocido: no hay nada anómalo que avisar.
    await createController({
        match: {
            _id: "match",
            type: "playoff",
            playoff_id: 14,
            tournament: { id: "tournament", name: "Tournament" },
        },
        format: "world_cup",
    })(createRequest(), createResponse())

    assert.deepEqual(warnings, [])

    // La final de champions_league sale de la otra tabla y tampoco avisa.
    await createController({
        match: {
            _id: "match",
            type: "playoff",
            playoff_id: 29,
            tournament: { id: "tournament", name: "Tournament" },
        },
        format: "champions_league",
    })(createRequest(), createResponse())

    assert.deepEqual(warnings, [])

    // Sin `playoff_id` no se puede derivar nada.
    await createController({
        match: {
            _id: "match",
            type: "playoff",
            tournament: { id: "tournament", name: "Tournament" },
        },
        format: "world_cup",
    })(createRequest(), createResponse())

    // Formato fuera de las dos tablas: cierra por el fallback de 16, sin que
    // nadie haya verificado ese id contra el bracket histórico.
    await createController({
        match: {
            _id: "match",
            type: "playoff",
            playoff_id: 15,
            tournament: { id: "tournament", name: "Tournament" },
        },
        format: "club_world_cup",
    })(createRequest(), createResponse())

    assert.equal(warnings.length, 2)
    assert.deepEqual(
        warnings.map(({ event }) => event),
        ["playoff_final_not_derivable", "playoff_final_not_derivable"]
    )
    assert.equal(warnings[0].fields.playoffId, null)
    assert.equal(warnings[1].fields.format, "club_world_cup")
})

test("the loaded match is forwarded as previous only to the result update", async () => {
    const session = { id: "session" }
    const previous = {
        _id: "match",
        type: "playoff",
        played: true,
        playedAt: new Date("2023-05-10T12:00:00.000Z"),
        playedAtPrecision: "exact",
    }
    const updatedMatch = {
        _id: "match",
        type: "playoff",
        playoff_id: 15,
        tournament: { id: "tournament", name: "Tournament" },
    }
    const options = []
    const controller = createPutMatchByTournamentId({
        modifyTournamentStartedAt: async () => null,
        modifyMatchResult: async (...args) => {
            options.push(["match", args.at(-1)])
            return updatedMatch
        },
        modifyTournamentOutcome: async (...args) => {
            options.push(["outcome", args[3]])
        },
        retrieveTournamentById: async (...args) => {
            options.push(["tournament", args.at(-1)])
            return { id: "tournament", name: "Tournament", format: "world_cup" }
        },
        retrievePlayoffMatchesByTournamentId: async (...args) => {
            options.push(["matches", args.at(-1)])
            return [updatedMatch]
        },
        generatePlayoffUpdate: async (...args) => {
            options.push(["playoff", args.at(-1)])
        },
        withTransaction: async (work) => work(session),
    })

    await controller({ ...createRequest(), match: previous }, createResponse())

    assert.deepEqual(options[0], ["match", { session, previous }])
    for (const [name, received] of options.slice(1)) {
        assert.deepEqual(received, { session }, name)
    }
})

test("outcome scores are numbers even when the body sends strings", () => {
    const outcome = calculateOutcome({
        playerP1,
        teamP1,
        scoreP1: Number("3"),
        playerP2,
        teamP2,
        scoreP2: Number("1"),
    })

    assert.equal(outcome.scoreFromTeamThatWon, 3)
    assert.equal(outcome.scoreFromTeamThatLost, 1)
    assert.equal(typeof outcome.scoreFromTeamThatWon, "number")
    assert.equal(typeof outcome.scoreFromTeamThatLost, "number")
})

test("the legacy result uses the persisted participants, not the body ones", async () => {
    const persistedTeamP1 = { id: 9568, name: "Persisted team" }
    const staleTeamP1 = { id: 1137, name: "Stale team" }
    const persisted = {
        _id: "match",
        type: "regular",
        played: false,
        playerP1,
        teamP1: persistedTeamP1,
        playerP2,
        teamP2,
        tournament: { id: "tournament", name: "Tournament" },
    }
    const received = []
    const warnings = []
    const controller = createPutMatchByTournamentId({
        modifyTournamentStartedAt: async () => null,
        modifyMatchResult: async (matchId, scoreP1, scoreP2, outcome) => {
            received.push(outcome)
            return { ...persisted, played: true, outcome }
        },
        withTransaction: async (work) => work({ id: "session" }),
        logger: { warn: (event, fields) => warnings.push({ event, fields }) },
    })

    await controller(
        {
            ...createRequest({
                teamP1: staleTeamP1,
                seedP1: undefined,
                seedP2: undefined,
                scoreP1: 3,
                scoreP2: 1,
                penaltyScoreP1: undefined,
                penaltyScoreP2: undefined,
            }),
            match: persisted,
            requestId: "req-1",
        },
        createResponse()
    )

    assert.equal(received.length, 1)
    assert.equal(received[0].teamThatWon, persistedTeamP1)
    assert.equal(received[0].teamThatLost, teamP2)
    assert.equal(received[0].scoreFromTeamThatWon, 3)
    assert.deepEqual(warnings, [
        {
            event: "match_result_participants_mismatch",
            fields: {
                requestId: "req-1",
                tournamentId: "tournament",
                matchId: "match",
                fields: ["teamP1"],
            },
        },
    ])
})

test("matching body participants do not log a mismatch", async () => {
    const warnings = []
    const persisted = {
        _id: "match",
        type: "regular",
        played: false,
        // Mismo equipo con id string en la base y number en el body.
        playerP1,
        teamP1: { id: "10", name: "Team 10" },
        playerP2,
        teamP2,
        tournament: { id: "tournament", name: "Tournament" },
    }
    const controller = createPutMatchByTournamentId({
        modifyTournamentStartedAt: async () => null,
        modifyMatchResult: async () => ({ ...persisted, played: true }),
        withTransaction: async (work) => work({ id: "session" }),
        logger: { warn: (event, fields) => warnings.push({ event, fields }) },
    })

    await controller(
        {
            ...createRequest({
                teamP1: { id: 10, name: "Team 10" },
                seedP1: undefined,
                seedP2: undefined,
                penaltyScoreP1: undefined,
                penaltyScoreP2: undefined,
            }),
            match: persisted,
        },
        createResponse()
    )

    assert.deepEqual(warnings, [])
})

test("the legacy final closes the tournament with the final's playedAt", async () => {
    const playedAt = new Date("2026-02-01T21:55:44.000Z")
    const closures = []
    const createController = (updatedMatch) =>
        createPutMatchByTournamentId({
            modifyTournamentStartedAt: async () => null,
            modifyMatchResult: async () => updatedMatch,
            modifyTournamentOutcome: async (...args) => {
                closures.push(args[4])
            },
            retrieveTournamentById: async () => ({
                id: "tournament",
                name: "Tournament",
                format: "world_cup",
            }),
            retrievePlayoffMatchesByTournamentId: async () => [updatedMatch],
            generatePlayoffUpdate: async () => {},
            withTransaction: async (work) => work({ id: "session" }),
        })
    const final = {
        _id: "match",
        type: "playoff",
        playoff_id: 15,
        tournament: { id: "tournament", name: "Tournament" },
    }

    await createController({
        ...final,
        playedAt,
        playedAtPrecision: "day",
    })(createRequest(), createResponse())

    assert.deepEqual(closures, [
        {
            closedAt: playedAt,
            closedAtPrecision: "day",
        },
    ])
})

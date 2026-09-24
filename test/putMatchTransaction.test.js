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

test("a play-in match never closes the tournament", async () => {
    const outcomeCalls = []
    const controller = createPutMatchByTournamentId({
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
        generatePlayoffUpdate: async () => {},
        withTransaction: async (work) => work({ id: "session" }),
    })

    await controller(createRequest({ isThisTheFinal: true }), createResponse())

    assert.deepEqual(outcomeCalls, [])
})

test("an undecidable final leaves a warning instead of failing silently", async () => {
    const warnings = []
    const createController = ({ match, format }) =>
        createPutMatchByTournamentId({
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

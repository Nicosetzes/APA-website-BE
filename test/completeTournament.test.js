const assert = require("node:assert/strict")
const test = require("node:test")

const {
    createPutCompleteTournamentById,
    computeLeagueOutcome,
} = require("../controller/putCompleteTournamentById")

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

const NICO = { id: "1", name: "Nico" }
const SANTI = { id: "2", name: "Santi" }
const LEO = { id: "3", name: "Leo" }

const RACING = { id: "10", name: "Racing" }
const BOCA = { id: "20", name: "Boca" }
const RIVER = { id: "30", name: "River" }

const createTeams = () => [
    { team: RACING, player: NICO },
    { team: BOCA, player: SANTI },
    { team: RIVER, player: LEO },
]

const createMatches = () => [
    {
        teamP1: RACING,
        playerP1: NICO,
        scoreP1: 3,
        teamP2: RIVER,
        playerP2: LEO,
        scoreP2: 0,
        outcome: { draw: false, teamThatWon: RACING },
    },
    {
        teamP1: BOCA,
        playerP1: SANTI,
        scoreP1: 2,
        teamP2: RIVER,
        playerP2: LEO,
        scoreP2: 0,
        outcome: { draw: false, teamThatWon: BOCA },
    },
]

const createController = (overrides = {}) =>
    createPutCompleteTournamentById({
        retrieveTournamentById: async () => ({
            id: TOURNAMENT_ID,
            format: "league",
            ongoing: true,
            teams: createTeams(),
        }),
        retrieveAllPlayedMatchesByTournamentId: async () => createMatches(),
        modifyTournamentOutcome: async () => ({ id: TOURNAMENT_ID }),
        ...overrides,
    })

test("complete tournament persists the computed outcome", async () => {
    let receivedArgs
    const controller = createController({
        modifyTournamentOutcome: async (...args) => {
            receivedArgs = args
            return { id: TOURNAMENT_ID, ongoing: false }
        },
    })
    const response = createResponse()

    await controller({ params: { tournament: TOURNAMENT_ID } }, response)

    assert.equal(response.statusCode, 200)
    assert.equal(response.body.message, "Tournament marked as completed")
    // Racing y Boca quedan 3 puntos; Racing gana por diferencia de gol.
    assert.deepEqual(response.body.outcome.champion, {
        team: RACING,
        player: NICO,
    })
    assert.deepEqual(response.body.outcome.finalist, {
        team: BOCA,
        player: SANTI,
    })
    assert.equal(receivedArgs[0], TOURNAMENT_ID)
    assert.deepEqual(receivedArgs[1], { team: RACING, player: NICO })
    assert.deepEqual(receivedArgs[2], { team: BOCA, player: SANTI })
})

test("complete tournament answers 404 for a missing tournament", async () => {
    const controller = createController({
        retrieveTournamentById: async () => null,
    })

    await assert.rejects(
        controller({ params: { tournament: TOURNAMENT_ID } }, createResponse()),
        (error) => {
            assert.equal(error.status, 404)
            assert.equal(error.code, "TOURNAMENT_NOT_FOUND")
            return true
        }
    )
})

test("complete tournament rejects formats other than league with 422", async () => {
    let persisted = false
    const controller = createController({
        retrieveTournamentById: async () => ({
            format: "playoff",
            ongoing: true,
            teams: createTeams(),
        }),
        modifyTournamentOutcome: async () => {
            persisted = true
            return {}
        },
    })

    await assert.rejects(
        controller({ params: { tournament: TOURNAMENT_ID } }, createResponse()),
        (error) => {
            assert.equal(error.status, 422)
            assert.equal(error.code, "UNSUPPORTED_TOURNAMENT_FORMAT")
            return true
        }
    )
    assert.equal(persisted, false)
})

test("complete tournament answers 409 when it is already finished", async () => {
    const controller = createController({
        retrieveTournamentById: async () => ({
            format: "league",
            ongoing: false,
            teams: createTeams(),
        }),
    })

    await assert.rejects(
        controller({ params: { tournament: TOURNAMENT_ID } }, createResponse()),
        (error) => {
            assert.equal(error.status, 409)
            assert.equal(error.code, "TOURNAMENT_ALREADY_COMPLETED")
            return true
        }
    )
})

test("complete tournament refuses to close without a resolvable outcome", async () => {
    let persisted = false
    const controller = createController({
        retrieveAllPlayedMatchesByTournamentId: async () => [],
        modifyTournamentOutcome: async () => {
            persisted = true
            return {}
        },
    })

    await assert.rejects(
        controller({ params: { tournament: TOURNAMENT_ID } }, createResponse()),
        (error) => {
            assert.equal(error.status, 422)
            assert.equal(error.code, "TOURNAMENT_OUTCOME_NOT_RESOLVABLE")
            return true
        }
    )
    assert.equal(persisted, false)
})

test("complete tournament answers 404 when the update finds nothing", async () => {
    const controller = createController({
        modifyTournamentOutcome: async () => null,
    })

    await assert.rejects(
        controller({ params: { tournament: TOURNAMENT_ID } }, createResponse()),
        (error) => {
            assert.equal(error.status, 404)
            assert.equal(error.code, "TOURNAMENT_NOT_FOUND")
            return true
        }
    )
})

test("complete tournament propagates persistence failures", async () => {
    const expectedError = new Error("Mongo failed")
    const controller = createController({
        retrieveAllPlayedMatchesByTournamentId: async () => {
            throw expectedError
        },
    })

    await assert.rejects(
        controller({ params: { tournament: TOURNAMENT_ID } }, createResponse()),
        expectedError
    )
})

test("league outcome applies points, goal difference and goals scored in order", () => {
    const matches = [
        // Racing y Boca terminan con 3 puntos y +3 de diferencia; Racing metió más goles.
        {
            teamP1: RACING,
            playerP1: NICO,
            scoreP1: 4,
            teamP2: RIVER,
            playerP2: LEO,
            scoreP2: 1,
            outcome: { draw: false, teamThatWon: RACING },
        },
        {
            teamP1: BOCA,
            playerP1: SANTI,
            scoreP1: 3,
            teamP2: RIVER,
            playerP2: LEO,
            scoreP2: 0,
            outcome: { draw: false, teamThatWon: BOCA },
        },
    ]

    const { champion, finalist } = computeLeagueOutcome(matches, createTeams())

    assert.equal(champion.team.name, "Racing")
    assert.equal(finalist.team.name, "Boca")
})

test("league outcome counts draws and keeps players attached", () => {
    const matches = [
        {
            teamP1: RACING,
            playerP1: NICO,
            scoreP1: 1,
            teamP2: BOCA,
            playerP2: SANTI,
            scoreP2: 1,
            outcome: { draw: true },
        },
    ]

    const { champion, finalist } = computeLeagueOutcome(matches, createTeams())

    assert.deepEqual([champion.player.name, finalist.player.name].sort(), [
        "Nico",
        "Santi",
    ])
})

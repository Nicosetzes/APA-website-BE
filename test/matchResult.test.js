const assert = require("node:assert/strict")
const test = require("node:test")

const validateMatchResult = require("../middleware/validateMatchResult")
const matchesModel = require("../dao/models/matches")
const { buildLegsForTie } = require("../service/playoffSeries")
const { MATCH_RULE_MESSAGES } = require("../validation/errorMessages")

const runValidation = (match, body) => {
    let error
    let allowed = false

    validateMatchResult({ match, body }, {}, (result) => {
        error = result
        allowed = !result
    })

    return { allowed, error, body }
}

test("regular matches reject client-provided seeds and penalties", () => {
    const result = runValidation(
        { type: "regular" },
        {
            scoreP1: 1,
            scoreP2: 1,
            seedP1: "1",
            seedP2: "2",
            penaltyScoreP1: 5,
            penaltyScoreP2: 4,
        }
    )

    assert.equal(result.allowed, false)
    assert.equal(result.error.code, "INVALID_MATCH_RESULT")
})

test("knockout matches derive seeds from persistence", () => {
    const result = runValidation(
        { type: "playoff", seedP1: "A1", seedP2: "B2" },
        { scoreP1: 2, scoreP2: 1 }
    )

    assert.equal(result.allowed, true)
    assert.equal(result.body.seedP1, "A1")
    assert.equal(result.body.seedP2, "B2")
})

test("knockout draws require a distinct penalty winner", () => {
    const match = { type: "playoff", seedP1: "A1", seedP2: "B2" }
    const missingPenalties = runValidation(match, {
        scoreP1: 1,
        scoreP2: 1,
    })
    const tiedPenalties = runValidation(match, {
        scoreP1: 1,
        scoreP2: 1,
        penaltyScoreP1: 4,
        penaltyScoreP2: 4,
    })
    const validPenalties = runValidation(match, {
        scoreP1: 1,
        scoreP2: 1,
        penaltyScoreP1: 5,
        penaltyScoreP2: 4,
    })
    const halfPenalties = runValidation(match, {
        scoreP1: 1,
        scoreP2: 1,
        penaltyScoreP1: 5,
    })

    assert.equal(missingPenalties.error.code, "INVALID_MATCH_RESULT")
    assert.equal(tiedPenalties.error.code, "INVALID_MATCH_RESULT")
    assert.equal(halfPenalties.error.code, "INVALID_MATCH_RESULT")
    assert.equal(validPenalties.allowed, true)
    assert.equal(
        missingPenalties.error.message,
        MATCH_RULE_MESSAGES["match.drawNeedsPenalties"]
    )
    assert.equal(
        tiedPenalties.error.message,
        MATCH_RULE_MESSAGES["match.penaltiesTied"]
    )
    assert.equal(
        halfPenalties.error.message,
        MATCH_RULE_MESSAGES["match.penaltiesIncomplete"]
    )
})

test("managed TBD successor preserves PLAYOFF_SERIES_NOT_READY as HttpError", async (t) => {
    const originalFind = matchesModel.find
    t.after(() => {
        matchesModel.find = originalFind
    })
    const tournament = {
        _id: "tournament",
        name: "Copa",
        format: "playoff",
        playoffMode: "two_legged",
    }
    const reference = (id) => ({ id, name: id })
    const [first, second] = buildLegsForTie({
        tournament,
        playoffId: 17,
        unitA: {
            team: reference("team-a"),
            player: reference("player-a"),
            seed: "17A",
        },
        unitB: null,
    })
    matchesModel.find = () => ({
        sort: () => ({ lean: async () => [first, second] }),
    })

    const received = await new Promise((resolve) => {
        validateMatchResult(
            {
                tournament,
                match: first,
                body: {
                    playerP1: first.playerP1,
                    teamP1: first.teamP1,
                    seedP1: first.seedP1,
                    scoreP1: 1,
                    playerP2: first.playerP2,
                    teamP2: first.teamP2,
                    seedP2: first.seedP2,
                    scoreP2: 0,
                },
            },
            {},
            resolve
        )
    })

    assert.equal(received.status, 409)
    assert.equal(received.code, "PLAYOFF_SERIES_NOT_READY")
    assert.equal(received.name, "HttpError")
})

test("managed series dispatcher preserves domain codes and infrastructure errors", async (t) => {
    const originalFind = matchesModel.find
    t.after(() => {
        matchesModel.find = originalFind
    })
    const tournament = {
        _id: "tournament",
        name: "Copa",
        format: "playoff",
        playoffMode: "two_legged",
    }
    const reference = (id) => ({ id, name: id })
    const [first, second] = buildLegsForTie({
        tournament,
        playoffId: 1,
        unitA: {
            team: reference("team-a"),
            player: reference("player-a"),
            seed: "1A",
        },
        unitB: {
            team: reference("team-b"),
            player: reference("player-b"),
            seed: "1B",
        },
    })
    matchesModel.find = () => ({
        sort: () => ({ lean: async () => [first, second] }),
    })
    const domainError = await new Promise((resolve) => {
        validateMatchResult(
            {
                tournament,
                match: first,
                body: {
                    playerP1: first.playerP1,
                    teamP1: first.teamP1,
                    seedP1: first.seedP1,
                    scoreP1: 1,
                    penaltyScoreP1: 4,
                    playerP2: first.playerP2,
                    teamP2: first.teamP2,
                    seedP2: first.seedP2,
                    scoreP2: 1,
                    penaltyScoreP2: 3,
                },
            },
            {},
            resolve
        )
    })
    assert.equal(domainError.status, 400)
    assert.equal(domainError.code, "PENALTIES_NOT_ALLOWED")

    const infrastructureError = new Error("driver details must not be echoed")
    matchesModel.find = () => ({
        sort: () => ({
            lean: async () => {
                throw infrastructureError
            },
        }),
    })
    const received = await new Promise((resolve) => {
        validateMatchResult({ tournament, match: first, body: {} }, {}, resolve)
    })
    assert.equal(received, infrastructureError)
})

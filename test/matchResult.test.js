const assert = require("node:assert/strict")
const test = require("node:test")

const validateMatchResult = require("../middleware/validateMatchResult")

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

    assert.equal(missingPenalties.error.code, "INVALID_MATCH_RESULT")
    assert.equal(tiedPenalties.error.code, "INVALID_MATCH_RESULT")
    assert.equal(validPenalties.allowed, true)
})

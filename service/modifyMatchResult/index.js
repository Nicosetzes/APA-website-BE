const { updateMatchResult } = require("./../../dao")

const modifyMatchResult = async (
    matchId,
    scoreP1,
    scoreP2,
    outcome,
    valid,
    options = {}
) => {
    return updateMatchResult(matchId, scoreP1, scoreP2, outcome, valid, options)
}

module.exports = modifyMatchResult

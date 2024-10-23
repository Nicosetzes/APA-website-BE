const { updateMatchResult } = require("./../../dao")

const modifyMatchResult = async (matchId, scoreP1, scoreP2, outcome, valid) => {
    return await updateMatchResult(matchId, scoreP1, scoreP2, outcome, valid)
}

module.exports = modifyMatchResult

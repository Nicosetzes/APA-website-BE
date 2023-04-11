const { updateMatchResult } = require("./../../dao")

const modifyMatchResult = async (matchId, scoreP1, scoreP2, outcome) => {
    return await updateMatchResult(matchId, scoreP1, scoreP2, outcome)
}

module.exports = modifyMatchResult

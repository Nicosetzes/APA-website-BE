const matchesModel = require("./../models/matches.js")

const updateMatchResult = async (
    matchId,
    scoreP1,
    scoreP2,
    outcome,
    valid,
    options = {}
) => {
    const update = {
        scoreP1,
        scoreP2,
        outcome,
        played: true,
    }

    if (valid === false) update.valid = false

    return matchesModel.findByIdAndUpdate(matchId, update, {
        ...options,
        new: true,
    })
}

module.exports = updateMatchResult

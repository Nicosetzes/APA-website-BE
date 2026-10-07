const matchesModel = require("./../models/matches.js")
const { resolvePlayedAtOnResult } = require("../../utils/playedAt")

// `options.previous` es el partido antes de la edición: decide `playedAt` y no
// se le pasa a Mongoose.
const updateMatchResult = async (
    matchId,
    scoreP1,
    scoreP2,
    outcome,
    valid,
    options = {}
) => {
    const { previous, ...queryOptions } = options
    const update = {
        scoreP1,
        scoreP2,
        outcome,
        played: true,
        ...resolvePlayedAtOnResult(previous, new Date()),
    }

    if (valid === false) update.valid = false

    return matchesModel.findByIdAndUpdate(matchId, update, {
        ...queryOptions,
        new: true,
    })
}

module.exports = updateMatchResult

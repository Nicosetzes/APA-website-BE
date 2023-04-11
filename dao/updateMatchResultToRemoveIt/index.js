const matchesModel = require("./../models/matches.js")

const updateMatchResultToRemoveIt = async (matchId) => {
    const removedMatchResult = await matchesModel.findByIdAndUpdate(
        matchId,
        {
            $unset: {
                scoreP1: 1,
                scoreP2: 1,
                outcome: 1,
            },
            played: false,
        },
        { new: true } // Returns the updated document, not the original
    )
    return removedMatchResult
}

module.exports = updateMatchResultToRemoveIt

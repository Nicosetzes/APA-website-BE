const matchesModel = require("./../models/matches.js")

const updateMatchResult = async (matchId, scoreP1, scoreP2, outcome) => {
    const uploadedMatch = await matchesModel.findByIdAndUpdate(
        matchId,
        {
            scoreP1,
            scoreP2,
            outcome,
            played: true,
        },
        { new: true } // Returns the updated document, not the original
    )
    return uploadedMatch
}

module.exports = updateMatchResult

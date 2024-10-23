const matchesModel = require("./../models/matches.js")

const updateMatchResult = async (matchId, scoreP1, scoreP2, outcome, valid) => {
    const uploadedMatch =
        valid !== false
            ? await matchesModel.findByIdAndUpdate(
                  matchId,
                  {
                      scoreP1,
                      scoreP2,
                      outcome,
                      played: true,
                  },
                  { new: true } // Returns the updated document, not the original
              )
            : await matchesModel.findByIdAndUpdate(
                  matchId,
                  {
                      scoreP1,
                      scoreP2,
                      outcome,
                      played: true,
                      valid: false, // I add valid: false in case match has been simulated.
                  },
                  { new: true } // Returns the updated document, not the original
              )
    return uploadedMatch
}

module.exports = updateMatchResult

const matchesModel = require("./../models/matches.js")

const findAllPlayedMatchesByTournamentId = async (tournament, invalid) => {
    let matches
    invalid
        ? (matches = await matchesModel.find({
              "tournament.id": tournament,
              played: { $ne: false },
          }))
        : (matches = await matchesModel.find({
              "tournament.id": tournament,
              played: { $ne: false },
              valid: { $ne: false },
          }))
    return matches
}

module.exports = findAllPlayedMatchesByTournamentId

const matchesModel = require("./../models/matches.js")

const sortMatchesFromTournamentById = async (tournamentId, group) => {
    let matches = group
        ? await matchesModel
              .find({
                  "tournament.id": tournamentId,
                  group: group,
                  played: true,
                  type: "regular",
              })
              .sort({ updatedAt: -1, _id: -1 })
        : await matchesModel
              .find({
                  "tournament.id": tournamentId,
                  played: true,
                  type: "regular",
              })
              .sort({ updatedAt: -1, _id: -1 })
    return matches
}

module.exports = sortMatchesFromTournamentById

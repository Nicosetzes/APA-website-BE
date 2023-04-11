const matchesModel = require("./../models/matches.js")

const sortPlayoffMatchesFromTournamentById = async (tournamentId) => {
    let matches = await matchesModel
        .find({
            "tournament.id": tournamentId,
            played: true,
            type: "playoff",
        })
        .sort({ updatedAt: -1, _id: -1 })
    return matches
}

module.exports = sortPlayoffMatchesFromTournamentById

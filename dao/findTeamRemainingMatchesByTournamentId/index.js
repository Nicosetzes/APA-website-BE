const matchesModel = require("./../models/matches.js")

const findTeamRemainingMatchesByTournamentId = async (tournamentId, teamID) => {
    const matches = await matchesModel.find({
        played: { $ne: true },
        valid: { $ne: false },
        "tournament.id": tournamentId,
        $or: [{ "teamP1.id": [teamID] }, { "teamP2.id": [teamID] }],
    })
    return { team: { id: teamID }, matches }
}

module.exports = findTeamRemainingMatchesByTournamentId

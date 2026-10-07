const matchesModel = require("./../models/matches.js")

// El id del equipo puede estar guardado como string o number (D5).
const teamIdVariants = (teamID) =>
    [String(teamID), Number(teamID)].filter(
        (value) => typeof value === "string" || !Number.isNaN(value)
    )

const findTeamRemainingMatchesByTournamentId = async (tournamentId, teamID) => {
    const ids = teamIdVariants(teamID)
    const matches = await matchesModel.find({
        played: { $ne: true },
        valid: { $ne: false },
        "tournament.id": tournamentId,
        $or: [{ "teamP1.id": { $in: ids } }, { "teamP2.id": { $in: ids } }],
    })
    return { team: { id: teamID }, matches }
}

module.exports = findTeamRemainingMatchesByTournamentId

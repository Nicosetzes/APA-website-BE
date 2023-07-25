const { findTeamRemainingMatchesByTournamentId } = require("./../../dao")

const retrieveTeamRemainingMatchesByTournamentId = async (
    tournamentId,
    teamIDs
) => {
    // In this case, I return the amount of remaining matches for each team in a tournament //
    /* 
        1) I map all team IDs (not necessary in this case). 
        2) In each loop, I calculate the required value for each team and return this value
        3) Since each value is a promise (pending), at the end of the .map I must return all results with Promise.all()
        4) To use this values later, I'll need to resolve this funcion with await.  
        */

    const matches = teamIDs.map(async (teamID) => {
        let value = await findTeamRemainingMatchesByTournamentId(
            tournamentId,
            teamID
        )
        return value
    })

    return Promise.all(matches)
}

module.exports = retrieveTeamRemainingMatchesByTournamentId

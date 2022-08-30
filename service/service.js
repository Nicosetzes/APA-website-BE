const {
    // createInvalidToken,
    // findInvalidToken,
    createUser,
    findUserById,
    findUserByUserName,
    findAllPlayers,
    findPlayer,
    findRecentMatchesFromPlayer,
    findWonMatchesFromPlayer,
    countTotalMatchesFromAPlayerTeam,
    countTotalMatchesFromPlayerByTournament,
    countTotalWinsFromPlayerByTournament,
    countTotalLossesFromPlayerByTournament,
    countTotalMatchesFromPlayer,
    findTeamsWithAtLeastOneWinFromPlayer,
    countTotalWinsFromPlayer,
    countTotalDrawsFromPlayer,
    countTotalLossesFromPlayer,
    sortMatchesByScoringDifference,
    sortMatchesFromTournamentById,
    createMatch,
    findMatchById,
    removeMatchById,
    findMatchesByQuery,
    findMatches,
    findTournamentNames,
    findRecentTournamentNames,
    findOngoingTournaments,
    findTournamentById,
    createTournament,
    findTournaments,
    updateFixtureFromTournamentVersionOne,
    updateFixtureFromTournamentVersionTwo,
    updateFixtureFromTournamentWhenEditing,
    updateFixtureFromTournamentWhenRemoving,
    updateTeamsFromTournament,
    updateFixtureFromTournamentWhenCreated,
} = require("./../dao/dao.js")

// const originateInvalidToken = async (token) => {
//   return await createInvalidToken(token);
// };

// const retrieveInvalidToken = async (token) => {
//   return await findInvalidToken(token);
// };

const originateUser = async (user) => {
    return await createUser(user)
}

const retrieveUserById = async (id) => {
    return await findUserById(id)
}

const retrieveUserByUserName = async (email) => {
    return await findUserByUserName(email)
}

const retrieveAllPlayers = async () => {
    return await findAllPlayers()
}

const retrievePlayer = async (player) => {
    return await findPlayer(player)
}

// const orderPlayersByLongestWinningStreak = async () => {
//     return await sortPlayersByLongestWinningStreak()
// }

// const orderPlayersByLongestDrawStreak = async () => {
//     return await sortPlayersByLongestDrawStreak()
// }

// const orderPlayersByLongestLosingStreak = async () => {
//     return await sortPlayersByLongestLosingStreak()
// }

const retrieveRecentMatchesFromPlayer = async (player) => {
    return await findRecentMatchesFromPlayer(player)
}

const retrieveWonMatchesFromPlayer = async (player) => {
    return await findWonMatchesFromPlayer(player)
}

const totalMatchesFromAPlayerTeam = async (playerQuery, teamQuery) => {
    return await countTotalMatchesFromAPlayerTeam(playerQuery, teamQuery)
}

const totalMatchesFromPlayerByTournament = async (tournamentId, teamQuery) => {
    return await countTotalMatchesFromPlayerByTournament(
        tournamentId,
        teamQuery
    )
}

const totalWinsFromPlayerByTournament = async (tournamentId, playerQuery) => {
    return await countTotalWinsFromPlayerByTournament(tournamentId, playerQuery)
}

const totalLossesFromPlayerByTournament = async (tournamentId, playerQuery) => {
    return await countTotalLossesFromPlayerByTournament(
        tournamentId,
        playerQuery
    )
}

const totalMatchesFromPlayer = async (playerQuery) => {
    return await countTotalMatchesFromPlayer(playerQuery)
}

const retrieveTeamsWithAtLeastOneWinFromPlayer = async (playerQuery) => {
    return await findTeamsWithAtLeastOneWinFromPlayer(playerQuery)
}

const totalWinsFromPlayer = async (playerQuery) => {
    return await countTotalWinsFromPlayer(playerQuery)
}

const totalDrawsFromPlayer = async (playerQuery) => {
    return await countTotalDrawsFromPlayer(playerQuery)
}

const totalLossesFromPlayer = async (playerQuery) => {
    return await countTotalLossesFromPlayer(playerQuery)
}

const orderMatchesByScoringDifference = async () => {
    return await sortMatchesByScoringDifference()
}

const orderMatchesFromTournamentById = async (tournamentId) => {
    return await sortMatchesFromTournamentById(tournamentId)
}

const originateMatch = async (match) => {
    return await createMatch(match)
}

const retrieveMatchById = async (id) => {
    return await findMatchById(id)
}

const deleteMatchById = async (id) => {
    return await removeMatchById(id)
}

const retrieveMatchesByQuery = async (query) => {
    return await findMatchesByQuery(query)
}

const retrieveMatches = async (qty) => {
    return await findMatches(qty)
}

const retrieveTournamentNames = async () => {
    return await findTournamentNames()
}

const retrieveRecentTournamentNames = async () => {
    return await findRecentTournamentNames()
}

const retrieveOngoingTournaments = async () => {
    return await findOngoingTournaments()
}

const retrieveTournamentById = async (id) => {
    return await findTournamentById(id)
}

const originateTournament = async (tournament) => {
    return await createTournament(tournament)
}

const retrieveTournaments = async () => {
    return await findTournaments()
}

const modifyFixtureFromTournamentVersionOne = async (
    tournamentId,
    teamThatWon,
    teamThatLost,
    scoreFromTeamThatWon,
    scoreFromTeamThatLost,
    matchId
) => {
    return await updateFixtureFromTournamentVersionOne(
        tournamentId,
        teamThatWon,
        teamThatLost,
        scoreFromTeamThatWon,
        scoreFromTeamThatLost,
        matchId
    )
}

const modifyFixtureFromTournamentVersionTwo = async (
    tournamentId,
    teamThatWon,
    teamThatLost,
    scoreFromTeamThatWon,
    scoreFromTeamThatLost,
    matchId
) => {
    return await updateFixtureFromTournamentVersionTwo(
        tournamentId,
        teamThatWon,
        teamThatLost,
        scoreFromTeamThatWon,
        scoreFromTeamThatLost,
        matchId
    )
}

const modifyFixtureFromTournamentWhenEditing = async (
    tournamentId,
    teamP1,
    teamP2,
    scoreP1,
    scoreP2
) => {
    return await updateFixtureFromTournamentWhenEditing(
        tournamentId,
        teamP1,
        teamP2,
        scoreP1,
        scoreP2
    )
}

const modifyFixtureFromTournamentWhenRemoving = async (
    tournamentId,
    matchId
) => {
    return await updateFixtureFromTournamentWhenRemoving(tournamentId, matchId)
}

const modifyTeamsFromTournament = async (tournamentId, team, player) => {
    return await updateTeamsFromTournament(tournamentId, team, player)
}

const modifyFixtureFromTournamentWhenCreated = async (
    tournamentId,
    fixture
) => {
    return await updateFixtureFromTournamentWhenCreated(tournamentId, fixture)
}

module.exports = {
    // originateInvalidToken,
    // retrieveInvalidToken,
    originateUser,
    retrieveUserById,
    retrieveUserByUserName,
    retrieveAllPlayers,
    retrievePlayer,
    retrieveRecentMatchesFromPlayer,
    retrieveWonMatchesFromPlayer,
    totalMatchesFromAPlayerTeam,
    totalMatchesFromPlayerByTournament,
    totalWinsFromPlayerByTournament,
    totalLossesFromPlayerByTournament,
    totalMatchesFromPlayer,
    retrieveTeamsWithAtLeastOneWinFromPlayer,
    totalWinsFromPlayer,
    totalDrawsFromPlayer,
    totalLossesFromPlayer,
    orderMatchesByScoringDifference,
    orderMatchesFromTournamentById,
    originateMatch,
    retrieveMatchById,
    deleteMatchById,
    retrieveMatchesByQuery,
    retrieveMatches,
    retrieveTournamentNames,
    retrieveRecentTournamentNames,
    retrieveOngoingTournaments,
    retrieveTournamentById,
    originateTournament,
    retrieveTournaments,
    modifyFixtureFromTournamentVersionOne,
    modifyFixtureFromTournamentVersionTwo,
    modifyFixtureFromTournamentWhenEditing,
    modifyFixtureFromTournamentWhenRemoving,
    modifyTeamsFromTournament,
    modifyFixtureFromTournamentWhenCreated,
}

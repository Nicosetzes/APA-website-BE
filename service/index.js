const calculateMatchesFromPlayer = require("./calculateMatchesFromPlayer")
const calculateMatchLossesFromPlayer = require("./calculateMatchLossesFromPlayer")
const calculateMatchWinsFromPlayer = require("./calculateMatchWinsFromPlayer")
const modifyManyMatches = require("./modifyManyMatches")
const modifyMatchResult = require("./modifyMatchResult")
const modifyMatchResultToRemoveIt = require("./modifyMatchResultToRemoveIt")
const orderMatchesFromTournamentById = require("./orderMatchesFromTournamentById")
const orderPlayoffMatchesFromTournamentById = require("./orderPlayoffMatchesFromTournamentById")
const originateChampionsLeaguePlayoffByTournamentId = require("./originateChampionsLeaguePlayoffByTournamentId")
// const originateChampionsLeaguePlayoffUpdateByTournamentId = require("./originateChampionsLeaguePlayoffUpdateByTournamentId")
const originateFixtureByTournamentId = require("./originateFixtureByTournamentId")
const originateManyMatches = require("./originateManyMatches")
const originateMatch = require("./originateMatch")
const originatePlayinByTournamentId = require("./originatePlayinByTournamentId")
const originatePlayoffUpdateByTournamentId = require("./originatePlayoffUpdateByTournamentId")
const originatePlayoffWithPlayinByTournamentId = require("./originatePlayoffWithPlayinByTournamentId")
const originateTournament = require("./originateTournament")
const originateUser = require("./originateUser")
const originateWorldCupPlayoffByTournamentId = require("./originateWorldCupPlayoffByTournamentId")
const retrieveAllUsers = require("./retrieveAllUsers")
const retrieveAllMatches = require("./retrieveAllMatches")
const retrieveAllMatchesByTournamentId = require("./retrieveAllMatchesByTournamentId")
const retrieveAllMatchesByUserId = require("./retrieveAllMatchesByUserId")
const retrieveMatches = require("./retrieveMatches")
const retrieveMatchesByTeamName = require("./retrieveMatchesByTeamName")
const retrieveMatchesByTournamentId = require("./retrieveMatchesByTournamentId")
const retrieveFixtureByTournamentId = require("./retrieveFixtureByTournamentId")
const retrievePlayinMatchesByTournamentId = require("./retrievePlayinMatchesByTournamentId")
const retrievePlayoffMatchesByTournamentId = require("./retrievePlayoffMatchesByTournamentId")
const retrieveRecentMatchesFromPlayer = require("./retrieveRecentMatchesFromPlayer")
const retrieveTournamentById = require("./retrieveTournamentById")
const retrieveTournamentPlayersByTournamentId = require("./retrieveTournamentPlayersByTournamentId")
const retrieveTournaments = require("./retrieveTournaments")
// const retrieveTournamentTeamsByTournamentId = require("./retrieveTournamentTeamsByTournamentId")
const retrieveUserById = require("./retrieveUserById")
const retrieveUserByUserName = require("./retrieveUserByUserName")

module.exports = {
    calculateMatchesFromPlayer,
    calculateMatchLossesFromPlayer,
    calculateMatchWinsFromPlayer,
    modifyManyMatches,
    modifyMatchResult,
    modifyMatchResultToRemoveIt,
    orderMatchesFromTournamentById,
    orderPlayoffMatchesFromTournamentById,
    originateChampionsLeaguePlayoffByTournamentId,
    // originateChampionsLeaguePlayoffUpdateByTournamentId,
    originateFixtureByTournamentId,
    originateManyMatches,
    originateMatch,
    originatePlayinByTournamentId,
    originatePlayoffUpdateByTournamentId,
    originatePlayoffWithPlayinByTournamentId,
    originateTournament,
    originateUser,
    originateWorldCupPlayoffByTournamentId,
    retrieveAllUsers,
    retrieveAllMatches,
    retrieveAllMatchesByTournamentId,
    retrieveAllMatchesByUserId,
    retrieveMatches,
    retrieveMatchesByTeamName,
    retrieveMatchesByTournamentId,
    retrieveFixtureByTournamentId,
    retrievePlayinMatchesByTournamentId,
    retrievePlayoffMatchesByTournamentId,
    retrieveRecentMatchesFromPlayer,
    retrieveTournamentById,
    retrieveTournamentPlayersByTournamentId,
    retrieveTournaments,
    // retrieveTournamentTeamsByTournamentId,
    retrieveUserById,
    retrieveUserByUserName,
}

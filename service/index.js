const calculateAllMatchesByTournamentId = require("./calculateAllMatchesByTournamentId")
const calculateMatchesFromPlayer = require("./calculateMatchesFromPlayer")
const calculateMatchLossesFromPlayer = require("./calculateMatchLossesFromPlayer")
const calculateMatchWinsFromPlayer = require("./calculateMatchWinsFromPlayer")
const modifyManyMatches = require("./modifyManyMatches")
const modifyMatchResult = require("./modifyMatchResult")
const modifyMatchResultToRemoveIt = require("./modifyMatchResultToRemoveIt")
const modifySquad = require("./modifySquad")
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
const retrieveAllPlayedMatchesByTournamentId = require("./retrieveAllPlayedMatchesByTournamentId")
const retrieveAllNotPlayedMatchesByTournamentId = require("./retrieveAllNotPlayedMatchesByTournamentId")
const retrieveAllMatchesByUserId = require("./retrieveAllMatchesByUserId")
const retrieveMatches = require("./retrieveMatches")
const retrieveMatchesByTeamName = require("./retrieveMatchesByTeamName")
const retrieveMatchesByTournamentId = require("./retrieveMatchesByTournamentId")
const retrieveFixtureByTournamentId = require("./retrieveFixtureByTournamentId")
const retrievePlayerMatchesByTournamentId = require("./retrievePlayerMatchesByTournamentId")
const retrievePlayinMatchesByTournamentId = require("./retrievePlayinMatchesByTournamentId")
const retrievePlayoffMatchesByTournamentId = require("./retrievePlayoffMatchesByTournamentId")
const retrieveRecentMatchesFromPlayer = require("./retrieveRecentMatchesFromPlayer")
const retrieveStandingsForCalculatorByTournamentId = require("./retrieveStandingsForCalculatorByTournamentId")
const retrieveTeamRemainingMatchesByTournamentId = require("./retrieveTeamRemainingMatchesByTournamentId")
const retrieveTournamentById = require("./retrieveTournamentById")
const retrieveTournamentPlayersByTournamentId = require("./retrieveTournamentPlayersByTournamentId")
const retrieveTournaments = require("./retrieveTournaments")
// const retrieveTournamentTeamsByTournamentId = require("./retrieveTournamentTeamsByTournamentId")
const retrieveUserById = require("./retrieveUserById")
const retrieveUserByUserName = require("./retrieveUserByUserName")

module.exports = {
    calculateAllMatchesByTournamentId,
    calculateMatchesFromPlayer,
    calculateMatchLossesFromPlayer,
    calculateMatchWinsFromPlayer,
    modifyManyMatches,
    modifyMatchResult,
    modifyMatchResultToRemoveIt,
    modifySquad,
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
    retrieveAllPlayedMatchesByTournamentId,
    retrieveAllNotPlayedMatchesByTournamentId,
    retrieveAllMatchesByUserId,
    retrieveMatches,
    retrieveMatchesByTeamName,
    retrieveMatchesByTournamentId,
    retrieveFixtureByTournamentId,
    retrievePlayerMatchesByTournamentId,
    retrievePlayinMatchesByTournamentId,
    retrievePlayoffMatchesByTournamentId,
    retrieveRecentMatchesFromPlayer,
    retrieveStandingsForCalculatorByTournamentId,
    retrieveTeamRemainingMatchesByTournamentId,
    retrieveTournamentById,
    retrieveTournamentPlayersByTournamentId,
    retrieveTournaments,
    // retrieveTournamentTeamsByTournamentId,
    retrieveUserById,
    retrieveUserByUserName,
}

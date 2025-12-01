const calculateAllMatchesByTournamentId = require("./calculateAllMatchesByTournamentId")
const calculateMatchesFromPlayer = require("./calculateMatchesFromPlayer")
const calculateMatchLossesFromPlayer = require("./calculateMatchLossesFromPlayer")
const calculateMatchWinsFromPlayer = require("./calculateMatchWinsFromPlayer")
const modifyManyMatches = require("./modifyManyMatches")
const modifyMatchResult = require("./modifyMatchResult")
const modifyMatchResultToRemoveIt = require("./modifyMatchResultToRemoveIt")
const modifySquad = require("./modifySquad")
const modifyTournamentOutcome = require("./modifyTournamentOutcome")
const orderMatchesFromTournamentById = require("./orderMatchesFromTournamentById")
const orderPlayoffMatchesFromTournamentById = require("./orderPlayoffMatchesFromTournamentById")
const originateChampionsLeaguePlayoffByTournamentId = require("./originateChampionsLeaguePlayoffByTournamentId")
const originateFixtureByTournamentId = require("./originateFixtureByTournamentId")
const originateManyMatches = require("./originateManyMatches")
const originateMatch = require("./originateMatch")
const originatePlayinByTournamentId = require("./originatePlayinByTournamentId")
const originatePlayoffByTournamentId = require("./originatePlayoffByTournamentId")
const originatePlayoffUpdateByTournamentId = require("./originatePlayoffUpdateByTournamentId")
const originatePlayoffWithPlayinByTournamentId = require("./originatePlayoffWithPlayinByTournamentId")
const originateTournament = require("./originateTournament")
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
    modifyTournamentOutcome,
    orderMatchesFromTournamentById,
    orderPlayoffMatchesFromTournamentById,
    originateChampionsLeaguePlayoffByTournamentId,
    originateFixtureByTournamentId,
    originateManyMatches,
    originateMatch,
    originatePlayinByTournamentId,
    originatePlayoffByTournamentId,
    originatePlayoffUpdateByTournamentId,
    originatePlayoffWithPlayinByTournamentId,
    originateTournament,
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
    retrieveUserById,
    retrieveUserByUserName,
}

const calculateGroupStagePlayoff = require("./calculateGroupStagePlayoff")
const generatePlayoffUpdate = require("./generatePlayoffUpdate")
const modifyMatchResult = require("./modifyMatchResult")
const modifyMatchResultToRemoveIt = require("./modifyMatchResultToRemoveIt")
const modifyTournamentOutcome = require("./modifyTournamentOutcome")
const orderMatchesFromTournamentById = require("./orderMatchesFromTournamentById")
const originateChampionsLeaguePlayoffByTournamentId = require("./originateChampionsLeaguePlayoffByTournamentId")
const originateFixtureByTournamentId = require("./originateFixtureByTournamentId")
const originatePlayinByTournamentId = require("./originatePlayinByTournamentId")
const originatePlayoffByTournamentId = require("./originatePlayoffByTournamentId")
const originatePlayoffWithPlayinByTournamentId = require("./originatePlayoffWithPlayinByTournamentId")
const originateTournament = require("./originateTournament")
const originateWorldCupPlayoffByTournamentId = require("./originateWorldCupPlayoffByTournamentId")
const retrieveAllUsers = require("./retrieveAllUsers")
const retrieveAllMatches = require("./retrieveAllMatches")
const retrieveAllPlayedMatchesByTournamentId = require("./retrieveAllPlayedMatchesByTournamentId")
const retrieveAllNotPlayedMatchesByTournamentId = require("./retrieveAllNotPlayedMatchesByTournamentId")
const retrieveMatches = require("./retrieveMatches")
const retrieveFixtureByTournamentId = require("./retrieveFixtureByTournamentId")
const retrievePlayerMatchesByTournamentId = require("./retrievePlayerMatchesByTournamentId")
const retrievePlayinMatchesByTournamentId = require("./retrievePlayinMatchesByTournamentId")
const retrievePlayoffMatchesByTournamentId = require("./retrievePlayoffMatchesByTournamentId")
const retrieveStandingsForCalculatorByTournamentId = require("./retrieveStandingsForCalculatorByTournamentId")
const retrieveTeamRemainingMatchesByTournamentId = require("./retrieveTeamRemainingMatchesByTournamentId")
const retrieveTournamentById = require("./retrieveTournamentById")
const retrieveTournamentPlayersByTournamentId = require("./retrieveTournamentPlayersByTournamentId")
const retrieveTournaments = require("./retrieveTournaments")
const retrieveUserByUserName = require("./retrieveUserByUserName")

module.exports = {
    calculateGroupStagePlayoff,
    generatePlayoffUpdate,
    modifyMatchResult,
    modifyMatchResultToRemoveIt,
    modifyTournamentOutcome,
    orderMatchesFromTournamentById,
    originateChampionsLeaguePlayoffByTournamentId,
    originateFixtureByTournamentId,
    originatePlayinByTournamentId,
    originatePlayoffByTournamentId,
    originatePlayoffWithPlayinByTournamentId,
    originateTournament,
    originateWorldCupPlayoffByTournamentId,
    retrieveAllUsers,
    retrieveAllMatches,
    retrieveAllPlayedMatchesByTournamentId,
    retrieveAllNotPlayedMatchesByTournamentId,
    retrieveMatches,
    retrieveFixtureByTournamentId,
    retrievePlayerMatchesByTournamentId,
    retrievePlayinMatchesByTournamentId,
    retrievePlayoffMatchesByTournamentId,
    retrieveStandingsForCalculatorByTournamentId,
    retrieveTeamRemainingMatchesByTournamentId,
    retrieveTournamentById,
    retrieveTournamentPlayersByTournamentId,
    retrieveTournaments,
    retrieveUserByUserName,
}

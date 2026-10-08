const calculateGroupStagePlayoff = require("./calculateGroupStagePlayoff")
const generatePlayinUpdate = require("./generatePlayinUpdate")
const generatePlayoffUpdate = require("./generatePlayoffUpdate")
const modifyMatchResult = require("./modifyMatchResult")
const modifyMatchResultToRemoveIt = require("./modifyMatchResultToRemoveIt")
const modifyTournamentOutcome = require("./modifyTournamentOutcome")
const modifyTournamentStartedAt = require("./modifyTournamentStartedAt")
const modifyTournamentStartedAtAfterRemoval = require("./modifyTournamentStartedAtAfterRemoval")
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
const retrieveMatchTeams = require("./retrieveMatchTeams")
const retrieveFixtureByTournamentId = require("./retrieveFixtureByTournamentId")
const retrievePlayerMatchesByTournamentId = require("./retrievePlayerMatchesByTournamentId")
const retrievePlayinMatchesByTournamentId = require("./retrievePlayinMatchesByTournamentId")
const retrievePlayoffMatchesByTournamentId = require("./retrievePlayoffMatchesByTournamentId")
const retrieveStandingsForCalculatorByTournamentId = require("./retrieveStandingsForCalculatorByTournamentId")
const retrieveTeamRemainingMatchesByTournamentId = require("./retrieveTeamRemainingMatchesByTournamentId")
const retrieveTournamentById = require("./retrieveTournamentById")
const retrieveTournamentPlayersByTournamentId = require("./retrieveTournamentPlayersByTournamentId")
const retrieveTournaments = require("./retrieveTournaments")
const retrieveTournamentsForStatistics = require("./retrieveTournamentsForStatistics")
const retrieveUserByUserName = require("./retrieveUserByUserName")
const processPlayoffSeriesResult = require("./processPlayoffSeriesResult")
const removePlayoffSeriesResult = require("./removePlayoffSeriesResult")
const playoffSeries = require("./playoffSeries")

module.exports = {
    calculateGroupStagePlayoff,
    generatePlayinUpdate,
    generatePlayoffUpdate,
    modifyMatchResult,
    modifyMatchResultToRemoveIt,
    modifyTournamentOutcome,
    modifyTournamentStartedAt,
    modifyTournamentStartedAtAfterRemoval,
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
    retrieveMatchTeams,
    retrieveFixtureByTournamentId,
    retrievePlayerMatchesByTournamentId,
    retrievePlayinMatchesByTournamentId,
    retrievePlayoffMatchesByTournamentId,
    retrieveStandingsForCalculatorByTournamentId,
    retrieveTeamRemainingMatchesByTournamentId,
    retrieveTournamentById,
    retrieveTournamentPlayersByTournamentId,
    retrieveTournaments,
    retrieveTournamentsForStatistics,
    retrieveUserByUserName,
    processPlayoffSeriesResult,
    removePlayoffSeriesResult,
    playoffSeries,
    ...playoffSeries,
}

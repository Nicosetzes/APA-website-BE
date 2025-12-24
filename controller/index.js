const getAllTimeFaceToFace = require("./getAllTimeFaceToFace")
const getAllTimeTeams = require("./getAllTimeTeams")
const getCalculatorByTournamentId = require("./getCalculatorByTournamentId")
const getFixtureByTournamentId = require("./getFixtureByTournamentId")
const getMatches = require("./getMatches")
const getMatchesSummaryByDate = require("./getMatchesSummaryByDate")
const getPlayerInfoByTournamentId = require("./getPlayerInfoByTournamentId")
const getPlayersByTournamentId = require("./getPlayersByTournamentId")
const getPlayerStatsSummaryByTournamentId = require("./getPlayerStatsSummaryByTournamentId")
const getPlayinMatchesByTournamentId = require("./getPlayinMatchesByTournamentId")
const getPlayoffsBracketByTournamentId = require("./getPlayoffsBracketByTournamentId")
const getPlayoffMatchesByTournamentId = require("./getPlayoffMatchesByTournamentId")
const getPlayoffsPlayerInfoByTournamentId = require("./getPlayoffsPlayerInfoByTournamentId")
const getPlayoffsTableByTournamentId = require("./getPlayoffsTableByTournamentId")
const getPlayoffsUpdatedWinsByTournamentId = require("./getPlayoffsUpdatedWinsByTournamentId")
const getStandingsPlayerInfoByTournamentId = require("./getStandingsPlayerInfoByTournamentId")
const getStandingsSummaryByTournamentId = require("./getStandingsSummaryByTournamentId")
const getStandingsTableByTournamentId = require("./getStandingsTableByTournamentId")
const getStatistics = require("./getStatistics")
const getSquadByTeamId = require("./getSquadByTeamId")
const getTeamInformationByTournamentId = require("./getTeamInformationByTournamentId")
const getTeamsByTournamentId = require("./getTeamsByTournamentId")
const getTournamentById = require("./getTournamentById")
const getTournaments = require("./getTournaments")
const getUsers = require("./getUsers")
const getWorldCupPlayoffMatchesByTournamentId = require("./getWorldCupPlayoffMatchesByTournamentId")
const getWorldCupPlayoffTeamsByTournamentId = require("./getWorldCupPlayoffTeamsByTournamentId")
const getWorldCupStandingsByTournamentId = require("./getWorldCupStandingsByTournamentId")
const majorUpdatesController = require("./majorUpdatesController")
const postFixtureByTournamentId = require("./postFixtureByTournamentId")
const postLogin = require("./postLogin")
const postLogout = require("./postLogout")
const postMatch = require("./postMatch")
const postMatchByTournamentId = require("./postMatchByTournamentId")
const postPlayinByTournamentId = require("./postPlayinByTournamentId")
const postPlayinUpdateByTournamentId = require("./postPlayinUpdateByTournamentId")
const postPlayoffByTournamentId = require("./postPlayoffByTournamentId")
const postPlayoffUpdateByTournamentId = require("./postPlayoffUpdateByTournamentId")
const postRetrievePassword = require("./postRetrievePassword")
const postSolicitateNewPassword = require("./postSolicitateNewPassword")
const postTournaments = require("./postTournaments")
const postWorldCupMatchesByTournamentId = require("./postWorldCupMatchesByTournamentId")
const putMatchByTournamentId = require("./putMatchByTournamentId")
const putRemoveMatchByTournamentId = require("./putRemoveMatchByTournamentId")
const putSquadByTeamId = require("./putSquadByTeamId")
const postDailyRecapByTournamentId = require("./postDailyRecapByTournamentId")
const getDailyRecapByTournamentId = require("./getDailyRecapByTournamentId")
const { postEdits, postEditsUpload } = require("./postEdits")
const getEdits = require("./getEdits")
const deleteEdit = require("./deleteEdit")

module.exports = {
    getAllTimeFaceToFace,
    getAllTimeTeams,
    getCalculatorByTournamentId,
    getFixtureByTournamentId,
    getMatches,
    getPlayerInfoByTournamentId,
    getPlayersByTournamentId,
    getPlayinMatchesByTournamentId,
    getPlayoffsBracketByTournamentId,
    getPlayoffMatchesByTournamentId,
    getPlayoffsPlayerInfoByTournamentId,
    getPlayoffsTableByTournamentId,
    getPlayoffsUpdatedWinsByTournamentId,
    getStandingsPlayerInfoByTournamentId,
    getStandingsTableByTournamentId,
    getStatistics,
    getSquadByTeamId,
    getTeamInformationByTournamentId,
    getTeamsByTournamentId,
    getTournamentById,
    getTournaments,
    getUsers,
    getWorldCupPlayoffMatchesByTournamentId,
    getWorldCupPlayoffTeamsByTournamentId,
    getWorldCupStandingsByTournamentId,
    majorUpdatesController,
    getMatchesSummaryByDate,
    getStandingsSummaryByTournamentId,
    getPlayerStatsSummaryByTournamentId,
    postFixtureByTournamentId,
    postLogin,
    postLogout,
    postMatch,
    postMatchByTournamentId,
    postPlayinByTournamentId,
    postPlayinUpdateByTournamentId,
    postPlayoffByTournamentId,
    postPlayoffUpdateByTournamentId,
    postSolicitateNewPassword,
    postRetrievePassword,
    postTournaments,
    postWorldCupMatchesByTournamentId,
    putMatchByTournamentId,
    putRemoveMatchByTournamentId,
    putSquadByTeamId,
    postDailyRecapByTournamentId,
    getDailyRecapByTournamentId,
    postEdits,
    postEditsUpload,
    getEdits,
    deleteEdit,
}

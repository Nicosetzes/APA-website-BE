const getAllTimeFaceToFace = require("./getAllTimeFaceToFace")
// const getAllTimeGeneralStatistics = require("./getAllTimeGeneralStatistics")
const getAllTimeStandings = require("./getAllTimeStandings")
const getAllTimeTeams = require("./getAllTimeTeams")
const getCalculatorByTournamentId = require("./getCalculatorByTournamentId")
const getFixtureByTournamentId = require("./getFixtureByTournamentId")
const getHome = require("./getHome")
const getIsUserAuthenticated = require("./getIsUserAuthenticated")
const getMatches = require("./getMatches")
const getPlayerInfoByTournamentId = require("./getPlayerInfoByTournamentId")
const getPlayersByTournamentId = require("./getPlayersByTournamentId")
const getPlayinMatchesByTournamentId = require("./getPlayinMatchesByTournamentId")
const getPlayoffsBracketByTournamentId = require("./getPlayoffsBracketByTournamentId")
const getPlayoffMatchesByTournamentId = require("./getPlayoffMatchesByTournamentId")
const getPlayoffsPlayerInfoByTournamentId = require("./getPlayoffsPlayerInfoByTournamentId")
const getPlayoffsTableByTournamentId = require("./getPlayoffsTableByTournamentId")
const getPlayoffsUpdatedWinsByTournamentId = require("./getPlayoffsUpdatedWinsByTournamentId")
const getStandingsPlayerInfoByTournamentId = require("./getStandingsPlayerInfoByTournamentId")
const getStandingsTableByTournamentId = require("./getStandingsTableByTournamentId")
const getStatistics = require("./getStatistics")
const getStreaks = require("./getStreaks")
const getSquadByTeamId = require("./getSquadByTeamId")
const getTeamInformationByTournamentId = require("./getTeamInformationByTournamentId")
const getTeamsByTournamentId = require("./getTeamsByTournamentId")
const getTournamentById = require("./getTournamentById")
const getTournaments = require("./getTournaments")
const getUserProfile = require("./getUserProfile")
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
const postRegister = require("./postRegister")
const postRetrievePassword = require("./postRetrievePassword")
const postSolicitateNewPassword = require("./postSolicitateNewPassword")
const postTournaments = require("./postTournaments")
const postWorldCupMatchesByTournamentId = require("./postWorldCupMatchesByTournamentId")
const putMatchByTournamentId = require("./putMatchByTournamentId")
const putRemoveMatchByTournamentId = require("./putRemoveMatchByTournamentId")
const putSquadByTeamId = require("./putSquadByTeamId")

module.exports = {
    getAllTimeFaceToFace,
    // getAllTimeGeneralStatistics,
    getAllTimeStandings,
    getAllTimeTeams,
    getCalculatorByTournamentId,
    getFixtureByTournamentId,
    getHome,
    getIsUserAuthenticated,
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
    getStreaks,
    getSquadByTeamId,
    getTeamInformationByTournamentId,
    getTeamsByTournamentId,
    getTournamentById,
    getTournaments,
    getUserProfile,
    getUsers,
    getWorldCupPlayoffMatchesByTournamentId,
    getWorldCupPlayoffTeamsByTournamentId,
    getWorldCupStandingsByTournamentId,
    majorUpdatesController,
    postFixtureByTournamentId,
    postLogin,
    postLogout,
    postMatch,
    postMatchByTournamentId,
    postPlayinByTournamentId,
    postPlayinUpdateByTournamentId,
    postPlayoffByTournamentId,
    postPlayoffUpdateByTournamentId,
    postRegister,
    postSolicitateNewPassword,
    postRetrievePassword,
    postTournaments,
    postWorldCupMatchesByTournamentId,
    putMatchByTournamentId,
    putRemoveMatchByTournamentId,
    putSquadByTeamId,
}

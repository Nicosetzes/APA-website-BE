const getAllTimeFaceToFace = require("./getAllTimeFaceToFace")
const getAllTimeGeneralStatistics = require("./getAllTimeGeneralStatistics")
const getAllTimeStandings = require("./getAllTimeStandings")
const getHome = require("./getHome")
const getIsUserAuthenticated = require("./getIsUserAuthenticated")
const getLogout = require("./getLogout")
const getMatches = require("./getMatches")
const getFixtureByTournamentId = require("./getFixtureByTournamentId")
const postFixtureByTournamentId = require("./postFixtureByTournamentId")
const getPlayersByTournamentId = require("./getPlayersByTournamentId")
const postPlayinByTournamentId = require("./postPlayinByTournamentId")
const postPlayinUpdateByTournamentId = require("./postPlayinUpdateByTournamentId")
const getPlayinMatchesByTournamentId = require("./getPlayinMatchesByTournamentId")
const postPlayoffByTournamentId = require("./postPlayoffByTournamentId")
const postPlayoffUpdateByTournamentId = require("./postPlayoffUpdateByTournamentId")
const getPlayoffMatchesByTournamentId = require("./getPlayoffMatchesByTournamentId")
const getPlayoffsBracketByTournamentId = require("./getPlayoffsBracketByTournamentId")
const getPlayoffsPlayerInfoByTournamentId = require("./getPlayoffsPlayerInfoByTournamentId")
const getPlayoffsTableByTournamentId = require("./getPlayoffsTableByTournamentId")
const getPlayoffsUpdatedWinsByTournamentId = require("./getPlayoffsUpdatedWinsByTournamentId")
const getStandingsPlayerInfoByTournamentId = require("./getStandingsPlayerInfoByTournamentId")
const getStandingsTableByTournamentId = require("./getStandingsTableByTournamentId")
const getStatistics = require("./getStatistics")
const getStreaks = require("./getStreaks")
const getTeamInformationByTournamentId = require("./getTeamInformationByTournamentId")
const getTournamentById = require("./getTournamentById")
const getTournaments = require("./getTournaments")
const getUserProfile = require("./getUserProfile")
const getUsers = require("./getUsers")
const getWorldCupPlayoffMatchesByTournamentId = require("./getWorldCupPlayoffMatchesByTournamentId")
const getWorldCupPlayoffTeamsByTournamentId = require("./getWorldCupPlayoffTeamsByTournamentId")
const getWorldCupStandingsByTournamentId = require("./getWorldCupStandingsByTournamentId")
const postLogin = require("./postLogin")
const majorUpdatesController = require("./majorUpdatesController")
const postMatch = require("./postMatch")
const postMatchByTournamentId = require("./postMatchByTournamentId")
const postRegister = require("./postRegister")
const postTournaments = require("./postTournaments")
const postWorldCupMatchesByTournamentId = require("./postWorldCupMatchesByTournamentId")
const putMatchByTournamentId = require("./putMatchByTournamentId")
const putRemoveMatchByTournamentId = require("./putRemoveMatchByTournamentId")

module.exports = {
    getAllTimeFaceToFace,
    getAllTimeGeneralStatistics,
    getAllTimeStandings,
    getHome,
    getIsUserAuthenticated,
    getLogout,
    getMatches,
    getFixtureByTournamentId,
    postFixtureByTournamentId,
    getPlayersByTournamentId,
    postPlayinByTournamentId,
    postPlayinUpdateByTournamentId,
    getPlayinMatchesByTournamentId,
    postPlayoffByTournamentId,
    postPlayoffUpdateByTournamentId,
    getPlayoffMatchesByTournamentId,
    getPlayoffsBracketByTournamentId,
    getPlayoffsPlayerInfoByTournamentId,
    getPlayoffsTableByTournamentId,
    getPlayoffsUpdatedWinsByTournamentId,
    getStandingsPlayerInfoByTournamentId,
    getStandingsTableByTournamentId,
    getStatistics,
    getStreaks,
    getTeamInformationByTournamentId,
    getTournamentById,
    getTournaments,
    getUserProfile,
    getUsers,
    getWorldCupPlayoffMatchesByTournamentId,
    getWorldCupPlayoffTeamsByTournamentId,
    getWorldCupStandingsByTournamentId,
    majorUpdatesController,
    postLogin,
    postMatch,
    postMatchByTournamentId,
    postRegister,
    postTournaments,
    postWorldCupMatchesByTournamentId,
    putMatchByTournamentId,
    putRemoveMatchByTournamentId,
}

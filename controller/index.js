const getAllTimeFaceToFace = require("./getAllTimeFaceToFace")
const getAllTimeGeneralStatistics = require("./getAllTimeGeneralStatistics")
const getAllTimeStandings = require("./getAllTimeStandings")
const getHome = require("./getHome")
const getIsUserAuthenticated = require("./getIsUserAuthenticated")
const getMatches = require("./getMatches")
const getMatchesByTournamentId = require("./getMatchesByTournamentId")
const getPlayersByTournamentId = require("./getPlayersByTournamentId")
const getPlayoffsBracketByTournamentId = require("./getPlayoffsBracketByTournamentId")
const getPlayoffsPlayerInfoByTournamentId = require("./getPlayoffsPlayerInfoByTournamentId")
const getPlayoffsTableByTournamentId = require("./getPlayoffsTableByTournamentId")
const getPlayoffsUpdatedWinsByTournamentId = require("./getPlayoffsUpdatedWinsByTournamentId")
const getStandingsPlayerInfoByTournamentId = require("./getStandingsPlayerInfoByTournamentId")
const getStandingsTableByTournamentId = require("./getStandingsTableByTournamentId")
const getStatistics = require("./getStatistics")
const getStreaks = require("./getStreaks")
const getTournamentById = require("./getTournamentById")
const getTournaments = require("./getTournaments")
const getUsers = require("./getUsers")
const getWorldCupPlayoffMatchesByTournamentId = require("./getWorldCupPlayoffMatchesByTournamentId")
const getWorldCupPlayoffTeamsByTournamentId = require("./getWorldCupPlayoffTeamsByTournamentId")
const getWorldCupStandingsByTournamentId = require("./getWorldCupStandingsByTournamentId")
const postLogin = require("./postLogin")
const postLogout = require("./postLogout")
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
    getMatches,
    getMatchesByTournamentId,
    getPlayersByTournamentId,
    getPlayoffsBracketByTournamentId,
    getPlayoffsPlayerInfoByTournamentId,
    getPlayoffsTableByTournamentId,
    getPlayoffsUpdatedWinsByTournamentId,
    getStandingsPlayerInfoByTournamentId,
    getStandingsTableByTournamentId,
    getStatistics,
    getStreaks,
    getTournamentById,
    getTournaments,
    getUsers,
    getWorldCupPlayoffMatchesByTournamentId,
    getWorldCupPlayoffTeamsByTournamentId,
    getWorldCupStandingsByTournamentId,
    postLogin,
    postLogout,
    postMatch,
    postMatchByTournamentId,
    postRegister,
    postTournaments,
    postWorldCupMatchesByTournamentId,
    putMatchByTournamentId,
    putRemoveMatchByTournamentId,
}

const getAllTimeFaceToFace = require("./getAllTimeFaceToFace")
const getAllTimeTeams = require("./getAllTimeTeams")
const getCalculatorByTournamentId = require("./getCalculatorByTournamentId")
const getFixtureByTournamentId = require("./getFixtureByTournamentId")
const getMatches = require("./getMatches")
const putCompleteTournamentById = require("./putCompleteTournamentById")
const getPlayerInfoByTournamentId = require("./getPlayerInfoByTournamentId")
const getPlayinMatchesByTournamentId = require("./getPlayinMatchesByTournamentId")
const getPlayoffMatchesByTournamentId = require("./getPlayoffMatchesByTournamentId")
const getPlayoffsPreviewByTournamentId = require("./getPlayoffsPreviewByTournamentId")
const getPlayoffsTableByTournamentId = require("./getPlayoffsTableByTournamentId")
const getStandingsTableByTournamentId = require("./getStandingsTableByTournamentId")
const getStatistics = require("./getStatistics")
const getTournamentById = require("./getTournamentById")
const getTournamentImages = require("./getTournamentImages")
const getTournamentSummaryByTournamentId = require("./getTournamentSummaryByTournamentId")
const getTournaments = require("./getTournaments")
const getUsers = require("./getUsers")
const getCurrentUser = require("./getCurrentUser")
const postFixtureByTournamentId = require("./postFixtureByTournamentId")
const postLogin = require("./postLogin")
const postPlayinByTournamentId = require("./postPlayinByTournamentId")
const postPlayinUpdateByTournamentId = require("./postPlayinUpdateByTournamentId")
const postPlayoffByTournamentId = require("./postPlayoffByTournamentId")
const postPlayoffUpdateByTournamentId = require("./postPlayoffUpdateByTournamentId")
const postTournaments = require("./postTournaments")
const putMatchByTournamentId = require("./putMatchByTournamentId")
const putRemoveMatchByTournamentId = require("./putRemoveMatchByTournamentId")
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
    getPlayinMatchesByTournamentId,
    getPlayoffMatchesByTournamentId,
    getPlayoffsPreviewByTournamentId,
    getPlayoffsTableByTournamentId,
    getStandingsTableByTournamentId,
    getStatistics,
    getTournamentById,
    getTournamentImages,
    getTournamentSummaryByTournamentId,
    getTournaments,
    getUsers,
    getCurrentUser,
    postFixtureByTournamentId,
    postLogin,
    postPlayinByTournamentId,
    postPlayinUpdateByTournamentId,
    postPlayoffByTournamentId,
    postPlayoffUpdateByTournamentId,
    postTournaments,
    putMatchByTournamentId,
    putRemoveMatchByTournamentId,
    postEdits,
    postEditsUpload,
    getEdits,
    deleteEdit,
    putCompleteTournamentById,
}

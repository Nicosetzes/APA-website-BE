const getAllTimeFaceToFace = require("./getAllTimeFaceToFace")
const getAssistantChampions = require("./getAssistantChampions")
const getAssistantHeadToHead = require("./getAssistantHeadToHead")
const getAssistantPendingMatches = require("./getAssistantPendingMatches")
const getAssistantRecentMatches = require("./getAssistantRecentMatches")
const getAssistantStandings = require("./getAssistantStandings")
const getAllTimeTeams = require("./getAllTimeTeams")
const getHeadToHeadDetail = require("./getHeadToHeadDetail")
const getHeadToHeadSummary = require("./getHeadToHeadSummary")
const getCalculatorByTournamentId = require("./getCalculatorByTournamentId")
const getFixtureByTournamentId = require("./getFixtureByTournamentId")
const getMatches = require("./getMatches")
const getMatchTeams = require("./getMatchTeams")
const putCompleteTournamentById = require("./putCompleteTournamentById")
const getPlayerInfoByTournamentId = require("./getPlayerInfoByTournamentId")
const getPlayinMatchesByTournamentId = require("./getPlayinMatchesByTournamentId")
const getPlayoffMatchesByTournamentId = require("./getPlayoffMatchesByTournamentId")
const getPlayoffsPreviewByTournamentId = require("./getPlayoffsPreviewByTournamentId")
const getPlayoffsTableByTournamentId = require("./getPlayoffsTableByTournamentId")
const getStandingsTableByTournamentId = require("./getStandingsTableByTournamentId")
const getStatistics = require("./getStatistics")
const getPlayerStatistics = require("./getPlayerStatistics")
const getStatisticsLeaderboards = require("./getStatisticsLeaderboards")
const getStatisticsRecords = require("./getStatisticsRecords")
const getTournamentById = require("./getTournamentById")
const getTournamentRecap = require("./getTournamentRecap")
const getTournamentRecapContext = require("./getTournamentRecapContext")
const getTournamentRecapsPending = require("./getTournamentRecapsPending")
const getTournamentImages = require("./getTournamentImages")
const getTournamentSummaryByTournamentId = require("./getTournamentSummaryByTournamentId")
const getTournaments = require("./getTournaments")
const getUsers = require("./getUsers")
const getCurrentUser = require("./getCurrentUser")
const postFixtureByTournamentId = require("./postFixtureByTournamentId")
const postLogin = require("./postLogin")
const postPlayinByTournamentId = require("./postPlayinByTournamentId")
const postPlayoffByTournamentId = require("./postPlayoffByTournamentId")
const postTournamentRecap = require("./postTournamentRecap")
const postTournaments = require("./postTournaments")
const putMatchByTournamentId = require("./putMatchByTournamentId")
const putRemoveMatchByTournamentId = require("./putRemoveMatchByTournamentId")
const { postEdits, postEditsUpload } = require("./postEdits")
const getEdits = require("./getEdits")
const deleteEdit = require("./deleteEdit")
const postRecaps = require("./postRecaps")
const getRecap = require("./getRecap")
const getRecapDates = require("./getRecapDates")
const getRecapContext = require("./getRecapContext")
const getRatings = require("./getRatings")
const getRatingsPeriod = require("./getRatingsPeriod")
const getRatingsHistory = require("./getRatingsHistory")
const getRatingsRecentForm = require("./getRatingsRecentForm")
const getRatingsReigns = require("./getRatingsReigns")
const getRatingsTournaments = require("./getRatingsTournaments")
const getRatingsUpsets = require("./getRatingsUpsets")

module.exports = {
    getAllTimeFaceToFace,
    getAssistantChampions,
    getAssistantHeadToHead,
    getAssistantPendingMatches,
    getAssistantRecentMatches,
    getAssistantStandings,
    getAllTimeTeams,
    getHeadToHeadDetail,
    getHeadToHeadSummary,
    getCalculatorByTournamentId,
    getFixtureByTournamentId,
    getMatches,
    getMatchTeams,
    getPlayerInfoByTournamentId,
    getPlayinMatchesByTournamentId,
    getPlayoffMatchesByTournamentId,
    getPlayoffsPreviewByTournamentId,
    getPlayoffsTableByTournamentId,
    getStandingsTableByTournamentId,
    getStatistics,
    getPlayerStatistics,
    getStatisticsLeaderboards,
    getStatisticsRecords,
    getTournamentById,
    getTournamentRecap,
    getTournamentRecapContext,
    getTournamentRecapsPending,
    getTournamentImages,
    getTournamentSummaryByTournamentId,
    getTournaments,
    getUsers,
    getCurrentUser,
    postFixtureByTournamentId,
    postLogin,
    postPlayinByTournamentId,
    postPlayoffByTournamentId,
    postTournamentRecap,
    postTournaments,
    putMatchByTournamentId,
    putRemoveMatchByTournamentId,
    postEdits,
    postEditsUpload,
    getEdits,
    deleteEdit,
    postRecaps,
    getRecap,
    getRecapDates,
    getRecapContext,
    getRatings,
    getRatingsPeriod,
    getRatingsHistory,
    getRatingsRecentForm,
    getRatingsReigns,
    getRatingsTournaments,
    getRatingsUpsets,
    putCompleteTournamentById,
}

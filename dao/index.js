const claimPlayoffSeriesRevision = require("./claimPlayoffSeriesRevision")
const createFixtureByTournamentId = require("./createFixtureByTournamentId")
const createPlayinByTournamentId = require("./createPlayinByTournamentId")
const createPlayoffByTournamentId = require("./createPlayoffByTournamentId")
const createTournament = require("./createTournament")
const deletePendingPlayoffTiebreak = require("./deletePendingPlayoffTiebreak")
const existsMatchByTournamentId = require("./existsMatchByTournamentId")
const findAllMatches = require("./findAllMatches")
const findAllNotPlayedMatchesByTournamentId = require("./findAllNotPlayedMatchesByTournamentId")
const findAllPlayedMatchesByTournamentId = require("./findAllPlayedMatchesByTournamentId")
const findAllUsers = require("./findAllUsers")
const findMatches = require("./findMatches")
const findMatchesPlayedOnDate = require("./findMatchesPlayedOnDate")
const findMatchTeams = require("./findMatchTeams")
const findFinishedTournamentsForRecap = require("./findFinishedTournamentsForRecap")
const findFixtureByTournamentId = require("./findFixtureByTournamentId")
const findHeadToHeadMatchesForAssistant = require("./findHeadToHeadMatchesForAssistant")
const findPendingMatchesForAssistant = require("./findPendingMatchesForAssistant")
const findPlayerMatchesByTournamentId = require("./findPlayerMatchesByTournamentId")
const findPlayerRatings = require("./findPlayerRatings")
const findPlayinMatchesByTournamentId = require("./findPlayinMatchesByTournamentId")
const findPlayoffMatchesByTournamentId = require("./findPlayoffMatchesByTournamentId")
const findPlayoffSeriesByTie = require("./findPlayoffSeriesByTie")
const findRankingPlayerRatings = require("./findRankingPlayerRatings")
const findRatingChangesByMatchIds = require("./findRatingChangesByMatchIds")
const findRatingEventsByMatchIds = require("./findRatingEventsByMatchIds")
const findRatingMatches = require("./findRatingMatches")
const findRatingSourceStats = require("./findRatingSourceStats")
const findTeamRemainingMatchesByTournamentId = require("./findTeamRemainingMatchesByTournamentId")
const findTournamentById = require("./findTournamentById")
const findTournamentIdsPlayedOnDate = require("./findTournamentIdsPlayedOnDate")
const findTournamentIdsWithPlayedMatches = require("./findTournamentIdsWithPlayedMatches")
const findTournamentMatchesForRecap = require("./findTournamentMatchesForRecap")
const findTournamentPlayersByTournamentId = require("./findTournamentPlayersByTournamentId")
const findTournamentRecapIds = require("./findTournamentRecapIds")
const findTournaments = require("./findTournaments")
const findTournamentsForAssistant = require("./findTournamentsForAssistant")
const findTournamentsForStatistics = require("./findTournamentsForStatistics")
const findUserByUserName = require("./findUserByUserName")
const recomputeTournamentStartedAt = require("./recomputeTournamentStartedAt")
const sortMatchesFromTournamentById = require("./sortMatchesFromTournamentById")
const updateMatchResult = require("./updateMatchResult")
const updateMatchResultToRemoveIt = require("./updateMatchResultToRemoveIt")
const updatePlayinMatchTeams = require("./updatePlayinMatchTeams")
const updatePlayoffMatchTeams = require("./updatePlayoffMatchTeams")
const updateTournamentOutcome = require("./updateTournamentOutcome")
const updateTournamentStartedAt = require("./updateTournamentStartedAt")
const updatePlayoffSeriesMatchResult = require("./updatePlayoffSeriesMatchResult")
const updatePlayoffSeriesSlots = require("./updatePlayoffSeriesSlots")

module.exports = {
    claimPlayoffSeriesRevision,
    createFixtureByTournamentId,
    createPlayinByTournamentId,
    createPlayoffByTournamentId,
    createTournament,
    deletePendingPlayoffTiebreak,
    existsMatchByTournamentId,
    findAllMatches,
    findAllNotPlayedMatchesByTournamentId,
    findAllPlayedMatchesByTournamentId,
    findAllUsers,
    findMatches,
    findMatchesPlayedOnDate,
    findMatchTeams,
    findFinishedTournamentsForRecap,
    findFixtureByTournamentId,
    findHeadToHeadMatchesForAssistant,
    findPendingMatchesForAssistant,
    findPlayerMatchesByTournamentId,
    findPlayerRatings,
    findPlayinMatchesByTournamentId,
    findPlayoffMatchesByTournamentId,
    findPlayoffSeriesByTie,
    findRankingPlayerRatings,
    findRatingChangesByMatchIds,
    findRatingEventsByMatchIds,
    findRatingMatches,
    findRatingSourceStats,
    findTeamRemainingMatchesByTournamentId,
    findTournamentById,
    findTournamentIdsPlayedOnDate,
    findTournamentIdsWithPlayedMatches,
    findTournamentMatchesForRecap,
    findTournamentPlayersByTournamentId,
    findTournamentRecapIds,
    findTournaments,
    findTournamentsForAssistant,
    findTournamentsForStatistics,
    findUserByUserName,
    recomputeTournamentStartedAt,
    sortMatchesFromTournamentById,
    updateMatchResult,
    updateMatchResultToRemoveIt,
    updatePlayinMatchTeams,
    updatePlayoffSeriesMatchResult,
    updatePlayoffSeriesSlots,
    updatePlayoffMatchTeams,
    updateTournamentOutcome,
    updateTournamentStartedAt,
}

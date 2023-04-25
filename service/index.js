// const modifyManyMatches = require("./modifyManyMatches")
const modifyMatchResult = require("./modifyMatchResult")
const modifyMatchResultToRemoveIt = require("./modifyMatchResultToRemoveIt")
const orderMatchesFromTournamentById = require("./orderMatchesFromTournamentById")
const orderPlayoffMatchesFromTournamentById = require("./orderPlayoffMatchesFromTournamentById")
const originateManyMatches = require("./originateManyMatches")
const originateMatch = require("./originateMatch")
const originateTournament = require("./originateTournament")
const originateUser = require("./originateUser")
const retrieveAllUsers = require("./retrieveAllUsers")
const retrieveAllMatches = require("./retrieveAllMatches")
const retrieveAllMatchesByTournamentId = require("./retrieveAllMatchesByTournamentId")
const retrieveAllMatchesByUserId = require("./retrieveAllMatchesByUserId")
const retrieveMatches = require("./retrieveMatches")
const retrieveMatchesByTeamName = require("./retrieveMatchesByTeamName")
const retrieveMatchesByTournamentId = require("./retrieveMatchesByTournamentId")
const retrieveFixtureByTournamentIds = require("./retrieveFixtureByTournamentIds")
const retrieveRecentMatchesFromPlayer = require("./retrieveRecentMatchesFromPlayer")
const retrieveTournamentById = require("./retrieveTournamentById")
const retrieveTournamentPlayersByTournamentId = require("./retrieveTournamentPlayersByTournamentId")
const retrieveTournaments = require("./retrieveTournaments")
// const retrieveTournamentTeamsByTournamentId = require("./retrieveTournamentTeamsByTournamentId")
const retrieveUserById = require("./retrieveUserById")
const retrieveUserByUserName = require("./retrieveUserByUserName")

module.exports = {
    // modifyManyMatches,
    modifyMatchResult,
    modifyMatchResultToRemoveIt,
    orderMatchesFromTournamentById,
    orderPlayoffMatchesFromTournamentById,
    originateManyMatches,
    originateMatch,
    originateTournament,
    originateUser,
    retrieveAllUsers,
    retrieveAllMatches,
    retrieveAllMatchesByTournamentId,
    retrieveAllMatchesByUserId,
    retrieveMatches,
    retrieveMatchesByTeamName,
    retrieveMatchesByTournamentId,
    retrieveFixtureByTournamentIds,
    retrieveRecentMatchesFromPlayer,
    retrieveTournamentById,
    retrieveTournamentPlayersByTournamentId,
    retrieveTournaments,
    // retrieveTournamentTeamsByTournamentId,
    retrieveUserById,
    retrieveUserByUserName,
}

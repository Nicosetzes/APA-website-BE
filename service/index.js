const modifyMatchResult = require("./modifyMatchResult")
const modifyMatchResultToRemoveIt = require("./modifyMatchResultToRemoveIt")
const orderMatchesFromTournamentById = require("./orderMatchesFromTournamentById")
const orderPlayoffMatchesFromTournamentById = require("./orderPlayoffMatchesFromTournamentById")
const originateManyMatches = require("./originateManyMatches")
const originateMatch = require("./originateMatch")
const originateTournament = require("./originateTournament")
const originateUser = require("./originateUser")
const retrieveAllUsers = require("./retrieveAllUsers")
const retrieveMatches = require("./retrieveMatches")
const retrieveMatchesByTeamName = require("./retrieveMatchesByTeamName")
const retrieveMatchesByTournamentIds = require("./retrieveMatchesByTournamentIds")
const retrieveRecentMatchesFromPlayer = require("./retrieveRecentMatchesFromPlayer")
const retrieveTournamentById = require("./retrieveTournamentById")
const retrieveTournamentPlayersByTournamentId = require("./retrieveTournamentPlayersByTournamentId")
const retrieveTournaments = require("./retrieveTournaments")
// const retrieveTournamentTeamsByTournamentId = require("./retrieveTournamentTeamsByTournamentId")
const retrieveUserById = require("./retrieveUserById")
const retrieveUserByUserName = require("./retrieveUserByUserName")

module.exports = {
    modifyMatchResult,
    modifyMatchResultToRemoveIt,
    orderMatchesFromTournamentById,
    orderPlayoffMatchesFromTournamentById,
    originateManyMatches,
    originateMatch,
    originateTournament,
    originateUser,
    retrieveAllUsers,
    retrieveMatches,
    retrieveMatchesByTeamName,
    retrieveMatchesByTournamentIds,
    retrieveRecentMatchesFromPlayer,
    retrieveTournamentById,
    retrieveTournamentPlayersByTournamentId,
    retrieveTournaments,
    // retrieveTournamentTeamsByTournamentId,
    retrieveUserById,
    retrieveUserByUserName,
}

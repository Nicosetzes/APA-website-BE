const countAllMatchesByTournamentId = require("./countAllMatchesByTournamentId")
const countMatchesFromPlayer = require("./countMatchesFromPlayer")
const countMatchLossesFromPlayer = require("./countMatchLossesFromPlayer")
const countMatchWinsFromPlayer = require("./countMatchWinsFromPlayer")
const createFixtureByTournamentId = require("./createFixtureByTournamentId")
const createManyMatches = require("./createManyMatches")
const createMatch = require("./createMatch")
const createPlayinByTournamentId = require("./createPlayinByTournamentId")
const createPlayoffByTournamentId = require("./createPlayoffByTournamentId")
const createTournament = require("./createTournament")
const createUser = require("./createUser")
const findAllMatches = require("./findAllMatches")
const findAllNotPlayedMatchesByTournamentId = require("./findAllNotPlayedMatchesByTournamentId")
const findAllPlayedMatchesByTournamentId = require("./findAllPlayedMatchesByTournamentId")
const findAllMatchesByUserId = require("./findAllMatchesByUserId")
const findAllUsers = require("./findAllUsers")
const findMatches = require("./findMatches")
const findMatchesByTeamName = require("./findMatchesByTeamName")
const findMatchesByTournamentId = require("./findMatchesByTournamentId")
const findFixtureByTournamentId = require("./findFixtureByTournamentId")
const findPlayinMatchesByTournamentId = require("./findPlayinMatchesByTournamentId")
const findPlayoffMatchesByTournamentId = require("./findPlayoffMatchesByTournamentId")
const findRecentMatchesFromPlayer = require("./findRecentMatchesFromPlayer")
const findTeamRemainingMatchesByTournamentId = require("./findTeamRemainingMatchesByTournamentId")
const findTournamentById = require("./findTournamentById")
const findTournamentPlayersByTournamentId = require("./findTournamentPlayersByTournamentId")
const findTournaments = require("./findTournaments")
// const findTournamentTeamsByTournamentId = require("./findTournamentTeamsByTournamentId")
const findUserById = require("./findUserById")
const findUserByUserName = require("./findUserByUserName")
const sortMatchesFromTournamentById = require("./sortMatchesFromTournamentById")
const sortPlayoffMatchesFromTournamentById = require("./sortPlayoffMatchesFromTournamentById")
const updateManyMatches = require("./updateManyMatches")
const updateMatchResult = require("./updateMatchResult")
const updateMatchResultToRemoveIt = require("./updateMatchResultToRemoveIt")
const updateSquad = require("./updateSquad")

module.exports = {
    countAllMatchesByTournamentId,
    countMatchesFromPlayer,
    countMatchLossesFromPlayer,
    countMatchWinsFromPlayer,
    createFixtureByTournamentId,
    createManyMatches,
    createMatch,
    createPlayinByTournamentId,
    createPlayoffByTournamentId,
    createTournament,
    createUser,
    findAllMatches,
    findAllNotPlayedMatchesByTournamentId,
    findAllPlayedMatchesByTournamentId,
    findAllMatchesByUserId,
    findAllUsers,
    findMatches,
    findMatchesByTeamName,
    findMatchesByTournamentId,
    findFixtureByTournamentId,
    findPlayinMatchesByTournamentId,
    findPlayoffMatchesByTournamentId,
    findRecentMatchesFromPlayer,
    findTeamRemainingMatchesByTournamentId,
    findTournamentById,
    findTournamentPlayersByTournamentId,
    findTournaments,
    // findTournamentTeamsByTournamentId,
    findUserById,
    findUserByUserName,
    sortMatchesFromTournamentById,
    sortPlayoffMatchesFromTournamentById,
    updateManyMatches,
    updateMatchResult,
    updateMatchResultToRemoveIt,
    updateSquad,
}

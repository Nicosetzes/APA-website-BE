const createFixtureByTournamentId = require("./createFixtureByTournamentId")
const createPlayinByTournamentId = require("./createPlayinByTournamentId")
const createPlayoffByTournamentId = require("./createPlayoffByTournamentId")
const createTournament = require("./createTournament")
const findAllMatches = require("./findAllMatches")
const findAllNotPlayedMatchesByTournamentId = require("./findAllNotPlayedMatchesByTournamentId")
const findAllPlayedMatchesByTournamentId = require("./findAllPlayedMatchesByTournamentId")
const findAllUsers = require("./findAllUsers")
const findMatches = require("./findMatches")
const findFixtureByTournamentId = require("./findFixtureByTournamentId")
const findPlayerMatchesByTournamentId = require("./findPlayerMatchesByTournamentId")
const findPlayinMatchesByTournamentId = require("./findPlayinMatchesByTournamentId")
const findPlayoffMatchesByTournamentId = require("./findPlayoffMatchesByTournamentId")
const findTeamRemainingMatchesByTournamentId = require("./findTeamRemainingMatchesByTournamentId")
const findTournamentById = require("./findTournamentById")
const findTournamentPlayersByTournamentId = require("./findTournamentPlayersByTournamentId")
const findTournaments = require("./findTournaments")
const findUserByUserName = require("./findUserByUserName")
const sortMatchesFromTournamentById = require("./sortMatchesFromTournamentById")
const updateMatchResult = require("./updateMatchResult")
const updateMatchResultToRemoveIt = require("./updateMatchResultToRemoveIt")
const updatePlayoffMatchTeams = require("./updatePlayoffMatchTeams")
const updateTournamentOutcome = require("./updateTournamentOutcome")

module.exports = {
    createFixtureByTournamentId,
    createPlayinByTournamentId,
    createPlayoffByTournamentId,
    createTournament,
    findAllMatches,
    findAllNotPlayedMatchesByTournamentId,
    findAllPlayedMatchesByTournamentId,
    findAllUsers,
    findMatches,
    findFixtureByTournamentId,
    findPlayerMatchesByTournamentId,
    findPlayinMatchesByTournamentId,
    findPlayoffMatchesByTournamentId,
    findTeamRemainingMatchesByTournamentId,
    findTournamentById,
    findTournamentPlayersByTournamentId,
    findTournaments,
    findUserByUserName,
    sortMatchesFromTournamentById,
    updateMatchResult,
    updateMatchResultToRemoveIt,
    updatePlayoffMatchTeams,
    updateTournamentOutcome,
}

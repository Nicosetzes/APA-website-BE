const dotenv = require("dotenv").config()

const express = require("express")

/* -------------------- ROUTER -------------------- */

const { Router } = express

// Defino todos los routers de la aplicación //

const root = Router()
const users = Router()
const tournaments = Router()
const statistics = Router()

root.use(express.json()) // Ya definí a nivel aplicación, revisar si es necesario //
users.use(express.json()) // Ya definí a nivel aplicación, revisar si es necesario //
tournaments.use(express.json()) // Ya definí a nivel aplicación, revisar si es necesario //
statistics.use(express.json()) // Ya definí a nivel aplicación, revisar si es necesario //

root.use(express.urlencoded({ extended: true })) // Ya definí a nivel aplicación, revisar si es necesario //
users.use(express.urlencoded({ extended: true })) // Ya definí a nivel aplicación, revisar si es necesario //
tournaments.use(express.urlencoded({ extended: true })) // Ya definí a nivel aplicación, revisar si es necesario //
statistics.use(express.urlencoded({ extended: true })) // Ya definí a nivel aplicación, revisar si es necesario //

/* -------------------- API -------------------- */

const {
    getHome,
    getMatches,
    postMatch,
    getStreaks,
    getUsers,
    getUserProfile,
    postRegister,
    postLogin,
    postLogout,
    postSolicitateNewPassword,
    postRetrievePassword,
    getIsUserAuthenticated,
    getTournaments,
    postTournaments,
    getTournamentById,
    getCalculatorByTournamentId,
    getPlayersByTournamentId,
    getPlayerInfoByTournamentId,
    postPlayinByTournamentId,
    postPlayinUpdateByTournamentId,
    getPlayinMatchesByTournamentId,
    postPlayoffByTournamentId,
    postPlayoffUpdateByTournamentId,
    getPlayoffMatchesByTournamentId,
    getTeamsByTournamentId,
    getTeamInformationByTournamentId,
    getSquadByTeamId,
    putSquadByTeamId,
    getFixtureByTournamentId,
    postFixtureByTournamentId,
    postMatchByTournamentId,
    postTagTeamsMatchByTournamentId,
    putMatchByTournamentId,
    putTagTeamsMatchByTournamentId,
    putRemoveMatchByTournamentId,
    getStandingsTableByTournamentId,
    getTagTeamsStandingsTableByTournamentId,
    getStandingsPlayerInfoByTournamentId,
    getPlayoffsTableByTournamentId,
    getPlayoffsPlayerInfoByTournamentId,
    getPlayoffsBracketByTournamentId,
    getPlayoffsUpdatedWinsByTournamentId,
    getStatistics,
    getAllTimeStandings,
    // getAllTimeGeneralStatistics,
    getAllTimeFaceToFace,
    getAllTimeTeams,
    majorUpdatesController,
} = require("./../controller")

/* -------------------- isAUTH -------------------- */

const { isAuth } = require("./auth")

// ROOT

root.get("/", getHome)

root.get("/matches", getMatches)

root.post("/matches", postMatch) // Provisoria, luego puede ser modificada //

root.get("/update", majorUpdatesController)

root.get("/streaks", getStreaks)

// USERS

users.get("/", getUsers)

users.get("/profile", isAuth, getUserProfile)

users.post("/register", postRegister)

users.post("/login", postLogin)

users.post("/logout", isAuth, postLogout)

users.post("/solicitate-password", postSolicitateNewPassword)

users.post("/retrieve-password", postRetrievePassword)

users.get("/isUserAuthenticated", getIsUserAuthenticated)

// TOURNAMENTS

tournaments.get("/", getTournaments)

tournaments.post("/", isAuth, postTournaments)

tournaments.get("/:tournament", getTournamentById)

tournaments.get("/:tournament/calculator", getCalculatorByTournamentId)

tournaments.get("/:tournament/fixture", getFixtureByTournamentId)

tournaments.post("/:tournament/fixture", isAuth, postFixtureByTournamentId)

tournaments.get("/:tournament/players", getPlayersByTournamentId)

tournaments.get("/:tournament/players/:player", getPlayerInfoByTournamentId)

tournaments.post("/:tournament/playin", isAuth, postPlayinByTournamentId)

tournaments.post(
    "/:tournament/playin/update",
    isAuth,
    postPlayinUpdateByTournamentId
)

tournaments.get("/:tournament/playin/matches", getPlayinMatchesByTournamentId)

tournaments.post("/:tournament/playoff", isAuth, postPlayoffByTournamentId)

tournaments.post(
    "/:tournament/playoff/update",
    isAuth,
    postPlayoffUpdateByTournamentId
)

tournaments.get("/:tournament/playoff/matches", getPlayoffMatchesByTournamentId)

tournaments.get("/:tournament/teams", getTeamsByTournamentId)

tournaments.get("/:tournament/teams/:team", getTeamInformationByTournamentId)

tournaments.get("/:tournament/teams/:team/squad", getSquadByTeamId)

tournaments.put("/:tournament/teams/:team/squad", isAuth, putSquadByTeamId)

// tournaments.get("/:tournament/matches/create-game/", getOriginateGameController)
tournaments.post(
    "/:tournament/matches/create-game/",
    isAuth,
    postMatchByTournamentId
)

tournaments.post(
    "/:tournament/matches/create-tag-teams-match/",
    isAuth,
    postTagTeamsMatchByTournamentId
)

tournaments.put(
    "/:tournament/matches/update-game/:match",
    isAuth,
    putMatchByTournamentId
)

tournaments.put(
    "/:tournament/matches/update-tag-teams-match/:match",
    isAuth,
    putTagTeamsMatchByTournamentId
)

tournaments.put(
    "/:tournament/matches/delete-game/:match",
    isAuth,
    putRemoveMatchByTournamentId
)

tournaments.get("/:tournament/standings/table", getStandingsTableByTournamentId)

tournaments.get(
    "/:tournament/tag-teams-standings/table",
    getTagTeamsStandingsTableByTournamentId
)

tournaments.get(
    "/:tournament/standings/player-info",
    getStandingsPlayerInfoByTournamentId
)

tournaments.get("/:tournament/playoffs/table", getPlayoffsTableByTournamentId)

tournaments.get(
    "/:tournament/playoffs/player-info",
    getPlayoffsPlayerInfoByTournamentId
)

tournaments.get(
    "/:tournament/playoffs/bracket",
    getPlayoffsBracketByTournamentId
)

tournaments.get(
    "/:tournament/playoffs/updated-wins",
    getPlayoffsUpdatedWinsByTournamentId
)

// STATISTICS

statistics.get("/", getStatistics)

statistics.get("/all-time/standings", getAllTimeStandings)

// statistics.get("/all-time/general-stats", getAllTimeGeneralStatistics)

statistics.get("/all-time/face-to-face", getAllTimeFaceToFace)

statistics.get("/all-time/teams", getAllTimeTeams)

module.exports = {
    root,
    users,
    tournaments,
    statistics,
}

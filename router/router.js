const express = require("express")

const { Router } = express

const root = Router()
const users = Router()
const tournaments = Router()
const statistics = Router()
const summary = Router()

const asyncHandler = require("../utils/asyncHandler")
const rawControllers = require("../controller")
const controllers = Object.fromEntries(
    Object.entries(rawControllers).map(([name, value]) => [
        name,
        typeof value === "function" ? asyncHandler(value) : value,
    ])
)

const {
    getMatches,
    postMatch,
    getUsers,
    getCurrentUser,
    postLogin,
    postLogout,
    getTournaments,
    getTournamentImages,
    postTournaments,
    getTournamentById,
    getTournamentSummaryByTournamentId,
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
    getSquadByTeamId,
    putSquadByTeamId,
    getFixtureByTournamentId,
    postFixtureByTournamentId,
    postMatchByTournamentId,
    putMatchByTournamentId,
    putRemoveMatchByTournamentId,
    getStandingsTableByTournamentId,
    getStandingsPlayerInfoByTournamentId,
    getPlayoffsTableByTournamentId,
    getPlayoffsPlayerInfoByTournamentId,
    getPlayoffsPreviewByTournamentId,
    getPlayoffsBracketByTournamentId,
    getPlayoffsUpdatedWinsByTournamentId,
    getStatistics,
    getAllTimeFaceToFace,
    getAllTimeTeams,
    postDailyRecapByTournamentId,
    getDailyRecapByTournamentId,
    getMatchesSummaryByDate,
    getStandingsSummaryByTournamentId,
    getPlayerStatsSummaryByTournamentId,
    postEdits,
    postEditsUpload,
    getEdits,
    deleteEdit,
    putCompleteTournamentById,
} = controllers

const validateRequest = require("../middleware/validateRequest")
const validateMatchResult = require("../middleware/validateMatchResult")
const {
    editUploadRateLimit,
    loginRateLimit,
} = require("../middleware/rateLimits")
const requestSchemas = require("../validation/requestSchemas")
const validate = (schemaName) => validateRequest(requestSchemas[schemaName])

const {
    isAuth,
    requireTournamentAccess,
    requireMatchInTournament,
    requireEditOwnership,
} = require("./auth")

root.get("/matches", validate("getMatches"), getMatches)

root.post(
    "/matches",
    isAuth,
    validate("postMatch"),
    requireTournamentAccess(
        (req) => req.body?.tournament?.id ?? req.body?.tournament
    ),
    postMatch
)

root.get("/edits", isAuth, validate("getEdits"), getEdits)

root.post(
    "/edits",
    isAuth,
    editUploadRateLimit,
    postEditsUpload.array("image", 10),
    postEdits
)

root.delete(
    "/edits/:id",
    isAuth,
    validate("deleteEdit"),
    requireEditOwnership,
    deleteEdit
)

users.get("/me", isAuth, getCurrentUser)

users.get("/", validate("getUsers"), getUsers)

users.post("/login", loginRateLimit, validate("login"), postLogin)

users.post("/logout", isAuth, validate("logout"), postLogout)

tournaments.get("/", validate("getTournaments"), getTournaments)

tournaments.get("/images", validate("getTournamentImages"), getTournamentImages)

tournaments.post("/", isAuth, validate("createTournament"), postTournaments)

tournaments.get(
    "/:tournament",
    validate("getTournamentResource"),
    getTournamentById
)

tournaments.get(
    "/:tournament/summary",
    validate("getTournamentResource"),
    getTournamentSummaryByTournamentId
)

tournaments.get(
    "/:tournament/calculator",
    validate("getCalculator"),
    getCalculatorByTournamentId
)

tournaments.get(
    "/:tournament/fixture",
    validate("getFixture"),
    getFixtureByTournamentId
)

tournaments.post(
    "/:tournament/fixture",
    isAuth,
    validate("fixture"),
    requireTournamentAccess(),
    postFixtureByTournamentId
)

tournaments.get("/:tournament/players", getPlayersByTournamentId)

tournaments.get(
    "/:tournament/players/info",
    validate("getPlayerInfo"),
    getPlayerInfoByTournamentId
)

tournaments.post(
    "/:tournament/playin",
    isAuth,
    validate("playin"),
    requireTournamentAccess(),
    postPlayinByTournamentId
)

tournaments.post(
    "/:tournament/playin/update",
    isAuth,
    validate("playinUpdate"),
    requireTournamentAccess(),
    postPlayinUpdateByTournamentId
)

tournaments.put(
    "/:tournament/complete",
    isAuth,
    validate("completeTournament"),
    requireTournamentAccess(),
    putCompleteTournamentById
)

tournaments.get(
    "/:tournament/playin/matches",
    validate("getPlayin"),
    getPlayinMatchesByTournamentId
)

tournaments.post(
    "/:tournament/playoff",
    isAuth,
    validate("createPlayoff"),
    requireTournamentAccess(),
    postPlayoffByTournamentId
)

tournaments.post(
    "/:tournament/playoff/update",
    isAuth,
    validate("updatePlayoff"),
    requireTournamentAccess(),
    postPlayoffUpdateByTournamentId
)

tournaments.get(
    "/:tournament/playoff/matches",
    validate("getPlayoff"),
    getPlayoffMatchesByTournamentId
)

tournaments.get("/:tournament/teams", getTeamsByTournamentId)

tournaments.get("/:tournament/teams/:team/squad", getSquadByTeamId)

tournaments.put(
    "/:tournament/teams/:team/squad",
    isAuth,
    validate("updateSquad"),
    requireTournamentAccess(),
    putSquadByTeamId
)

tournaments.post(
    "/:tournament/matches/create-game/",
    isAuth,
    validate("createMatch"),
    requireTournamentAccess(),
    postMatchByTournamentId
)

tournaments.put(
    "/:tournament/matches/update-game/:match",
    isAuth,
    validate("updateMatch"),
    requireTournamentAccess(),
    requireMatchInTournament,
    validateMatchResult,
    putMatchByTournamentId
)

// DAILY RECAP
// POST: create/update recap for a date
tournaments.post(
    "/:tournament/daily-recap",
    isAuth,
    validate("dailyRecap"),
    requireTournamentAccess(),
    postDailyRecapByTournamentId
)

// GET: retrieve recap for a specific date (?date=YYYY-MM-DD) or latest if omitted
tournaments.get(
    "/:tournament/daily-recap",
    validate("getDailyRecap"),
    getDailyRecapByTournamentId
)

tournaments.put(
    "/:tournament/matches/delete-game/:match",
    isAuth,
    validate("removeMatch"),
    requireTournamentAccess(),
    requireMatchInTournament,
    putRemoveMatchByTournamentId
)

tournaments.get(
    "/:tournament/standings/table",
    validate("getStandingsTable"),
    getStandingsTableByTournamentId
)

tournaments.get(
    "/:tournament/standings/player-info",
    getStandingsPlayerInfoByTournamentId
)

tournaments.get(
    "/:tournament/playoffs/table",
    validate("getTournamentResource"),
    getPlayoffsTableByTournamentId
)

tournaments.get(
    "/:tournament/playoffs/player-info",
    getPlayoffsPlayerInfoByTournamentId
)

tournaments.get(
    "/:tournament/playoffs/preview",
    validate("getTournamentResource"),
    getPlayoffsPreviewByTournamentId
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

statistics.get("/", validate("getStatistics"), getStatistics)

statistics.get(
    "/all-time/face-to-face",
    validate("getAllTimeStatistics"),
    getAllTimeFaceToFace
)

statistics.get(
    "/all-time/teams",
    validate("getAllTimeStatistics"),
    getAllTimeTeams
)

// SUMMARY
summary.get("/matches", getMatchesSummaryByDate)
summary.get(
    "/tournaments/:tournament/standings",
    getStandingsSummaryByTournamentId
)

summary.get(
    "/tournaments/:tournament/player-stats",
    getPlayerStatsSummaryByTournamentId
)

module.exports = {
    root,
    users,
    tournaments,
    statistics,
    summary,
}

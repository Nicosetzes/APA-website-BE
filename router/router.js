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
const requestSchemas = require("../validation/requestSchemas")
const validate = (schemaName) => validateRequest(requestSchemas[schemaName])

const {
    isAuth,
    requireTournamentAccess,
    requireMatchInTournament,
    requireEditOwnership,
} = require("./auth")

root.get("/matches", getMatches)

root.post(
    "/matches",
    isAuth,
    validate("postMatch"),
    requireTournamentAccess(
        (req) => req.body?.tournament?.id ?? req.body?.tournament
    ),
    postMatch
)

root.get("/edits", getEdits)

root.post("/edits", isAuth, postEditsUpload.array("image", 10), postEdits)

root.delete(
    "/edits/:id",
    isAuth,
    validate("deleteEdit"),
    requireEditOwnership,
    deleteEdit
)

users.get("/me", isAuth, getCurrentUser)

users.get("/", getUsers)

users.post("/login", validate("login"), postLogin)

users.post("/logout", isAuth, validate("logout"), postLogout)

tournaments.get("/", getTournaments)

tournaments.get("/images", getTournamentImages)

tournaments.post("/", isAuth, validate("createTournament"), postTournaments)

tournaments.get("/:tournament", getTournamentById)

tournaments.get("/:tournament/summary", getTournamentSummaryByTournamentId)

tournaments.get("/:tournament/calculator", getCalculatorByTournamentId)

tournaments.get("/:tournament/fixture", getFixtureByTournamentId)

tournaments.post(
    "/:tournament/fixture",
    isAuth,
    validate("fixture"),
    requireTournamentAccess(),
    postFixtureByTournamentId
)

tournaments.get("/:tournament/players", getPlayersByTournamentId)

tournaments.get("/:tournament/players/info", getPlayerInfoByTournamentId)

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

tournaments.get("/:tournament/playin/matches", getPlayinMatchesByTournamentId)

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

tournaments.get("/:tournament/playoff/matches", getPlayoffMatchesByTournamentId)

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
tournaments.get("/:tournament/daily-recap", getDailyRecapByTournamentId)

tournaments.put(
    "/:tournament/matches/delete-game/:match",
    isAuth,
    validate("removeMatch"),
    requireTournamentAccess(),
    requireMatchInTournament,
    putRemoveMatchByTournamentId
)

tournaments.get("/:tournament/standings/table", getStandingsTableByTournamentId)

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
    "/:tournament/playoffs/preview",
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

statistics.get("/", getStatistics)

statistics.get("/all-time/face-to-face", getAllTimeFaceToFace)

statistics.get("/all-time/teams", getAllTimeTeams)

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

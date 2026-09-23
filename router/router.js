const express = require("express")

const { Router } = express

const root = Router()
const users = Router()
const tournaments = Router()
const statistics = Router()

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
    getUsers,
    getCurrentUser,
    postLogin,
    getTournaments,
    getTournamentImages,
    postTournaments,
    getTournamentById,
    getTournamentSummaryByTournamentId,
    getCalculatorByTournamentId,
    getPlayerInfoByTournamentId,
    postPlayinByTournamentId,
    postPlayinUpdateByTournamentId,
    getPlayinMatchesByTournamentId,
    postPlayoffByTournamentId,
    postPlayoffUpdateByTournamentId,
    getPlayoffMatchesByTournamentId,
    getFixtureByTournamentId,
    postFixtureByTournamentId,
    putMatchByTournamentId,
    putRemoveMatchByTournamentId,
    getStandingsTableByTournamentId,
    getPlayoffsTableByTournamentId,
    getPlayoffsPreviewByTournamentId,
    getStatistics,
    getAllTimeFaceToFace,
    getAllTimeTeams,
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

tournaments.put(
    "/:tournament/matches/update-game/:match",
    isAuth,
    validate("updateMatch"),
    requireTournamentAccess(),
    requireMatchInTournament,
    validateMatchResult,
    putMatchByTournamentId
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
    "/:tournament/playoffs/table",
    validate("getTournamentResource"),
    getPlayoffsTableByTournamentId
)

tournaments.get(
    "/:tournament/playoffs/preview",
    validate("getTournamentResource"),
    getPlayoffsPreviewByTournamentId
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

module.exports = {
    root,
    users,
    tournaments,
    statistics,
}

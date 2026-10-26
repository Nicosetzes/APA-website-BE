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
    getMatchTeams,
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
    getPlayinMatchesByTournamentId,
    postPlayoffByTournamentId,
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
    getAssistantHeadToHead,
    getAssistantPendingMatches,
    getAssistantStandings,
    postEdits,
    postEditsUpload,
    getEdits,
    deleteEdit,
    postRecaps,
    getRecap,
    getRecapDates,
    getRecapContext,
    getTournamentRecap,
    getTournamentRecapContext,
    getTournamentRecapsPending,
    postTournamentRecap,
    getRatings,
    getRatingsPeriod,
    putCompleteTournamentById,
} = controllers

const validateRequest = require("../middleware/validateRequest")
const validateMatchResult = require("../middleware/validateMatchResult")
const requireRegularPhaseOpen = require("../middleware/requireRegularPhaseOpen")
const validateSeriesMutationRequest = require("../middleware/validateSeriesMutationRequest")
const requireRecapSecret = require("../middleware/requireRecapSecret")
const {
    editUploadRateLimit,
    loginRateLimit,
    recapRateLimit,
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

root.get("/matches/teams", validate("getMatchTeams"), getMatchTeams)

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

root.post(
    "/recaps",
    recapRateLimit,
    requireRecapSecret,
    validate("postRecap"),
    postRecaps
)

root.get(
    "/tournament-recaps/pending",
    recapRateLimit,
    requireRecapSecret,
    validate("getTournamentRecapsPending"),
    getTournamentRecapsPending
)

root.get(
    "/tournament-recaps/context",
    recapRateLimit,
    requireRecapSecret,
    validate("getTournamentRecapContext"),
    getTournamentRecapContext
)

root.post(
    "/tournament-recaps",
    recapRateLimit,
    requireRecapSecret,
    validate("postTournamentRecap"),
    postTournamentRecap
)

// Lecturas para el agente del chat (n8n). Solo lectura, mismo secreto que los
// recaps.
root.get(
    "/assistant/pending-matches",
    recapRateLimit,
    requireRecapSecret,
    validate("getAssistantPendingMatches"),
    getAssistantPendingMatches
)

root.get(
    "/assistant/head-to-head",
    recapRateLimit,
    requireRecapSecret,
    validate("getAssistantHeadToHead"),
    getAssistantHeadToHead
)

root.get(
    "/assistant/standings",
    recapRateLimit,
    requireRecapSecret,
    validate("getAssistantStandings"),
    getAssistantStandings
)

root.get("/ratings", validate("getRatings"), getRatings)

root.get("/ratings/period", validate("getRatingsPeriod"), getRatingsPeriod)

root.get("/recaps/dates", validate("getRecapDates"), getRecapDates)

root.get("/recaps/context", validate("getRecapContext"), getRecapContext)

root.get("/recaps/latest", validate("getLatestRecap"), getRecap)

root.get("/recaps/:date", validate("getRecapByDate"), getRecap)

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
    "/:tournament/recap",
    validate("getTournamentResource"),
    getTournamentRecap
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
    requireRegularPhaseOpen,
    validateMatchResult,
    putMatchByTournamentId
)

tournaments.put(
    "/:tournament/matches/delete-game/:match",
    isAuth,
    validate("removeMatch"),
    requireTournamentAccess(),
    requireMatchInTournament,
    requireRegularPhaseOpen,
    validateSeriesMutationRequest,
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

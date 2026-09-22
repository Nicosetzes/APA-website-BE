const dotenv = require("dotenv").config()

const express = require("express")

/* -------------------- ROUTER -------------------- */

const { Router } = express

// Defino todos los routers de la aplicación //

const root = Router()
const users = Router()
const tournaments = Router()
const statistics = Router()
const summary = Router()

root.use(express.json())
users.use(express.json())
tournaments.use(express.json())
statistics.use(express.json())
summary.use(express.json())

root.use(express.urlencoded({ extended: true }))
users.use(express.urlencoded({ extended: true }))
tournaments.use(express.urlencoded({ extended: true }))
statistics.use(express.urlencoded({ extended: true }))
summary.use(express.urlencoded({ extended: true }))

/* -------------------- API -------------------- */

const {
    getMatches,
    postMatch,
    getUsers,
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
} = require("./../controller")

/* -------------------- AUTHORIZATION -------------------- */

const {
    isAuth,
    requireTournamentAccess,
    requireMatchInTournament,
    requireEditOwnership,
} = require("./auth")

// ROOT

root.get("/matches", getMatches)

root.post(
    "/matches",
    isAuth,
    requireTournamentAccess(
        (req) => req.body?.tournament?.id ?? req.body?.tournament
    ),
    postMatch
) // Provisoria, luego puede ser modificada //

root.get("/edits", getEdits)

root.post("/edits", isAuth, postEditsUpload.array("image", 10), postEdits)

root.delete("/edits/:id", isAuth, requireEditOwnership, deleteEdit)

// USERS

users.get("/", getUsers)

users.post("/login", postLogin)

users.post("/logout", isAuth, postLogout)

// TOURNAMENTS

tournaments.get("/", getTournaments)

tournaments.get("/images", getTournamentImages)

tournaments.post("/", isAuth, postTournaments)

tournaments.get("/:tournament", getTournamentById)

tournaments.get("/:tournament/summary", getTournamentSummaryByTournamentId)

tournaments.get("/:tournament/calculator", getCalculatorByTournamentId)

tournaments.get("/:tournament/fixture", getFixtureByTournamentId)

tournaments.post(
    "/:tournament/fixture",
    isAuth,
    requireTournamentAccess(),
    postFixtureByTournamentId
)

tournaments.get("/:tournament/players", getPlayersByTournamentId)

tournaments.get("/:tournament/players/info", getPlayerInfoByTournamentId)

tournaments.post(
    "/:tournament/playin",
    isAuth,
    requireTournamentAccess(),
    postPlayinByTournamentId
)

tournaments.post(
    "/:tournament/playin/update",
    isAuth,
    requireTournamentAccess(),
    postPlayinUpdateByTournamentId
)

tournaments.put(
    "/:tournament/complete",
    isAuth,
    requireTournamentAccess(),
    putCompleteTournamentById
)

tournaments.get("/:tournament/playin/matches", getPlayinMatchesByTournamentId)

tournaments.post(
    "/:tournament/playoff",
    isAuth,
    requireTournamentAccess(),
    postPlayoffByTournamentId
)

tournaments.post(
    "/:tournament/playoff/update",
    isAuth,
    requireTournamentAccess(),
    postPlayoffUpdateByTournamentId
)

tournaments.get("/:tournament/playoff/matches", getPlayoffMatchesByTournamentId)

tournaments.get("/:tournament/teams", getTeamsByTournamentId)

tournaments.get("/:tournament/teams/:team/squad", getSquadByTeamId)

tournaments.put(
    "/:tournament/teams/:team/squad",
    isAuth,
    requireTournamentAccess(),
    putSquadByTeamId
)

tournaments.post(
    "/:tournament/matches/create-game/",
    isAuth,
    requireTournamentAccess(),
    postMatchByTournamentId
)

tournaments.put(
    "/:tournament/matches/update-game/:match",
    isAuth,
    requireTournamentAccess(),
    requireMatchInTournament,
    putMatchByTournamentId
)

// DAILY RECAP
// POST: create/update recap for a date
tournaments.post(
    "/:tournament/daily-recap",
    isAuth,
    requireTournamentAccess(),
    postDailyRecapByTournamentId
)

// GET: retrieve recap for a specific date (?date=YYYY-MM-DD) or latest if omitted
tournaments.get("/:tournament/daily-recap", getDailyRecapByTournamentId)

tournaments.put(
    "/:tournament/matches/delete-game/:match",
    isAuth,
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

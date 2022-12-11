const dotenv = require("dotenv").config()

const express = require("express")

/* -------------------- ROUTER -------------------- */

const { Router } = express
const homeR = Router()

homeR.use(express.json())

homeR.use(express.urlencoded({ extended: true }))

/* -------------------- API -------------------- */

const {
    getHomeController,
    postRegisterController,
    postLoginController,
    postLogoutController,
    getIsUserAuthenticatedController,
    getTournamentsController,
    postTournamentsController,
    getTournamentByIdController,
    // getTournamentsPlayoffsController,
    getFixtureByTournamentIdController,
    postFixtureController,
    getStandingsFromTournamentController,
    getPlayoffsTableController,
    getPlayersFromTournamentController,
    getPlayoffsPlayerInfoController,
    getPlayoffsBracketController,
    getUsersController,
    getPlayoffsUpdatedWinsController,
    getStandingsPlayerInfoFromTournamentController,
    getMatchesController,
    postMatchesController,
    getOriginateGameController,
    postOriginateGameController,
    putModifyGameController,
    putRemoveGameController,
    putWorldCupTeamAssignmentController,
    getWorldCupStandingsController,
    postWorldCupNewMatchController,
    getStatisticsController,
    getStreaksController,
    getAllTimeStandingsController,
    getAllTimeGeneralStatsController,
    getAllTimeFaceToFaceController,
    achievements,
    majorUpdatesController,
} = require("./../controller/controller.js")

/* -------------------- isAUTH -------------------- */

const { isAuth } = require("./auth")

// HOME

homeR.get("/", getHomeController)

// LOGIN, LOGOUT, REGISTER, ISUSERAUTHENTICATED

homeR.post("/register", postRegisterController)

homeR.post("/login", postLoginController)

homeR.post("/logout", postLogoutController)

homeR.get("/isUserAuthenticated", getIsUserAuthenticatedController)

// /PLAYERS

homeR.get("/users", getUsersController)

// /MATCHES

homeR.get("/matches", getMatchesController)

homeR.post("/matches", postMatchesController) // Provisoria, luego puede ser modificada //

// /FIXTURE

homeR.get("/tournaments", getTournamentsController)

homeR.post("/tournaments", postTournamentsController)

homeR.get("/tournaments/:tournament", getTournamentByIdController)

homeR.post("/tournaments/:tournament/fixture", postFixtureController)

homeR.get(
    "/tournaments/:tournament/players",
    getPlayersFromTournamentController
)

homeR.get(
    "/tournaments/:tournament/matches",
    getFixtureByTournamentIdController
)

homeR.get(
    "/tournaments/:tournament/matches/create-game/",
    getOriginateGameController
)

homeR.post(
    "/tournaments/:tournament/matches/create-game/",
    postOriginateGameController
)

homeR.put(
    "/tournaments/:tournament/matches/update-game/:match",
    putModifyGameController
)

homeR.put(
    "/tournaments/:tournament/matches/delete-game/:match",
    putRemoveGameController
)

homeR.get(
    "/tournaments/:tournament/standings/table",
    getStandingsFromTournamentController
)

homeR.get(
    "/tournaments/:tournament/standings/player-info",
    getStandingsPlayerInfoFromTournamentController
)

homeR.get("/tournaments/:tournament/playoffs/table", getPlayoffsTableController)

homeR.get(
    "/tournaments/:tournament/playoffs/player-info",
    getPlayoffsPlayerInfoController
)

homeR.get(
    "/tournaments/:tournament/playoffs/bracket",
    getPlayoffsBracketController
)

homeR.get(
    "/tournaments/:tournament/playoffs/updated-wins",
    getPlayoffsUpdatedWinsController
)

// //

homeR.put(
    "/world-cup/:tournament/team-assignment",
    putWorldCupTeamAssignmentController
)

homeR.get("/world-cup/:tournament/standings", getWorldCupStandingsController)

homeR.post("/world-cup/:tournament/matches", postWorldCupNewMatchController)

homeR.get("/statistics", getStatisticsController)

homeR.get("/statistics/all-time/standings", getAllTimeStandingsController)

homeR.get(
    "/statistics/all-time/general-stats",
    getAllTimeGeneralStatsController
)

homeR.get("/statistics/all-time/face-to-face", getAllTimeFaceToFaceController)

homeR.get("/streaks", getStreaksController)

homeR.get("/achievements", achievements)

homeR.get("/update", majorUpdatesController)

module.exports = {
    homeR,
}

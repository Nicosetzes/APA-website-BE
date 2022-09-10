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
    getFixtureByTournamentIdController,
    postFixtureController,
    getStandingsController,
    getPlayoffsTableController,
    getPlayoffsPlayerInfoController,
    getPlayoffsBracketController,
    getStandingsPlayerInfoController,
    getMatchesController,
    putModifyGameController,
    putRemoveGameController,
    getStatisticsController,
    getStreaksController,
    achievements,
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

// /STANDINGS

homeR.get("/standings", getStandingsController)

homeR.get("/standings/player-info", getStandingsPlayerInfoController)

// /PLAYOFFS

homeR.get("/playoffs/table", getPlayoffsTableController)

homeR.get("/playoffs/player-info", getPlayoffsPlayerInfoController)

homeR.get("/playoffs/bracket", getPlayoffsBracketController)

// /MATCHES

homeR.get("/matches", getMatchesController)

// /FIXTURE

homeR.get("/tournaments", getTournamentsController)

homeR.post("/tournaments", postTournamentsController)

homeR.get("/tournaments/:id/fixture", getFixtureByTournamentIdController)

homeR.post("/tournaments/:id/fixture", postFixtureController)

homeR.put("/tournaments/:id/update-game/:match", putModifyGameController)

homeR.put("/tournaments/:id/delete-game/:match", putRemoveGameController)

homeR.get("/statistics", getStatisticsController)

homeR.get("/streaks", getStreaksController)

homeR.get("/achievements", achievements)

module.exports = {
    homeR,
}

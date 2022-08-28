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
    getFixtureByTournamentIdController,
    getStandingsController,
    getPlayerInfoFromTournamentsController,
    getMatchesController,
    postUploadGameController,
    putModifyGameController,
    deleteGameController,
    getStatisticsController,
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

homeR.get("/standings/player-info", getPlayerInfoFromTournamentsController)

// /MATCHES

homeR.get("/matches", isAuth, getMatchesController)

// /FIXTURE

homeR.get("/tournaments", getTournamentsController)

homeR.get(
    "/tournaments/:id/fixture",
    isAuth,
    getFixtureByTournamentIdController
)

homeR.post("/tournaments/:id/upload-game", isAuth, postUploadGameController)

homeR.put(
    "/tournaments/:id/update-game/:match",
    isAuth,
    putModifyGameController
)

homeR.delete(
    "/tournaments/:id/delete-game/:match",
    isAuth,
    deleteGameController
)

homeR.get("/statistics", getStatisticsController)

homeR.get("/achievements", achievements)

module.exports = {
    homeR,
}

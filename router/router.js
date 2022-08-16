const dotenv = require("dotenv").config();

const express = require("express");

/* -------------------- ROUTER -------------------- */

const { Router } = express;
const homeR = Router();

homeR.use(express.json());

homeR.use(express.urlencoded({ extended: true }));

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
} = require("./../controller/controller.js");

/* -------------------- isAUTH -------------------- */

const { isAuth } = require("./auth");

// HOME

homeR.get("/", getHomeController);

// LOGIN, LOGOUT, REGISTER, ISUSERAUTHENTICATED

homeR.post("/register", postRegisterController);

homeR.post("/login", postLoginController);

homeR.post("/logout", postLogoutController);

homeR.get("/isUserAuthenticated", getIsUserAuthenticatedController);

// /STANDINGS

homeR.get("/standings", getStandingsController);

homeR.get("/standings/player-info", getPlayerInfoFromTournamentsController);

// /MATCHES

homeR.get("/matches", isAuth, getMatchesController);

// /FIXTURE

homeR.get("/tournaments", getTournamentsController);

homeR.get("/tournaments/:id/fixture", getFixtureByTournamentIdController);

homeR.post("/tournaments/:id/upload-game", postUploadGameController);

homeR.put("/tournaments/:id/update-game/:match", putModifyGameController);

homeR.delete("/tournaments/:id/delete-game/:match", deleteGameController);

homeR.get("/statistics", getStatisticsController);

module.exports = {
  homeR,
};

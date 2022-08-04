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
  getTournamentsController,
  getFixtureByTournamentIdController,
  getStandingsController,
  getMatchesController,
  postUploadGameController,
  putModifyGameController,
  deleteGameController,
  getStatisticsController
} = require("./../controller/controller.js");

// HOME

homeR.get("/", getHomeController);

// /STANDINGS

homeR.get("/standings", getStandingsController);

// /MATCHES

homeR.get("/matches", getMatchesController);

// /FIXTURE

homeR.get("/tournaments", getTournamentsController);

homeR.get("/tournaments/:id/fixture", getFixtureByTournamentIdController);

homeR.post("/tournaments/:id/upload-game", postUploadGameController);

homeR.put("/tournaments/:id/update-game/:match", putModifyGameController);

homeR.delete("/tournaments/:id/delete-game/:match", deleteGameController);

homeR.get("/statistics", getStatisticsController)

module.exports = {
  homeR,
};

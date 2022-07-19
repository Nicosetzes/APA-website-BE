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
    getFixtureController,
    getFixtureByTournamentIdController,
    getFixtureByTournamentIdAndTeamOrPlayerIdController,
    getStandingsController,
    postUploadGameController,
    putModifyGameController,
    deleteGameController
} = require("./../controller/controller.js");

// HOME

homeR.get("/", getHomeController);

// /STANDINGS

homeR.get("/standings", getStandingsController);

// /FIXTURE

homeR.get("/fixture", getFixtureController);

homeR.get("/fixture/:id", getFixtureByTournamentIdController);

homeR.get("/fixture/:tournamentId/:teamIdOrPlayerName", getFixtureByTournamentIdAndTeamOrPlayerIdController);

homeR.post("/upload-game/:id", postUploadGameController);

homeR.put("/update-game/:id/:matchId", putModifyGameController)

homeR.delete("/delete-game/:id/:matchId", deleteGameController)




module.exports = {
    homeR,
}
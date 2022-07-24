/* -------------------- DOTENV -------------------- */

const dotenv = require("dotenv").config();

/* -------------------- SERVER -------------------- */

const express = require("express");

const app = express();
const cors = require('cors');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(cors())

const { homeR } = require("./router/router.js")

app.use("/api", homeR);

// DEFINO RUTAS INEXISTENTES //

app.get("*", (req, res) => {
	res.send("No se halló la página")
  });

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`EXPRESS server listening on port ${PORT}`));

// /* -------------------- ROUTES -------------------- */

// app.get("/records", async (req, res) => {
//   const playerQuery = req.query.player;

//   if (
//     (playerQuery && playerQuery === "Leo") ||
//     playerQuery === "Max" ||
//     playerQuery === "Nico" ||
//     playerQuery === "Santi" ||
//     playerQuery === "Lucho"
//   ) {
//     try {
//       const allPlayerLongestWinningStreak = await playersModel
//         .find({}, "name longestWinningStreak")
//         .sort({
//           longestWinningStreak: -1,
//           longestDrawStreak: -1,
//           longestLosingStreak: 1,
//         });
//       const allPlayerLongestDrawStreak = await playersModel
//         .find({}, "name longestDrawStreak")
//         .sort({ longestDrawStreak: -1 });
//       const allPlayerLongestLosingStreak = await playersModel
//         .find({}, "name longestLosingStreak")
//         .sort({
//           longestLosingStreak: -1,
//           longestWinningStreak: -1,
//           longestDrawStreak: -1,
//         });

//       const rankingForPlayerInWins =
//         allPlayerLongestWinningStreak.findIndex(
//           (element) => element.name === playerQuery
//         ) + 1;
//       const rankingForPlayerInDraws =
//         allPlayerLongestDrawStreak.findIndex(
//           (element) => element.name === playerQuery
//         ) + 1;
//       const rankingForPlayerInLoses =
//         allPlayerLongestLosingStreak.findIndex(
//           (element) => element.name === playerQuery
//         ) + 1;

//       const playerProfile = await playersModel.findOne({ name: playerQuery });

//       const recentMatchesFromPlayer = await matchesModel
//         .find({ $or: [{ playerP1: playerQuery }, { playerP2: playerQuery }] })
//         .limit(10)
//         .sort({ _id: -1 });

//       const matchesWonByPlayer = await matchesModel.find(
//         { "outcome.playerThatWon": playerQuery, "outcome.draw": false },
//         "outcome"
//       );

//       const arrayOfTeams = [];

//       matchesWonByPlayer.forEach((element, index) => {
//         if (index === 0) {
//           // Primer caso
//           arrayOfTeams.push({
//             team: element.outcome.teamThatWon,
//             victories: 1,
//           });
//         } else {
//           let indexOfElement = arrayOfTeams.findIndex(
//             (object) => object.team === element.outcome.teamThatWon
//           );
//           indexOfElement === -1
//             ? arrayOfTeams.push({
//               team: element.outcome.teamThatWon,
//               victories: 1,
//             })
//             : arrayOfTeams[indexOfElement].victories++;
//         }
//       });

//       const arrayOfTeamsWithWins = [];

//       arrayOfTeams.forEach(async (element) => {
//         let amountOfMatches = await matchesModel.countDocuments({
//           $or: [
//             {
//               $and: [{ playerP1: playerQuery }, { teamP1: element.team }],
//             },
//             {
//               $and: [{ playerP2: playerQuery }, { teamP2: element.team }],
//             },
//           ],
//         });
//         arrayOfTeamsWithWins.push({
//           team: element.team,
//           matches: amountOfMatches,
//           victories: element.victories,
//           winRate: (element.victories / amountOfMatches) * 100,
//         });
//       }); // Lo dejo ejecutandose de manera asíncrona y sigo con lo otro! CHEQUEAR

//       const allTournaments = await tournamentsModel.find({}, "name");

//       const arrayOfMatchesByTournament = [];

//       let itemsProcessed = 0;

//       allTournaments.forEach(async (element, index) => {
//         arrayOfMatchesByTournament.push({
//           tournament: element.name,
//           amount: await matchesModel.countDocuments({
//             "tournament.id": element.id,
//             $or: [{ playerP1: playerQuery }, { playerP2: playerQuery }],
//           }),
//           victories: await matchesModel.countDocuments({
//             "tournament.id": element.id,
//             "outcome.playerThatWon": playerQuery,
//             "outcome.draw": false,
//           }),
//         });
//         itemsProcessed++;
//         if (itemsProcessed === allTournaments.length) {
//           res.render("records-id", {
//             playerProfile,
//             rankingForPlayerInWins,
//             rankingForPlayerInDraws,
//             rankingForPlayerInLoses,
//             recentMatchesFromPlayer,
//             playerQuery,
//             arrayOfTeamsWithWins,
//             arrayOfMatchesByTournament,
//           });
//         }
//       });
//     } catch (err) {
//       return res.status(500).send("Something went wrong!" + err);
//     }
//   } else {
//     try {
//       const amountOfMatchesByLeo = await matchesModel.countDocuments({
//         $or: [{ playerP1: "Leo" }, { playerP2: "Leo" }],
//       });

//       const winsByTeamByLeo = await matchesModel.find(
//         { "outcome.playerThatWon": "Leo", "outcome.draw": false },
//         "outcome.teamThatWon"
//       );

//       const teamsThatWonByLeo = winsByTeamByLeo
//         .map((element) => element.outcome.teamThatWon)
//         .reduce((acc, curr) => {
//           return acc[curr] ? ++acc[curr] : (acc[curr] = 1), acc;
//         }, {});

//       const sortableByLeo = Object.entries(teamsThatWonByLeo)
//         .sort(([, b], [, a]) => a - b)
//         .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});

//       const winsByLeo = await matchesModel.countDocuments({
//         "outcome.playerThatWon": "Leo",
//         "outcome.draw": false,
//       });

//       const losesByLeo = await matchesModel.countDocuments({
//         $and: [
//           { $or: [{ playerP1: "Leo" }, { playerP2: "Leo" }] },
//           {
//             $nor: [
//               { "outcome.playerThatWon": "Leo" },
//               { "outcome.draw": true },
//             ],
//           },
//         ],
//       });

//       const drawsByLeo = amountOfMatchesByLeo - winsByLeo - losesByLeo;

//       const averageWinsByLeo = winsByLeo / amountOfMatchesByLeo; // Promedio de victorias por partido

//       const averageLosesByLeo = losesByLeo / amountOfMatchesByLeo; // Promedio de derrotas por partido

//       const averageDrawsByLeo = 1 - averageWinsByLeo - averageLosesByLeo; // Promedio de empates por partido

//       const averagePointsByLeo = (winsByLeo * 3) / amountOfMatchesByLeo; // Promedio de puntos por partido

//       const amountOfMatchesByMax = await matchesModel.countDocuments({
//         $or: [{ playerP1: "Max" }, { playerP2: "Max" }],
//       });

//       const winsByTeamByMax = await matchesModel.find(
//         { "outcome.playerThatWon": "Max", "outcome.draw": false },
//         "outcome.teamThatWon"
//       );

//       const teamsThatWonByMax = winsByTeamByMax
//         .map((element) => element.outcome.teamThatWon)
//         .reduce((acc, curr) => {
//           return acc[curr] ? ++acc[curr] : (acc[curr] = 1), acc;
//         }, {});

//       const sortableByMax = Object.entries(teamsThatWonByMax)
//         .sort(([, b], [, a]) => a - b)
//         .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});

//       const winsByMax = await matchesModel.countDocuments({
//         "outcome.playerThatWon": "Max",
//         "outcome.draw": false,
//       });

//       const losesByMax = await matchesModel.countDocuments({
//         $and: [
//           { $or: [{ playerP1: "Max" }, { playerP2: "Max" }] },
//           {
//             $nor: [
//               { "outcome.playerThatWon": "Max" },
//               { "outcome.draw": true },
//             ],
//           },
//         ],
//       });

//       const drawsByMax = amountOfMatchesByMax - winsByMax - losesByMax;

//       const averageWinsByMax = winsByMax / amountOfMatchesByMax; // Promedio de victorias por partido

//       const averageLosesByMax = losesByMax / amountOfMatchesByMax; // Promedio de derrotas por partido

//       const averageDrawsByMax = 1 - averageWinsByMax - averageLosesByMax; // Promedio de empates por partido

//       const averagePointsByMax = (winsByMax * 3) / amountOfMatchesByMax; // Promedio de puntos por partido

//       const amountOfMatchesByNico = await matchesModel.countDocuments({
//         $or: [{ playerP1: "Nico" }, { playerP2: "Nico" }],
//       });

//       const winsByTeamByNico = await matchesModel.find(
//         { "outcome.playerThatWon": "Nico", "outcome.draw": false },
//         "outcome.teamThatWon"
//       );

//       const teamsThatWonByNico = winsByTeamByNico
//         .map((element) => element.outcome.teamThatWon)
//         .reduce((acc, curr) => {
//           return acc[curr] ? ++acc[curr] : (acc[curr] = 1), acc;
//         }, {});

//       const sortableByNico = Object.entries(teamsThatWonByNico)
//         .sort(([, b], [, a]) => a - b)
//         .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});

//       const winsByNico = await matchesModel.countDocuments({
//         "outcome.playerThatWon": "Nico",
//         "outcome.draw": false,
//       });

//       const losesByNico = await matchesModel.countDocuments({
//         $and: [
//           { $or: [{ playerP1: "Nico" }, { playerP2: "Nico" }] },
//           {
//             $nor: [
//               { "outcome.playerThatWon": "Nico" },
//               { "outcome.draw": true },
//             ],
//           },
//         ],
//       });

//       const drawsByNico = amountOfMatchesByNico - winsByNico - losesByNico;

//       const averageWinsByNico = winsByNico / amountOfMatchesByNico; // Promedio de victorias por partido

//       const averageLosesByNico = losesByNico / amountOfMatchesByNico; // Promedio de derrotas por partido

//       const averageDrawsByNico = 1 - averageWinsByNico - averageLosesByNico; // Promedio de empates por partido

//       const averagePointsByNico = (winsByNico * 3) / amountOfMatchesByNico; // Promedio de puntos por partido

//       const amountOfMatchesBySanti = await matchesModel.countDocuments({
//         $or: [{ playerP1: "Santi" }, { playerP2: "Santi" }],
//       });

//       const winsByTeamBySanti = await matchesModel.find(
//         { "outcome.playerThatWon": "Santi", "outcome.draw": false },
//         "outcome.teamThatWon"
//       );

//       const teamsThatWonBySanti = winsByTeamBySanti
//         .map((element) => element.outcome.teamThatWon)
//         .reduce((acc, curr) => {
//           return acc[curr] ? ++acc[curr] : (acc[curr] = 1), acc;
//         }, {});

//       const sortableBySanti = Object.entries(teamsThatWonBySanti)
//         .sort(([, b], [, a]) => a - b)
//         .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});

//       const winsBySanti = await matchesModel.countDocuments({
//         "outcome.playerThatWon": "Santi",
//         "outcome.draw": false,
//       });

//       const losesBySanti = await matchesModel.countDocuments({
//         $and: [
//           { $or: [{ playerP1: "Santi" }, { playerP2: "Santi" }] },
//           {
//             $nor: [
//               { "outcome.playerThatWon": "Santi" },
//               { "outcome.draw": true },
//             ],
//           },
//         ],
//       });

//       const drawsBySanti = amountOfMatchesBySanti - winsBySanti - losesBySanti;

//       const averageWinsBySanti = winsBySanti / amountOfMatchesBySanti; // Promedio de victorias por partido

//       const averageLosesBySanti = losesBySanti / amountOfMatchesBySanti; // Promedio de derrotas por partido

//       const averageDrawsBySanti = 1 - averageWinsBySanti - averageLosesBySanti; // Promedio de empates por partido

//       const averagePointsBySanti = (winsBySanti * 3) / amountOfMatchesBySanti; // Promedio de puntos por partido

//       const amountOfMatchesByLucho = await matchesModel.countDocuments({
//         $or: [{ playerP1: "Lucho" }, { playerP2: "Lucho" }],
//       });

//       const winsByTeamByLucho = await matchesModel.find(
//         { "outcome.playerThatWon": "Lucho", "outcome.draw": false },
//         "outcome.teamThatWon"
//       );

//       const teamsThatWonByLucho = winsByTeamByLucho
//         .map((element) => element.outcome.teamThatWon)
//         .reduce((acc, curr) => {
//           return acc[curr] ? ++acc[curr] : (acc[curr] = 1), acc;
//         }, {});

//       const sortableByLucho = Object.entries(teamsThatWonByLucho)
//         .sort(([, b], [, a]) => a - b)
//         .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});

//       const winsByLucho = await matchesModel.countDocuments({
//         "outcome.playerThatWon": "Lucho",
//         "outcome.draw": false,
//       });

//       const losesByLucho = await matchesModel.countDocuments({
//         $and: [
//           { $or: [{ playerP1: "Lucho" }, { playerP2: "Lucho" }] },
//           {
//             $nor: [
//               { "outcome.playerThatWon": "Lucho" },
//               { "outcome.draw": true },
//             ],
//           },
//         ],
//       });

//       const drawsByLucho = amountOfMatchesByLucho - winsByLucho - losesByLucho;

//       const averageWinsByLucho = winsByLucho / amountOfMatchesByLucho; // Promedio de victorias por partido

//       const averageLosesByLucho = losesByLucho / amountOfMatchesByLucho; // Promedio de derrotas por partido

//       const averageDrawsByLucho = 1 - averageWinsByLucho - averageLosesByLucho; // Promedio de empates por partido

//       const averagePointsByLucho = (winsByLucho * 3) / amountOfMatchesByLucho; // Promedio de puntos por partido

//       const orderedByScoringDif = await matchesModel
//         .find(
//           { "outcome.draw": false },
//           "playerP1 scoreP1 teamP1 playerP2 scoreP2 teamP2 tournament"
//         )
//         .sort({
//           "outcome.scoringDifference": -1,
//           "outcome.scoreFromTeamThatWon": -1,
//         })
//         .limit(5);

//       const totalMatchesForEachPlayer = [
//         { player: "Leo", matches: amountOfMatchesByLeo },
//         { player: "Max", matches: amountOfMatchesByMax },
//         { player: "Nico", matches: amountOfMatchesByNico },
//         { player: "Santi", matches: amountOfMatchesBySanti },
//         { player: "Lucho", matches: amountOfMatchesByLucho },
//       ];

//       const orderedByMostWins = [
//         { player: "Leo", wins: winsByLeo },
//         { player: "Max", wins: winsByMax },
//         { player: "Nico", wins: winsByNico },
//         { player: "Santi", wins: winsBySanti },
//         { player: "Lucho", wins: winsByLucho },
//       ].sort((a, b) => (a.wins > b.wins ? -1 : 1));

//       const orderedByMostDraws = [
//         { player: "Leo", draws: drawsByLeo },
//         { player: "Max", draws: drawsByMax },
//         { player: "Nico", draws: drawsByNico },
//         { player: "Santi", draws: drawsBySanti },
//         { player: "Lucho", draws: drawsByLucho },
//       ].sort((a, b) => (a.draws > b.draws ? -1 : 1));

//       const orderedByMostLoses = [
//         { player: "Leo", loses: losesByLeo },
//         { player: "Max", loses: losesByMax },
//         { player: "Nico", loses: losesByNico },
//         { player: "Santi", loses: losesBySanti },
//         { player: "Lucho", loses: losesByLucho },
//       ].sort((a, b) => (a.loses > b.loses ? -1 : 1));

//       const orderedByMostAverageWins = [
//         { player: "Leo", averageWins: averageWinsByLeo },
//         { player: "Max", averageWins: averageWinsByMax },
//         { player: "Nico", averageWins: averageWinsByNico },
//         { player: "Santi", averageWins: averageWinsBySanti },
//         { player: "Lucho", averageWins: averageWinsByLucho },
//       ].sort((a, b) => (a.averageWins > b.averageWins ? -1 : 1));

//       const orderedByMostAverageDraws = [
//         { player: "Leo", averageDraws: averageDrawsByLeo },
//         { player: "Max", averageDraws: averageDrawsByMax },
//         { player: "Nico", averageDraws: averageDrawsByNico },
//         { player: "Santi", averageDraws: averageDrawsBySanti },
//         { player: "Lucho", averageDraws: averageDrawsByLucho },
//       ].sort((a, b) => (a.averageDraws > b.averageDraws ? -1 : 1));

//       const orderedByMostAverageLoses = [
//         { player: "Leo", averageLoses: averageLosesByLeo },
//         { player: "Max", averageLoses: averageLosesByMax },
//         { player: "Nico", averageLoses: averageLosesByNico },
//         { player: "Santi", averageLoses: averageLosesBySanti },
//         { player: "Lucho", averageLoses: averageLosesByLucho },
//       ].sort((a, b) => (a.averageLoses > b.averageLoses ? -1 : 1));

//       const orderedByMostAveragePoints = [
//         { player: "Leo", averagePoints: averagePointsByLeo },
//         { player: "Max", averagePoints: averagePointsByMax },
//         { player: "Nico", averagePoints: averagePointsByNico },
//         { player: "Santi", averagePoints: averagePointsBySanti },
//         { player: "Lucho", averagePoints: averagePointsByLucho },
//       ].sort((a, b) => (a.averagePoints > b.averagePoints ? -1 : 1));

//       const teamThatWonTheMostByPlayer = [
//         {
//           player: "Leo",
//           team: Object.keys(sortableByLeo)[0],
//           victories: Object.values(sortableByLeo)[0],
//         },
//         {
//           player: "Max",
//           team: Object.keys(sortableByMax)[0],
//           victories: Object.values(sortableByMax)[0],
//         },
//         {
//           player: "Nico",
//           team: Object.keys(sortableByNico)[0],
//           victories: Object.values(sortableByNico)[0],
//         },
//         {
//           player: "Santi",
//           team: Object.keys(sortableBySanti)[0],
//           victories: Object.values(sortableBySanti)[0],
//         },
//         {
//           player: "Lucho",
//           team: Object.keys(sortableByLucho)[0],
//           victories: Object.values(sortableByLucho)[0],
//         },
//       ];

//       res.render("records", {
//         orderedByScoringDif,
//         totalMatchesForEachPlayer,
//         orderedByMostWins,
//         orderedByMostDraws,
//         orderedByMostLoses,
//         orderedByMostAverageWins,
//         orderedByMostAverageDraws,
//         orderedByMostAverageLoses,
//         orderedByMostAveragePoints,
//         teamThatWonTheMostByPlayer,
//       });
//     } catch (err) {
//       return res.status(500).send("Something went wrong!" + err);
//     }
//   }
// });

// app.get("/create-tournament", isAuth, (req, res) => {
//   res.render("create-tournament", {});
// });

// app.post("/create-tournament", isAuth, async (req, res) => {
//   try {
//     const { tournamentName, format, origin } = req.body;

//     console.log(req.body);

//     const arrayFromValues = Object.values(req.body);

//     const filteredArrayFromValues = arrayFromValues.filter(
//       (element) =>
//         element !== tournamentName && element !== format && element !== origin
//     ); // Creo un array que solo tenga jugadores y equipos

//     const humanPlayers = [];
//     const teams = [];
//     let infoFromApi;
//     let response;
//     let newTeam;
//     let counter = 0;

//     filteredArrayFromValues.forEach(async (element, index) => {
//       if (
//         element === "Leo" ||
//         element === "Lucho" ||
//         element === "Max" ||
//         element === "Nico" ||
//         element === "Santi"
//       ) {
//         humanPlayers.push(element);
//         counter++;
//         console.log(counter);
//       } else {
//         console.log("response");
//         infoFromApi = await require(`./public/teams/${element.split("|")[1]
//           }-teams.json`);

//         // console.log(infoFromApi.response);

//         response = infoFromApi.response;

//         // console.log(response);

//         newTeam = response
//           .filter((filtered) => filtered.team.id == element.split("|")[0])
//           .map(({ team: { id, name, code, logo } }) => {
//             return {
//               id,
//               team: name,
//               teamCode: code,
//               countryCode: element.split("|")[1],
//               logo,
//               played: 0,
//               wins: 0,
//               draws: 0,
//               losses: 0,
//               goalsFor: 0,
//               goalsAgainst: 0,
//               scoringDifference: 0,
//               points: 0,
//             };
//           })[0];

//         console.log(newTeam);

//         teams.push(newTeam);

//         counter++;
//         console.log(counter);
//       }

//       if (counter === filteredArrayFromValues.length) {
//         const tournament = {
//           name: tournamentName,
//           players: humanPlayers,
//           format,
//           origin,
//           teams,
//           fixtureStatus: false,
//           ongoing: true, // TO DO: I may use a PUT request to inform that a tournament has finished. //
//         };

//         await tournamentsModel.create(tournament);
//         res.redirect("/lottery-tournament-selection");
//       }
//     });
//   } catch (err) {
//     if (err.name === "ValidationError") {
//       const errors = {};

//       Object.keys(err.errors).forEach((key) => {
//         errors[key] = err.errors[key].message;
//       });

//       return res.status(400).send(errors);
//     }
//     res.status(500).send("Something went wrong");
//   }
// });

// app.get("/face-to-face", async (req, res) => {
//   try {
//     const tournamentId = req.query.id;

//     const allTournaments = await tournamentsModel.find({}, "id name status");

//     const array = [];
//     let finalMatchups = [];

//     if (tournamentId) {
//       const allMatches = await matchesModel.find(
//         { "tournament.id": tournamentId },
//         "playerP1 teamP1 scoreP1 playerP2 teamP2 scoreP2"
//       );

//       if (allMatches.length === 0)
//         res.render("./errors/face-to-face-error", { tournamentId });

//       const allPlayers1 = allMatches.map((match) => match.playerP1);
//       const allPlayers2 = allMatches.map((match) => match.playerP2);
//       const concat = allPlayers1.concat(allPlayers2);
//       const allPlayers = [...new Set(concat)]; // Con Set puedo eliminar valores repetidos //
//       const allMatchups = allPlayers.flatMap((v, i) =>
//         allPlayers.slice(i + 1).map((w) => {
//           return { p1: v, p2: w };
//         })
//       );

//       let itemsProcessed = 0;

//       allMatchups.forEach(async (element, index) => {
//         array.push(
//           await matchesModel.find({
//             "tournament.id": tournamentId,
//             $or: [
//               { $and: [{ playerP1: element.p1 }, { rivalOfP1: element.p2 }] },
//               { $and: [{ playerP1: element.p2 }, { rivalOfP1: element.p1 }] },
//             ],
//           })
//         ); // ESTE LLAMADO NO DEBERÍA CAMBIARLO POR UN FILTER? ESTA INFO YA LA TENGO, ES INNECESARIA UNA NUEVA LLAMADA A LA BD! //

//         itemsProcessed++;

//         if (itemsProcessed === allMatchups.length) {
//           const workedMatchups = allMatchups.map((element, index) => {
//             return {
//               matchup: `${array[index][0]?.playerP1} (J1) vs ${array[index][0]?.rivalOfP1} (J2)`,
//               matches: array[index],
//               wonByP1: array[index].reduce(
//                 (acc, cur) =>
//                   cur.outcome.playerThatWon === array[index][0].playerP1
//                     ? ++acc
//                     : acc,
//                 0
//               ),
//               wonByP2: array[index].reduce(
//                 (acc, cur) =>
//                   cur.outcome.playerThatWon === array[index][0].playerP2
//                     ? ++acc
//                     : acc,
//                 0
//               ),
//               draws: array[index].reduce(
//                 (acc, cur) => (cur.outcome.draw ? ++acc : acc),
//                 0
//               ),
//               scoreByP1:
//                 array[index]
//                   .filter(
//                     (element) => element.playerP1 === array[index][0].playerP1
//                   )
//                   .reduce((acc, cur) => acc + cur.scoreP1, 0) +
//                 array[index]
//                   .filter(
//                     (element) => element.playerP1 === array[index][0].playerP2
//                   )
//                   .reduce((acc, cur) => acc + cur.scoreP2, 0), // Para calcular, filtro por posición y sumo ambas posibilidades.

//               scoreByP2:
//                 array[index]
//                   .filter(
//                     (element) => element.playerP2 === array[index][0].playerP2
//                   )
//                   .reduce((acc, cur) => acc + cur.scoreP2, 0) +
//                 array[index]
//                   .filter(
//                     (element) => element.playerP2 === array[index][0].playerP1
//                   )
//                   .reduce((acc, cur) => acc + cur.scoreP1, 0),
//             };
//           });

//           const finalMatchups = workedMatchups.filter((element) => {
//             return element.matchup !== "undefined (J1) vs undefined (J2)";
//           });

//           res.render("face-to-face", {
//             finalMatchups,
//             allMatches,
//             allTournaments,
//           });
//         }
//       });
//     } else {
//       const allMatches = await matchesModel.find(
//         {},
//         "playerP1 teamP1 scoreP1 playerP2 teamP2 scoreP2"
//       );

//       if (allMatches.length === 0) {
//         res.render("face-to-face", {
//           finalMatchups,
//           allMatches,
//           allTournaments,
//         });
//       }

//       const allPlayers1 = allMatches.map((match) => match.playerP1);
//       const allPlayers2 = allMatches.map((match) => match.playerP2);
//       const concat = allPlayers1.concat(allPlayers2);
//       const allPlayers = [...new Set(concat)]; // Con Set puedo eliminar valores repetidos //
//       const allMatchups = allPlayers.flatMap((v, i) =>
//         allPlayers.slice(i + 1).map((w) => {
//           return { p1: v, p2: w };
//         })
//       );

//       let itemsProcessed = 0;

//       allMatchups.forEach(async (element, index) => {
//         array.push(
//           await matchesModel.find({
//             $or: [
//               { $and: [{ playerP1: element.p1 }, { rivalOfP1: element.p2 }] },
//               { $and: [{ playerP1: element.p2 }, { rivalOfP1: element.p1 }] },
//             ],
//           })
//         ); // ESTE LLAMADO NO DEBERÍA CAMBIARLO POR UN FILTER? ESTA INFO YA LA TENGO, ES INNECESARIA UNA NUEVA LLAMADA A LA BD! //
//         itemsProcessed++;
//         if (itemsProcessed === allMatchups.length) {
//           const workedMatchups = allMatchups.map((element, index) => ({
//             matchup: `${array[index][0]?.playerP1} (J1) vs ${array[index][0]?.rivalOfP1} (J2)`,
//             matches: array[index],
//             wonByP1: array[index].reduce(
//               (acc, cur) =>
//                 cur.outcome.playerThatWon === array[index][0].playerP1
//                   ? ++acc
//                   : acc,
//               0
//             ),
//             wonByP2: array[index].reduce(
//               (acc, cur) =>
//                 cur.outcome.playerThatWon === array[index][0].playerP2
//                   ? ++acc
//                   : acc,
//               0
//             ),
//             draws: array[index].reduce(
//               (acc, cur) => (cur.outcome.draw ? ++acc : acc),
//               0
//             ),
//             scoreByP1:
//               array[index]
//                 .filter(
//                   (element) => element.playerP1 === array[index][0].playerP1
//                 )
//                 .reduce((acc, cur) => acc + cur.scoreP1, 0) +
//               array[index]
//                 .filter(
//                   (element) => element.playerP1 === array[index][0].playerP2
//                 )
//                 .reduce((acc, cur) => acc + cur.scoreP2, 0), // Para calcular, filtro por posición y sumo ambas posibilidades.

//             scoreByP2:
//               array[index]
//                 .filter(
//                   (element) => element.playerP2 === array[index][0].playerP2
//                 )
//                 .reduce((acc, cur) => acc + cur.scoreP2, 0) +
//               array[index]
//                 .filter(
//                   (element) => element.playerP2 === array[index][0].playerP1
//                 )
//                 .reduce((acc, cur) => acc + cur.scoreP1, 0),
//           }));

//           const finalMatchups = workedMatchups.filter((element) => {
//             return element.matchup !== "undefined (J1) vs undefined (J2)";
//           });

//           res.render("face-to-face", {
//             finalMatchups,
//             allMatches,
//             allTournaments,
//           });
//         }
//       });
//     }
//   } catch (err) {
//     return res.status(500).send(err);
//   }

//   console.log(`Ruta: ${req.url}, Método: ${req.method}`);
// });

// app.get("/lottery-tournament-selection", isAuth, async (req, res) => {
//   try {
//     const tournamentsFromBD = await tournamentsModel.find({ ongoing: true }); // Solo traigo los torneos que se encuentren en curso.
//     if (!tournamentsFromBD.length) {
//       res.render("./errors/lottery-error");
//       return;
//     }
//     res.render("lottery-tournament-selection", { tournamentsFromBD });
//   } catch (err) {
//     res.status(500).send("Something went wrong" + err);
//   }
// });

// app.post("/lottery-tournament-selection", isAuth, async (req, res) => {
//   try {
//     const { tournament, players, teams } = req.body;
//     if (tournament.match(/^[0-9a-fA-F]{24}$/)) {
//       // const tournamentById = await tournamentsModel.findById(tournament);
//       res.redirect(`/lottery/${tournament}?players=${players}&teams=${teams}`);
//     }
//   } catch (err) {
//     res.status(500).send("Something went wrong" + err);
//   }
// });

// app.get("/lottery/:id", isAuth, async (req, res) => {
//   const idProvided = req.params.id;
//   const { players, teams } = req.query;
//   try {
//     const tournamentById = await tournamentsModel.findById(idProvided);
//     if (!tournamentById) {
//       res.render("./errors/tournaments-id-error", { idProvided });
//       return;
//     }
//     res.render("lottery", { tournamentById, players, teams });
//   } catch (err) {
//     res.status(500).send("Something went wrong" + err);
//   }
// });

// app.post("/lottery-assignment/:id", isAuth, async (req, res) => {
//   try {
//     const { players, teams } = req.body;
//     const tournamentId = req.params.id;
//     const assignmentArray = [];

//     const tournament = await tournamentsModel.findById(tournamentId, "teams");

//     const teamsFromTournament = tournament.teams;

//     teams.forEach(async (element, index) => {
//       let { id, team, logo } = teamsFromTournament.filter(
//         (filtered) => filtered.id == element.split("|")[0]
//       )[0]; // Me quedo el único elemento de la lista

//       let assignment = {
//         id,
//         player: players[index],
//         team,
//         logo,
//       };

//       assignmentArray.push(assignment);
//     });

//     // Actualizo "teams" dentro del torneo, para sumar la info de qué jugadores juegan con qué equipos. Es necesario para los standings //

//     assignmentArray.forEach(async (assignment) => {
//       let team = assignment.team;

//       await tournamentsModel.updateOne(
//         { _id: tournamentId, "teams.team": team },
//         {
//           $set: {
//             "teams.$.player": assignment.player,
//           },
//         }
//       );
//     });

//     const playerArray = await tournamentsModel.findById(
//       tournamentId,
//       "players"
//     );

//     const definitiveFixture = fixture(assignmentArray, playerArray.players); // GENERO EL FIXTURE

//     await tournamentsModel.findByIdAndUpdate(tournamentId, {
//       fixture: definitiveFixture,
//       fixtureStatus: true,
//     });

//     res.redirect(`/fixture/${tournamentId}`);
//   } catch (err) {
//     res.status(500).send("Something went wrong" + err);
//   }
// });

// app.post("/fixture/:tournamentId/players", isAuth, async (req, res) => {
//   const tournamentId = req.params.tournamentId;
//   const { players } = req.body;
//   try {
//     if (!players) {
//       res.redirect(`/fixture/${tournamentId}`)
//       return;
//     }
//     if (players && !Array.isArray(players)) {
//       res.redirect(`/fixture/${tournamentId}/${players}`);
//       return;
//     }
//     if (players && players.length === 2) {
//       const tournament = await tournamentsModel.findById(
//         tournamentId,
//         "name fixture"
//       );
//       const tournamentName = tournament.name;
//       const filteredFixtureFromTournament = tournament.fixture.filter(
//         (element) => {
//           return (
//             (element.playerP1 === players[0] && element.playerP2 === players[1]) || (element.playerP1 === players[1] && element.playerP2 === players[0])
//           );
//         }
//       );
//       res.render("fixture-id-players", {
//         tournamentName,
//         players,
//         tournamentId,
//         filteredFixtureFromTournament,
//       })
//     }
//     if (players && players.length > 2) {
//       res.redirect(`/fixture/${tournamentId}`);
//     }
//   } catch (err) {
//     res.status(500).send("Something went wrong" + err);
//   }
// });
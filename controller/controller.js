const {
  // originateInvalidToken,
  // retrieveInvalidToken,
  originateUser,
  retrieveUser,
  retrieveAllPlayers,
  retrievePlayer,
  retrieveRecentMatchesFromPlayer,
  retrieveWonMatchesFromPlayer,
  totalMatchesFromAPlayerTeam,
  totalMatchesFromPlayerByTournament,
  totalWinsFromPlayerByTournament,
  totalLossesFromPlayerByTournament,
  totalMatchesFromPlayer,
  retrieveTeamsWithAtLeastOneWinFromPlayer,
  totalWinsFromPlayer,
  totalDrawsFromPlayer,
  totalLossesFromPlayer,
  orderMatchesByScoringDifference,
  orderMatchesFromTournamentById,
  originateMatch,
  retrieveMatchById,
  deleteMatchById,
  retrieveMatchesByQuery,
  retrieveMatches,
  retrieveTournamentNames,
  retrieveRecentTournamentNames,
  retrieveOngoingTournaments,
  retrieveTournamentById,
  originateTournament,
  retrieveTournaments,
  modifyFixtureFromTournamentVersionOne,
  modifyFixtureFromTournamentVersionTwo,
  modifyFixtureFromTournamentWhenEditing,
  modifyFixtureFromTournamentWhenRemoving,
  modifyTeamsFromTournament,
  modifyFixtureFromTournamentWhenCreated,
} = require("./../service/service.js");

/* -------------------- HOME -------------------- */

const getHomeController = async (req, res) => {
  try {
    req.userId
      ? res.status(200).json({
          user: {
            id: req.userId,
            name: req.userEmail,
            nickname: req.userNickname,
          },
        })
      : res.status(200).json({ data: "El usuario aun no ha iniciado sesión" });
  } catch (err) {
    return res.status(500).send("Something went wrong!" + err);
  }
};

/* -------------------- REGISTER -------------------- */

// const Joi = require("@hapi/joi");

// const schemaRegister = Joi.object({
//   email: Joi.string()
//     .min(6)
//     .messages({ "string.min": "El email debe tener al menos 6 caracteres" })
//     .max(255)
//     .required()
//     .email(),
//   password: Joi.string().min(8).max(1024).required().messages({
//     "string.min": "La contraseña debe tener al menos 8 caracteres",
//   }),
//   nickname: Joi.string().min(1).max(255).required(),
// });

const bcrypt = require("bcrypt");

const postRegisterController = async (req, res) => {
  try {
    // const { error } = schemaRegister.validate(req.body);

    // if (error) return res.status(400).json({ error: error.details[0].message });

    let { email, password, nickname } = req.body;

    const doesUserExist = await retrieveUser(email);
    if (doesUserExist)
      return res
        .status(400)
        .json({ error: "Email ya registrado", user: doesUserExist });

    const salt = await bcrypt.genSalt(10);
    const hiddenPassword = await bcrypt.hash(password, salt);

    const user = { email, password: hiddenPassword, nickname };

    const newUser = await originateUser(user);
    res.json(newUser);
  } catch (err) {
    return res.status(500).send("Something went wrong!" + err);
  }
};

const jwt = require("jsonwebtoken");

const jwtKey = process.env.TOKEN_SECRET;

const Joi = require("@hapi/joi");

const postLoginController = async (req, res) => {
  // Validation with custom messages //
  const schemaLogin = Joi.object({
    email: Joi.string().max(255).required().email().messages({
      "string.empty": `Ingrese un email`,
      "any.required": `El email es requerido`,
      "string.email": `Debe ingresar un email válido`,
    }),
    password: Joi.string().min(6).max(1024).required().messages({
      "string.min": `La contraseña debe tener un mínimo de {#limit} caracteres`,
      "string.empty": `Ingrese una contraseña`,
      "any.required": `La contraseña es requerida`,
    }),
  });

  try {
    const { error } = schemaLogin.validate(req.body);

    if (error)
      return res.status(400).json({
        auth: false,
        message: error.details[0].message,
      });

    let { email, password } = req.body;

    const user = await retrieveUser(email);

    if (!user)
      return res.status(400).json({
        auth: false,
        message: "El usuario ingresado no existe",
      });

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid)
      return res.status(400).json({
        auth: false,
        message: "La contraseña ingresada no es correcta",
      });

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
      },
      jwtKey,
      {
        //   algorithm: "HS256",
        expiresIn: "12h",
      }
    );

    res
      .cookie("jwt", token, {
        // withCredentials: true,
        maxAge: 1000 * 60 * 60 * 12, // 12 horas //
        httpOnly: true,
        // secure: process.env.NODE_ENV === "production",
      })
      .status(200)
      .json({
        auth: true,
        message: `Bienvenid@ ${user.nickname}`,
        token,
      });
  } catch (err) {
    return res.status(500).json({
      auth: false,
      message: `Error inesperado, intente más tarde`,
    });
  }
};

const postLogoutController = async (req, res) => {
  const token = req.cookies.jwt;
  if (!token)
    return res
      .status(400)
      .json({ auth: false, message: "Primero debe iniciar sesión" }); // Revisar código de error //
  let decodedToken;
  try {
    decodedToken = jwt.verify(token, process.env.TOKEN_SECRET);
  } catch (error) {
    res.status(400).json({
      auth: false,
      message: "Sesión no válida, error en las credenciales",
    });
  }
  const { email } = decodedToken;
  try {
    // console.log(token);
    // const invalidToken = await originateInvalidToken(token); // Creo el token inválido en la BD
    const { nickname } = await retrieveUser(email); // Podría obtener la info directamente de la cookie si en ella guardara lo que necesito (además del ID) //
    return res
      .clearCookie("jwt")
      .status(200)
      .json({ auth: false, message: `Adiós ${nickname}` });
  } catch (err) {
    return res
      .status(500)
      .json({ auth: false, message: `Error inesperado, intente más tarde` }); // Revisar código de error //
  }
};

const getIsUserAuthenticatedController = async (req, res) => {
  const token = req.cookies.jwt;
  console.log(token);
  if (!token) return res.status(200).json({ auth: false }); // Revisar código de error //
  let decodedToken;
  try {
    decodedToken = jwt.verify(token, process.env.TOKEN_SECRET);
  } catch (error) {
    res.status(400).json({
      auth: false,
      message: "Sesión no válida, error en las credenciales",
    });
  }
  const { email } = decodedToken;
  console.log(email);
  try {
    // const invalidToken = await retrieveInvalidToken(token); // Busco por el token presentado en la colección de tokens inválidos //
    // if (invalidToken) return res.status(500).json({ auth: false }); // Agregar mensaje;
    const user = await retrieveUser(email); // Podría obtener la info directamente de la cookie si en ella guardara lo que necesito (además del ID) //
    const { nickname } = user;
    const newToken = jwt.sign(
      {
        id: user._id,
        email: user.email,
      },
      jwtKey,
      {
        //   algorithm: "HS256",
        expiresIn: "12h",
      }
    );
    return res
      .cookie("jwt", newToken, {
        // withCredentials: true,
        maxAge: 1000 * 60 * 60 * 12, // 12 horas //
        httpOnly: true,
        // secure: process.env.NODE_ENV === "production",
      })
      .status(200)
      .json({ auth: true, message: `Hola ${nickname}, bienvenid@` });
  } catch (err) {
    return res
      .status(500)
      .json({ auth: false, message: `Error inesperado, intente más tarde` }); // Revisar código de error //
  }
};

const getTournamentsController = async (req, res) => {
  try {
    const tournaments = await retrieveOngoingTournaments({ ongoing: true });

    res.status(200).json(tournaments);
  } catch (err) {
    // res.status(200).json(tournaments);
    return res.status(500).send("Something went wrong!" + err);
  }
};

const getPlayerInfoFromTournamentsController = async (req, res) => {
  try {
    const tournaments = await retrieveOngoingTournaments({ ongoing: true });

    let playerStatsByTournament = [];

    tournaments.forEach(async (tournament) => {
      let playersFromTournament = tournament.players;

      playersFromTournament.forEach(async (player) => {
        let totalMatchesCount = await totalMatchesFromPlayerByTournament(
          tournament.id,
          player
        );

        let totalWinCount = await totalWinsFromPlayerByTournament(
          tournament.id,
          player
        );

        let totalLossCount = await totalLossesFromPlayerByTournament(
          tournament.id,
          player
        );

        let totalDrawCount = totalMatchesCount - totalWinCount - totalLossCount;

        let totalPointsCount = totalWinCount * 3 + totalDrawCount;

        Promise.all([
          totalMatchesCount,
          totalWinCount,
          totalLossCount,
          totalDrawCount,
          totalPointsCount,
        ])
          .then((values) => {
            let totalMatches = values[0];
            let totalWins = values[1];
            let totalLosses = values[2];
            let totalDraws = values[3];
            let totalPoints = values[4];
            return {
              player,
              tournament: tournament.name,
              totalMatches,
              totalWins,
              totalDraws,
              totalLosses,
              totalPoints,
            };
          })
          .then((object) => {
            playerStatsByTournament.push(object);
            if (
              playerStatsByTournament.length ===
              playersFromTournament.length * tournaments.length
            )
              // REVISAR //
              res.send(playerStatsByTournament);
          });
      });
    });
  } catch (err) {
    return res.status(500).send("Something went wrong!" + err);
  }
};

const getFixtureByTournamentIdController = async (req, res) => {
  const tournamentId = req.params.id;
  const { player, team } = req.query;
  try {
    if (player) {
      const tournament = await retrieveTournamentById(tournamentId);
      const filteredFixture = tournament.fixture.filter(
        (match) => match.playerP1 === player || match.playerP2 === player
      );
      res.status(200).json({ ...tournament, fixture: filteredFixture });
    }
    if (team) {
      const tournament = await retrieveTournamentById(tournamentId);
      const filteredFixture = tournament.fixture.filter(
        (match) =>
          match.teamIdP1 === Number(team) || match.teamIdP2 === Number(team)
      );
      res.status(200).json({ ...tournament, fixture: filteredFixture });
    }
    if (!team && !player) {
      const tournament = await retrieveTournamentById(tournamentId);
      res.status(200).json(tournament);
    }
    // Agregar excepción en caso de error
  } catch (err) {
    return res.status(500).send("Something went wrong!" + err);
  }
};

const getStandingsController = async (req, res) => {
  try {
    const tournaments = await retrieveOngoingTournaments({ ongoing: true });

    const standingsArray = [];

    let counter = 0;

    tournaments.forEach(async (tournament) => {
      const standings = [];

      let matches = await orderMatchesFromTournamentById(tournament.id);

      tournament.teams.forEach(async (team) => {
        let played = matches.filter(
          (element) =>
            element.teamP1 === team.team || element.teamP2 === team.team
        ).length;
        let wins = matches.filter(
          (element) => element.outcome.teamThatWon === team.team
        ).length;
        let draws = matches.filter(
          (element) =>
            (element.teamP1 === team.team || element.teamP2 === team.team) &&
            element.outcome.draw
        ).length;
        let losses = matches.filter(
          (element) => element.outcome.teamThatLost === team.team
        ).length;
        let goalsFor =
          matches
            .filter((element) => element.teamP1 === team.team)
            .reduce((acc, curr) => {
              return acc + curr.scoreP1;
            }, 0) +
          matches
            .filter((element) => element.teamP2 === team.team)
            .reduce((acc, curr) => {
              return acc + curr.scoreP2;
            }, 0);
        let goalsAgainst =
          matches
            .filter((element) => element.teamP1 === team.team)
            .reduce((acc, curr) => {
              return acc + curr.scoreP2;
            }, 0) +
          matches
            .filter((element) => element.teamP2 === team.team)
            .reduce((acc, curr) => {
              return acc + curr.scoreP1;
            }, 0);
        let scoringDifference = goalsFor - goalsAgainst;
        let points = wins * 3 + draws;

        let { id, player, logo, teamCode } = team;

        standings.push({
          id,
          team: team.team,
          player,
          logo,
          teamCode,
          played,
          wins,
          draws,
          losses,
          goalsFor,
          goalsAgainst,
          scoringDifference,
          points,
        });
      });

      let sortedStanding = standings.sort(function (a, b) {
        if (a.points > b.points) return -1;
        if (a.points < b.points) return 1;

        if (a.scoringDifference > b.scoringDifference) return -1;
        if (a.scoringDifference < b.scoringDifference) return 1;

        if (a.goalsFor > b.goalsFor) return -1;
        if (a.goalsFor < b.goalsFor) return 1;

        if (a.goalsAgainst > b.goalsAgainst) return 1;
        if (a.goalsAgainst < b.goalsAgainst) return -1;
      });

      standingsArray.push({
        name: tournament.name,
        tournamentId: tournament.id,
        sortedStanding,
      });

      counter++;

      if (counter === tournaments.length) {
        res.status(200).json(standingsArray);
      }
    });
  } catch (err) {
    return res.status(500).send("Something went wrong!" + err);
  }
};

const getMatchesController = async (req, res) => {
  const { query } = req.query;
  try {
    if (query) {
      const matches = await retrieveMatchesByQuery(query);
      res.json(matches);
    } else {
      const matches = await retrieveMatches(10);
      res.json(matches);
    }
  } catch (err) {
    return res.status(500).send("Something went wrong!" + err);
  }
};

const postUploadGameController = async (req, res) => {
  const tournamentId = req.params.id;
  try {
    const { id, name, format, origin, fixture } = await retrieveTournamentById(
      tournamentId
    );

    let {
      playerP1,
      teamP1,
      scoreP1,
      penaltyScoreP1,
      playerP2,
      teamP2,
      scoreP2,
      penaltyScoreP2,
    } = req.body;

    let rivalOfP1 = playerP2;
    let rivalOfP2 = playerP1;
    let outcome;

    if (scoreP1 - scoreP2 !== 0) {
      scoreP1 > scoreP2
        ? (outcome = {
            playerThatWon: playerP1,
            teamThatWon: teamP1,
            scoreFromTeamThatWon: scoreP1,
            playerThatLost: playerP2,
            teamThatLost: teamP2,
            scoreFromTeamThatLost: scoreP2,
            draw: false,
            penalties: false,
            scoringDifference: Math.abs(scoreP1 - scoreP2), // Es indistinto el orden, pues calculo valor absoluto.
          })
        : (outcome = {
            playerThatWon: playerP2,
            teamThatWon: teamP2,
            scoreFromTeamThatWon: scoreP2,
            playerThatLost: playerP1,
            teamThatLost: teamP1,
            scoreFromTeamThatLost: scoreP1,
            draw: false,
            penalties: false,
            scoringDifference: Math.abs(scoreP1 - scoreP2), // Es indistinto el orden, pues calculo valor absoluto.
          });
    } else if (scoreP1 - scoreP2 === 0 && penaltyScoreP1 && penaltyScoreP2) {
      // Empate, y hubo penales
      penaltyScoreP1 > penaltyScoreP2
        ? (outcome = {
            playerThatWon: playerP1,
            teamThatWon: teamP1,
            scoreFromTeamThatWon: penaltyScoreP1,
            playerThatLost: playerP2,
            teamThatLost: teamP2,
            scoreFromTeamThatLost: penaltyScoreP2,
            draw: true,
            penalties: true,
            scoringDifference: 0,
          })
        : (outcome = {
            playerThatWon: playerP2,
            teamThatWon: teamP2,
            scoreFromTeamThatWon: penaltyScoreP2,
            playerThatLost: playerP1,
            teamThatLost: teamP1,
            scoreFromTeamThatLost: penaltyScoreP1,
            draw: true,
            penalties: true,
            scoringDifference: 0,
          });
    } else {
      // Empate, pero no hubo penales!
      outcome = {
        playerThatWon: "none",
        teamThatWon: "none",
        scoreFromTeamThatWon: "none",
        playerThatLost: "none",
        teamThatLost: "none",
        scoreFromTeamThatLost: "none",
        draw: true,
        penalties: false,
        scoringDifference: 0,
      };
    }

    const match = {
      playerP1,
      teamP1,
      scoreP1,
      rivalOfP1,
      playerP2,
      teamP2,
      scoreP2,
      rivalOfP2,
      outcome,
      tournament: {
        name,
        id,
        format,
        origin,
      },
    };
    if (!match.outcome.draw) {
      // Para actualizar las rachas y la tabla, SI NO EMPATAN

      // CREO EL PARTIDO Y LO SUBO A LA BD, TAMBIÉN OBTENGO SU ID //

      const createdMatch = await originateMatch(match);

      const matchId = createdMatch.id;

      // ACTUALIZO EL FIXTURE //

      let index = fixture.findIndex((element) => {
        return (
          element.teamP1 === match.outcome.teamThatWon &&
          element.teamP2 === match.outcome.teamThatLost
        );
      });

      let response;

      if (index !== -1) {
        response = await modifyFixtureFromTournamentVersionOne(
          tournamentId,
          match.outcome.teamThatWon,
          match.outcome.teamThatLost,
          match.outcome.scoreFromTeamThatWon,
          match.outcome.scoreFromTeamThatLost,
          matchId
        );
      }

      if (index === -1) {
        response = await modifyFixtureFromTournamentVersionTwo(
          tournamentId,
          match.outcome.teamThatWon,
          match.outcome.teamThatLost,
          match.outcome.scoreFromTeamThatWon,
          match.outcome.scoreFromTeamThatLost,
          matchId
        );
      }
      res.status(200).json(response);
    }
    // SI EMPATAN //
    else {
      // CREO EL PARTIDO Y LO SUBO A LA BD, TAMBIÉN OBTENGO SU ID //

      const createdMatch = await originateMatch(match);

      const matchId = createdMatch.id;

      // ACTUALIZO EL FIXTURE //

      let index = fixture.findIndex((element) => {
        return element.teamP1 === teamP1 && element.teamP2 === teamP2;
      });

      let response;

      if (index !== -1) {
        response = await modifyFixtureFromTournamentVersionOne(
          tournamentId,
          teamP1,
          teamP2,
          scoreP1,
          scoreP2,
          matchId
        );
      }

      if (index === -1) {
        response = await modifyFixtureFromTournamentVersionTwo(
          tournamentId,
          teamP1,
          teamP2,
          scoreP1,
          scoreP2,
          matchId
        );
      }
      res.status(200).json(response);
    }
  } catch (err) {
    return res.status(500).send("Something went wrong!" + err);
  }
};

const putModifyGameController = async (req, res) => {
  const tournamentId = req.params.id;
  const matchId = req.params.match;
  const { teamP1, teamP2, scoreP1, scoreP2, playerP1, playerP2 } = req.body;
  try {
    // Actualizo face-to-face //

    const match = await retrieveMatchById(matchId);

    let outcome;

    if (scoreP1 - scoreP2 !== 0) {
      scoreP1 > scoreP2
        ? (outcome = {
            playerThatWon: playerP1,
            teamThatWon: teamP1,
            scoreFromTeamThatWon: Number(scoreP1),
            playerThatLost: playerP2,
            teamThatLost: teamP2,
            scoreFromTeamThatLost: Number(scoreP2),
            draw: false,
            penalties: false,
            scoringDifference: Math.abs(scoreP1 - scoreP2),
          })
        : (outcome = {
            playerThatWon: playerP2,
            teamThatWon: teamP2,
            scoreFromTeamThatWon: Number(scoreP2),
            playerThatLost: playerP1,
            teamThatLost: teamP1,
            scoreFromTeamThatLost: Number(scoreP1),
            draw: false,
            penalties: false,
            scoringDifference: Math.abs(scoreP1 - scoreP2),
          });
    } else {
      // Empate
      outcome = {
        playerThatWon: "none",
        teamThatWon: "none",
        scoreFromTeamThatWon: "none",
        playerThatLost: "none",
        teamThatLost: "none",
        scoreFromTeamThatLost: "none",
        draw: true,
        penalties: false,
        scoringDifference: 0,
      };
    }

    if (match) {
      match.teamP1 === teamP1
        ? await match.updateOne({ scoreP1, scoreP2, outcome })
        : await match.updateOne({
            scoreP1: scoreP2,
            scoreP2: scoreP1,
            outcome,
          });
    }

    // Actualizo fixture //

    const response = await modifyFixtureFromTournamentWhenEditing(
      tournamentId,
      teamP1,
      teamP2,
      scoreP1,
      scoreP2
    );

    res.status(200).json(response);
  } catch (err) {
    return res.status(500).send("Something went wrong!" + err);
  }
};

const deleteGameController = async (req, res) => {
  const tournamentId = req.params.id;
  const matchId = req.params.match;

  try {
    await deleteMatchById(matchId); // Borro el partido de la colección face-to-face //

    const response = await modifyFixtureFromTournamentWhenRemoving(
      tournamentId,
      matchId
    ); // Actualizo fixture //

    res.status(200).json(response);
  } catch (err) {
    return res.status(500).send("Something went wrong!" + err);
  }
};

const getStatisticsController = async (req, res) => {
  try {
    const players = await retrieveAllPlayers();
    const response = { playerStats: [], recentMatches: [], accolades: {} };
    let count = 0;

    let recentMatches = await retrieveMatches(4);
    recentMatches.forEach((match) => {
      response.recentMatches.push({
        playerP1: match.playerP1,
        playerP2: match.playerP2,
        teamP1: match.teamP1,
        teamP2: match.teamP2,
        scoreP1: match.scoreP1,
        scoreP2: match.scoreP2,
        tournament: match.tournament.name,
        date: new Date(
          parseInt(match.id.substring(0, 8), 16) * 1000
        ).toLocaleDateString(),
      });
    });

    const playerWins = [];
    const playerDraws = [];
    const playerLosses = [];

    players.forEach(async (player) => {
      let totalMatches = await totalMatchesFromPlayer(player.name);
      let wins = await totalWinsFromPlayer(player.name);
      let draws = await totalDrawsFromPlayer(player.name);
      let losses = await totalLossesFromPlayer(player.name);

      playerWins.push({
        player: player.name,
        wins,
      });

      playerDraws.push({
        player: player.name,
        draws,
      });

      playerLosses.push({
        player: player.name,
        losses,
      });

      response.playerStats.push({
        player: player.name,
        wins,
        draws,
        losses,
        totalMatches,
        effectiveness: Number(
          (((wins * 3 + draws) / (totalMatches * 3)) * 100).toFixed(2)
        ),
      });

      count++;
      if (count === players.length) {
        sortedPlayerWins = playerWins.sort((a, b) =>
          a.wins > b.wins ? -1 : 1
        );
        sortedPlayerDraws = playerDraws.sort((a, b) =>
          a.draws > b.draws ? -1 : 1
        );
        sortedPlayerLosses = playerLosses.sort((a, b) =>
          a.losses > b.losses ? -1 : 1
        );
        response.accolades.mostWins = {
          player: sortedPlayerWins[0].player,
          wins: sortedPlayerWins[0].wins,
        };
        response.accolades.mostDraws = {
          player: sortedPlayerDraws[0].player,
          draws: sortedPlayerDraws[0].draws,
        };
        response.accolades.mostLosses = {
          player: sortedPlayerLosses[0].player,
          losses: sortedPlayerLosses[0].losses,
        };
        res.status(200).send(response);
      }
    });
  } catch (err) {
    return res.status(500).send("Something went wrong!" + err);
  }
};

// const getStatisticsByIdController = async (req, res) => {

//   try {

//     const players = await retrieveAllPlayers();
//     const response = { playerStats: [], recentMatches: [] };
//     let count = 0;

//     players.forEach(async (player) => {
//       let totalMatches = await totalMatchesFromPlayer(player.name);
//       let wins = await totalWinsFromPlayer(player.name);
//       let draws = await totalDrawsFromPlayer(player.name);

//       response.playerStats.push({
//         player: player.name,
//         wins,
//         totalMatches,
//         effectiveness: Number(((((wins * 3) + draws) / (totalMatches * 3)) * 100).toFixed(2)),
//       })
//       let recentMatches = await retrieveRecentMatchesFromPlayer(player.name);
//       let matches = recentMatches.map(match => {
//         return {
//           playerP1: match.playerP1,
//           playerP2: match.playerP2,
//           teamP1: match.teamP1,
//           teamP2: match.teamP2,
//           scoreP1: match.scoreP1,
//           scoreP2: match.scoreP2,
//           tournament: match.tournament.name,
//           date: new Date(parseInt(match.id.substring(0, 8), 16) * 1000).toLocaleDateString()
//         }
//       })
//       let streak = recentMatches.map(match => {
//         if (match.outcome.playerThatWon === player.name) return "w";
//         if (match.outcome.playerThatLost === player.name) return "l";
//         if (match.outcome.draw) return "d";
//       });
//       let goalsFor = recentMatches.map(match => {
//         if (match.playerP1 === player.name) return match.scoreP1;
//         if (match.playerP2 === player.name) return match.scoreP2;
//       });
//       response.recentMatches.push({
//         player: player.name,
//         matches,
//         streak,
//         goalsFor
//       })
//       count++;
//       if (count === players.length) res.status(200).send(response);
//     });

//   } catch (err) {
//     return res.status(500).send("Something went wrong!" + err);
//   }
// };

module.exports = {
  getHomeController,
  postRegisterController,
  postLoginController,
  postLogoutController,
  getIsUserAuthenticatedController,
  getTournamentsController,
  getPlayerInfoFromTournamentsController,
  getFixtureByTournamentIdController,
  getStandingsController,
  getMatchesController,
  postUploadGameController,
  putModifyGameController,
  deleteGameController,
  getStatisticsController,
};

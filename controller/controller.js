const {
  retrieveAllPlayers,
  retrievePlayer,
  retrieveRecentMatchesFromPlayer,
  retrieveWonMatchesFromPlayer,
  totalMatchesFromAPlayerTeam,
  totalMatchesFromPlayerByTournament,
  totalWinsFromPlayerByTournament,
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
    const tournaments = await retrieveTournaments({});
    res.status(200).json(tournaments);
  } catch (err) {
    return res.status(500).send("Something went wrong!" + err);
  }
};

const getTournamentsController = async (req, res) => {
  try {
    const tournaments = await retrieveOngoingTournaments({ ongoing: true });
    res.status(200).json(tournaments);
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
      const matches = await retrieveMatches();
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
    const response = { playerStats: [], recentMatches: [] };
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

    players.forEach(async (player) => {
      let totalMatches = await totalMatchesFromPlayer(player.name);
      let wins = await totalWinsFromPlayer(player.name);
      let draws = await totalDrawsFromPlayer(player.name);

      response.playerStats.push({
        player: player.name,
        wins,
        totalMatches,
        effectiveness: Number(
          (((wins * 3 + draws) / (totalMatches * 3)) * 100).toFixed(2)
        ),
      });
      count++;
      if (count === players.length) res.status(200).send(response);
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
  getTournamentsController,
  getFixtureByTournamentIdController,
  getStandingsController,
  getMatchesController,
  postUploadGameController,
  putModifyGameController,
  deleteGameController,
  getStatisticsController,
};

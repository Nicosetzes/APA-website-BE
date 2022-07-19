const {
	orderPlayersByLongestWinningStreak,
	orderPlayersByLongestDrawStreak,
	orderPlayersByLongestLosingStreak,
	retrievePlayer,
	retrieveRecentMatchesFromPlayer,
	retrieveWonMatchesFromPlayer,
	totalMatchesFromAPlayerTeam,
	totalMatchesFromPlayerByTournament,
	totalWinsFromPlayerByTournament,
	totalMatchesFromPlayer,
	retrieveTeamsWithAtLeastOneWinFromPlayer,
	totalWinsFromPlayer,
	totalLossesFromPlayer,
	orderMatchesByScoringDifference,
	orderMatchesFromTournamentById,
	originateMatch,
	retrieveMatchById,
	deleteMatchById,
	retrieveTournamentNames,
	retrieveOngoingTournaments,
	retrieveTournamentById,
	originateTournament,
	retrieveTournaments,
	modifyFixtureFromTournamentVersionOne,
	modifyFixtureFromTournamentVersionTwo,
	modifyFixtureFromTournamentWhenEditing,
	modifyFixtureFromTournamentWhenRemoving,
	modifyTeamsFromTournament,
	modifyFixtureFromTournamentWhenCreated
} = require("./../service/service.js");

/* -------------------- HOME -------------------- */

const getHomeController = async (req, res) => {
	console.log("LLEGUÉ A GETHOMECONTROLLER")
	try {
		const tournaments = await retrieveTournaments({});
		console.log(tournaments);
		res.status(200).json(tournaments);
	}
	catch (err) {
		return res.status(500).send("Something went wrong!" + err);
	}
};

const getFixtureController = async (req, res) => {
	try {
		const tournaments = await retrieveOngoingTournaments({ ongoing: true });
		res.status(200).json(tournaments);
	}
	catch (err) {
		return res.status(500).send("Something went wrong!" + err);
	}
};

const getFixtureByTournamentIdController = async (req, res) => {
	const tournamentId = req.params.id;
	try {
		const tournament = await retrieveTournamentById(tournamentId);
		if (!tournament) {
			res.send("ERROR");
			return;
		}
		res.status(200).json(tournament);
	}
	catch (err) {
		return res.status(500).send("Something went wrong!" + err);
	}
};

const getFixtureByTournamentIdAndTeamOrPlayerIdController = async (req, res) => {
	const { tournamentId, teamIdOrPlayerName } = req.params;
	try {
		const tournament = await retrieveTournamentById(tournamentId);
		if (!tournament) {
			res.send("ERROR");
			return;
		}

		const tournamentName = tournament.name;

		if (isNaN(teamIdOrPlayerName)) {
			// El param es el playerName

			const playerName = teamIdOrPlayerName;

			const filteredFixtureFromTournament = tournament.fixture.filter(
				(element) => {
					return (
						element.playerP1 === playerName || element.playerP2 === playerName
					);
				}
			);

			res.status(200).json({ playerName, tournamentName, tournamentId, filteredFixtureFromTournament });

		} else {
			// El param es el teamId

			const teamId = teamIdOrPlayerName;

			const filteredFixtureFromTournament = tournament.fixture.filter(
				(element) => {
					return element.teamIdP1 == teamId || element.teamIdP2 == teamId;
				}
			);

			let teamName;

			if (filteredFixtureFromTournament[0].teamIdP1 == teamId) {
				teamName = filteredFixtureFromTournament[0].teamP1;
			} else {
				teamName = filteredFixtureFromTournament[0].teamP2;
			}

			res.status(200).json({ teamName, tournamentName, tournamentId, filteredFixtureFromTournament });
		}
	}
	catch (err) {
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

	}
	catch (err) {
		return res.status(500).send("Something went wrong!" + err);
	}
};

const postUploadGameController = async (req, res) => {
	const tournamentId = req.params.id;
	try {

		const { id, name, format, origin, fixture } = await retrieveTournamentById(tournamentId);

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

			if (index !== -1) {
				await modifyFixtureFromTournamentVersionOne(
					tournamentId,
					match.outcome.teamThatWon,
					match.outcome.teamThatLost,
					match.outcome.scoreFromTeamThatWon,
					match.outcome.scoreFromTeamThatLost,
					matchId
				)
			}

			if (index === -1) {
				await modifyFixtureFromTournamentVersionTwo(
					tournamentId,
					match.outcome.teamThatWon,
					match.outcome.teamThatLost,
					match.outcome.scoreFromTeamThatWon,
					match.outcome.scoreFromTeamThatLost,
					matchId
				)
			}

			// ACTUALIZO RACHAS //

			let winner = await retrievePlayer(match.outcome.playerThatWon);
			let loser = await retrievePlayer(match.outcome.playerThatWon);

			winner.losingStreak = 0;
			winner.drawStreak = 0;
			winner.winningStreak++;

			if (winner.winningStreak > winner.longestWinningStreak) {
				winner.longestWinningStreak++;
			}

			loser.winningStreak = 0;
			loser.drawStreak = 0;
			loser.losingStreak++;

			if (loser.losingStreak > loser.longestLosingStreak) {
				loser.longestLosingStreak++;
			}

			await winner.save();
			await loser.save();
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

			if (index !== -1) {
				await modifyFixtureFromTournamentVersionOne(
					tournamentId,
					match.outcome.teamThatWon,
					match.outcome.teamThatLost,
					match.outcome.scoreFromTeamThatWon,
					match.outcome.scoreFromTeamThatLost,
					matchId
				)
			}

			if (index === -1) {
				await modifyFixtureFromTournamentVersionTwo(
					tournamentId,
					match.outcome.teamThatWon,
					match.outcome.teamThatLost,
					match.outcome.scoreFromTeamThatWon,
					match.outcome.scoreFromTeamThatLost,
					matchId
				)
			}

			// ACTUALIZO RACHAS //

			let playerOne = await retrievePlayer(playerP1);
			let playerTwo = await retrievePlayer(playerP2);

			playerOne.winningStreak = 0;
			playerOne.losingStreak = 0;
			playerOne.drawStreak++;

			playerTwo.winningStreak = 0;
			playerTwo.losingStreak = 0;
			playerTwo.drawStreak++;

			if (playerOne.drawStreak > playerOne.longestDrawStreak) {
				playerOne.longestDrawStreak++;
			}

			if (playerTwo.drawStreak > playerTwo.longestDrawStreak) {
				playerTwo.longestDrawStreak++;
			}

			await playerOne.save();
			await playerTwo.save();
		}
		res.status(200).json(createdMatch);
	}
	catch (err) {
		return res.status(500).send("Something went wrong!" + err);
	}
};

const putModifyGameController = async (req, res) => {
	const tournamentId = req.params.id;
	const matchId = req.params.matchId;
	const { teamP1, teamP2, scoreP1, scoreP2, playerP1, playerP2 } = req.body;
	try {
		// Actualizo face-to-face //

		const match = await retrieveMatchById(matchId)

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

		await modifyFixtureFromTournamentWhenEditing(tournamentId, teamP1, teamP2, scoreP1, scoreP2);

		// res.status(200).json(match);
	}
	catch (err) {
		return res.status(500).send("Something went wrong!" + err);
	}
};

const deleteGameController = async (req, res) => {

	const tournamentId = req.params.id;
	const matchId = req.params.matchId;

	try {

		await deleteMatchById(matchId); // Borro el partido de la colección face-to-face //

		await modifyFixtureFromTournamentWhenRemoving(tournamentId, matchId); // Actualizo fixture //

		// res.status(200).json()

	}
	catch (err) {
		return res.status(500).send("Something went wrong!" + err);
	}
};

module.exports = ({
	getHomeController,
	getFixtureController,
	getFixtureByTournamentIdController,
	getFixtureByTournamentIdAndTeamOrPlayerIdController,
	getStandingsController,
	postUploadGameController,
	putModifyGameController,
	deleteGameController
});
/* -------------------- DATABASE -------------------- */

const mongoose = require("mongoose");

mongoose
	.connect(
		`mongodb://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@cluster0-shard-00-00.i6ffr.mongodb.net:27017,cluster0-shard-00-01.i6ffr.mongodb.net:27017,cluster0-shard-00-02.i6ffr.mongodb.net:27017/myFirstDatabase?ssl=true&replicaSet=atlas-vzvty3-shard-0&authSource=admin&retryWrites=true&w=majority`
	)
	.then(() => console.log("Base de datos MongoDB conectada"))
	.catch((err) => console.log(err));

/* -------------- MODELS FOR MONGOOSE -------------- */

const tournamentsModel = require("./models/tournaments.js"); // Modelo mongoose para la carga de torneos!

const matchesModel = require("./models/matches.js"); // Modelo mongoose para la carga de los mano a mano!

const usersModel = require("./models/users.js"); // Modelo mongoose para la carga de usuarios!

const playersModel = require("./models/players.js"); // Modelo mongoose para la carga de información de jugadores humanos!

/* -------------- METHODS -------------- */

/* -------------- playersModel -------------- */

const sortPlayersByLongestWinningStreak = async () => {
	const players = await playersModel
		.find({}, "name longestWinningStreak")
		.sort({
			longestWinningStreak: -1,
			longestDrawStreak: -1,
			longestLosingStreak: 1,
		});
	return players;
};

const sortPlayersByLongestDrawStreak = async () => {
	const players = await playersModel
		.find({}, "name longestDrawStreak")
		.sort({ longestDrawStreak: -1 });
	return players;
};

const sortPlayersByLongestLosingStreak = async () => {
	const players = await playersModel
		.find({}, "name longestLosingStreak")
		.sort({
			longestLosingStreak: -1,
			longestWinningStreak: -1,
			longestDrawStreak: -1,
		});
	return players;
};

const findPlayer = async (playerQuery) => {
	const player = await playersModel.findOne({ name: playerQuery });
	return player;
};

/* -------------- matchesModel -------------- */

const findRecentMatchesFromPlayer = async (playerQuery) => {
	const matches = await matchesModel
		.find({ $or: [{ playerP1: playerQuery }, { playerP2: playerQuery }] })
		.limit(10)
		.sort({ _id: -1 });
	return matches;
};

const findWonMatchesFromPlayer = async (playerQuery) => {
	const matches = await matchesModel.find(
		{ "outcome.playerThatWon": playerQuery, "outcome.draw": false },
		"outcome"
	);
	return matches;
};

const countTotalMatchesFromAPlayerTeam = async (playerQuery, teamQuery) => {
	let matches = await matchesModel.countDocuments({
		$or: [
			{
				$and: [{ playerP1: playerQuery }, { teamP1: teamQuery }],
			},
			{
				$and: [{ playerP2: playerQuery }, { teamP2: teamQuery }],
			},
		],
	});
	return matches;
};

const countTotalMatchesFromPlayerByTournament = async (tournamentId, playerQuery) => {
	let matches = await matchesModel.countDocuments({
		"tournament.id": tournamentId,
		$or: [{ playerP1: playerQuery }, { playerP2: playerQuery }],
	});
	return matches;
};

const countTotalWinsFromPlayerByTournament = async (tournamentId, playerQuery) => {
	let matches = await matchesModel.countDocuments({
		"tournament.id": tournamentId,
		"outcome.playerThatWon": playerQuery,
		"outcome.draw": false,
	});
	return matches;
};

const countTotalMatchesFromPlayer = async (playerQuery) => {
	const matches = await matchesModel.countDocuments({
		$or: [{ playerP1: playerQuery }, { playerP2: playerQuery }],
	});
	return matches;
};

const findTeamsWithAtLeastOneWinFromPlayer = async (playerQuery) => {
	const teams = await matchesModel.find({
		"outcome.playerThatWon": playerQuery,
		"outcome.draw": false
	},
		"outcome.teamThatWon"
	);
	return teams;
};

const countTotalWinsFromPlayer = async (playerQuery) => {
	const wins = await matchesModel.countDocuments({
		"outcome.playerThatWon": playerQuery,
		"outcome.draw": false,
	});
	return wins;
};

const countTotalLossesFromPlayer = async (playerQuery) => {
	const losses = await matchesModel.countDocuments({
		"outcome.playerThatLost": playerQuery,
		"outcome.draw": false,
	});
	return wins;
};

const sortMatchesByScoringDifference = async () => {
	const matches = await matchesModel
		.find({ "outcome.draw": false }, "playerP1 scoreP1 teamP1 playerP2 scoreP2 teamP2 tournament")
		.sort({
			"outcome.scoringDifference": -1,
			"outcome.scoreFromTeamThatWon": -1,
		})
		.limit(5);
	return matches;
}

const sortMatchesFromTournamentById = async (tournamentId) => {
	let matches = await matchesModel
		.find({ "tournament.id": tournamentId }, "teamP1 scoreP1 teamP2 scoreP2 outcome")
		.sort({ _id: -1 });
	return matches;
}

// ROUTES FOR FACE-TO-FACE //

// const findMatchesFromTournamentForFaceToFace = async (tournamentId) => {
// 	const matches = await matchesModel.find({ "tournament.id": tournamentId }, "playerP1 teamP1 scoreP1 playerP2 teamP2 scoreP2");
// 	return matches;
// }

const createMatch = async (match) => {
	const newMatch = await matchesModel.create(match);
	return newMatch;
}

const findMatchById = async (id) => {
	const match = await matchesModel.findById(id, "teamP1 teamP2 outcome");
	return match;
}

const removeMatchById = async (id) => {
	const deletedMatch = await matchesModel.findByIdAndRemove(id);
	return deletedMatch;
}

/* -------------- tournamentsModel -------------- */

const findTournamentNames = async () => {
	const tournaments = await tournamentsModel.find({}, "name");
	return tournaments;
};

const findOngoingTournaments = async () => {
	const tournaments = await tournamentsModel.find({ ongoing: true }, "name teams");
	return tournaments;
};

const findTournamentById = async (id) => {
	const tournament = await tournamentsModel.findById(id);
	return tournament;
};

const createTournament = async (tournament) => {
	const newTournament = await tournamentsModel.create(tournament);
	return newTournament;
};

const findTournaments = async () => {
	const tournaments = await tournamentsModel.find({}, "id name status");
	return tournaments;
};

const updateFixtureFromTournamentVersionOne = async (tournamentId, teamThatWon, teamThatLost, scoreFromTeamThatWon, scoreFromTeamThatLost, matchId) => {
	const updatedTournament = await tournamentsModel.updateOne({
		_id: tournamentId,
		fixture: {
			$elemMatch: {
				teamP1: teamThatWon,
				teamP2: teamThatLost,
			},
		},
	}, {
		$set: {
			"fixture.$.scoreP1": Number(scoreFromTeamThatWon),
			"fixture.$.scoreP2": Number(scoreFromTeamThatLost),
			"fixture.$.matchId": matchId,
		},
	}
	);
	return updatedTournament;
};

const updateFixtureFromTournamentVersionTwo = async (tournamentId, teamThatWon, teamThatLost, scoreFromTeamThatWon, scoreFromTeamThatLost, matchId) => {
	const updatedTournament = await tournamentsModel.updateOne({
		_id: tournamentId,
		fixture: {
			$elemMatch: {
				teamP1: teamThatLost,
				teamP2: teamThatWon,
			},
		},
	}, {
		$set: {
			"fixture.$.scoreP1": Number(scoreFromTeamThatLost),
			"fixture.$.scoreP2": Number(scoreFromTeamThatWon),
			"fixture.$.matchId": matchId,
		},
	}
	);
	return updatedTournament;
};

const updateFixtureFromTournamentWhenEditing = async (tournamentId, teamP1, teamP2, scoreP1, scoreP2) => {
	const updatedTournament = await tournamentsModel.updateOne(
		{
			_id: tournamentId,
			fixture: {
				$elemMatch: {
					teamP1,
					teamP2,
				},
			},
		},
		{
			$set: {
				"fixture.$.scoreP1": Number(scoreP1),
				"fixture.$.scoreP2": Number(scoreP2),
			},
		}
	);
	return updatedTournament;
};

const updateFixtureFromTournamentWhenRemoving = async (tournamentId, matchId) => {
	const updatedTournament = await tournamentsModel.updateOne(
		{
			_id: tournamentId,
			fixture: {
				$elemMatch: {
					matchId,
				},
			},
		},
		{
			$unset: {
				"fixture.$.scoreP1": "",
				"fixture.$.scoreP2": "",
			},
		}
	);
	return updatedTournament;
};

const updateTeamsFromTournament = async (tournamentId, team, player) => {
	const updatedTournament = await tournamentsModel.updateOne({
		_id: tournamentId, "teams.team": team
	}, {
		$set: {
			"teams.$.player": player,
		},
	}
	);
	return updatedTournament;
};

const updateFixtureFromTournamentWhenCreated = async (tournamentId, fixture) => {
	const updatedTournament = await tournamentsModel.findByIdAndUpdate(tournamentId, {
		fixture,
		fixtureStatus: true,
	});
	return updatedTournament;
};

module.exports = {
	sortPlayersByLongestWinningStreak,
	sortPlayersByLongestDrawStreak,
	sortPlayersByLongestLosingStreak,
	findPlayer,
	findRecentMatchesFromPlayer,
	findWonMatchesFromPlayer,
	countTotalMatchesFromAPlayerTeam,
	countTotalMatchesFromPlayerByTournament,
	countTotalWinsFromPlayerByTournament,
	countTotalMatchesFromPlayer,
	findTeamsWithAtLeastOneWinFromPlayer,
	countTotalWinsFromPlayer,
	countTotalLossesFromPlayer,
	sortMatchesByScoringDifference,
	sortMatchesFromTournamentById,
	createMatch,
	findMatchById,
	removeMatchById,
	findTournamentNames,
	findOngoingTournaments,
	findTournamentById,
	createTournament,
	findTournaments,
	updateFixtureFromTournamentVersionOne,
	updateFixtureFromTournamentVersionTwo,
	updateFixtureFromTournamentWhenEditing,
	updateFixtureFromTournamentWhenRemoving,
	updateTeamsFromTournament,
	updateFixtureFromTournamentWhenCreated
}
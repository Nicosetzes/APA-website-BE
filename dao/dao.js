/* -------------------- DATABASE -------------------- */

const mongoose = require("mongoose")

mongoose
    .connect(
        `mongodb://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@cluster0-shard-00-00.i6ffr.mongodb.net:27017,cluster0-shard-00-01.i6ffr.mongodb.net:27017,cluster0-shard-00-02.i6ffr.mongodb.net:27017/myFirstDatabase?ssl=true&replicaSet=atlas-vzvty3-shard-0&authSource=admin&retryWrites=true&w=majority`
    )
    .then(() => console.log("Base de datos MongoDB conectada"))
    .catch((err) => console.log(err))

/* -------------- MODELS FOR MONGOOSE -------------- */

const tournamentsModel = require("./models/tournaments.js") // Modelo mongoose para la carga de torneos!

const matchesModel = require("./models/matches.js") // Modelo mongoose para la carga de los mano a mano!

const usersModel = require("./models/users.js") // Modelo mongoose para la carga de usuarios!

/* -------------- METHODS -------------- */

/* -------------- usersModel -------------- */

const createUser = async (user) => {
    const newUser = await usersModel.create(user)
    return newUser
}

const findUserById = async (id) => {
    const foundUser = await usersModel.findById(id)
    return foundUser
}

const findUserByUserName = async (email) => {
    const foundUser = await usersModel.findOne({ email })
    return foundUser
}

const findAllUsers = async () => {
    const foundUsers = await usersModel.find({})
    return foundUsers
}

/* -------------- matchesModel -------------- */

const findRecentMatchesFromPlayer = async (playerQuery) => {
    const matches = await matchesModel
        .find(
            {
                played: { $ne: false },
                valid: { $ne: false },
                $or: [
                    { "playerP1.name": playerQuery },
                    { "playerP2.name": playerQuery },
                ],
            },
            "playerP1 teamP1 scoreP1 playerP2 teamP2 scoreP2 tournament outcome updatedAt"
        )
        .limit(10)
        .sort({ updatedAt: -1, _id: -1 })
    return matches
}

const findWonMatchesFromPlayer = async (playerQuery) => {
    const matches = await matchesModel.find(
        { "outcome.playerThatWon": playerQuery, "outcome.draw": false },
        "outcome"
    )
    return matches
}

const countTotalMatchesFromAPlayerTeam = async (playerQuery, teamQuery) => {
    let matches = await matchesModel.countDocuments({
        $or: [
            {
                $and: [
                    { "playerP1.name": playerQuery },
                    { "teamP1.name": teamQuery },
                ],
            },
            {
                $and: [
                    { "playerP2.name": playerQuery },
                    { "teamP2.name": teamQuery },
                ],
            },
        ],
    })
    return matches
}

const countTotalMatchesFromPlayerByTournament = async (
    tournamentId,
    playerQuery
) => {
    let matches = await matchesModel.countDocuments({
        "tournament.id": tournamentId,
        $or: [
            { "playerP1.name": playerQuery },
            { "playerP2.name": playerQuery },
        ],
    })
    return matches
}

const countTotalWinsFromPlayerByTournament = async (
    tournamentId,
    playerQuery
) => {
    let matches = await matchesModel.countDocuments({
        "tournament.id": tournamentId,
        "outcome.playerThatWon": playerQuery,
        "outcome.draw": false,
    })
    return matches
}

const countTotalLossesFromPlayerByTournament = async (
    tournamentId,
    playerQuery
) => {
    let matches = await matchesModel.countDocuments({
        "tournament.id": tournamentId,
        "outcome.playerThatLost": playerQuery,
        "outcome.draw": false,
    })
    return matches
}

const countTotalMatchesFromPlayer = async (playerQuery) => {
    const matches = await matchesModel.countDocuments({
        $or: [
            { "playerP1.name": playerQuery },
            { "playerP2.name": playerQuery },
        ],
    })
    return matches
}

const findTeamsWithAtLeastOneWinFromPlayer = async (playerQuery) => {
    const teams = await matchesModel.find(
        {
            "outcome.playerThatWon": playerQuery,
            "outcome.draw": false,
        },
        "outcome.teamThatWon"
    )
    return teams
}

const countTotalWinsFromPlayer = async (playerQuery) => {
    const wins = await matchesModel.countDocuments({
        "outcome.playerThatWon": playerQuery,
        "outcome.draw": false,
    })
    return wins
}

const countTotalDrawsFromPlayer = async (playerQuery) => {
    const draws = await matchesModel.countDocuments({
        $and: [
            {
                $or: [
                    { "playerP1.name": playerQuery },
                    { "playerP2.name": playerQuery },
                ],
            },
            { "outcome.draw": true },
        ],
    })
    return draws
}

const countTotalLossesFromPlayer = async (playerQuery) => {
    const losses = await matchesModel.countDocuments({
        "outcome.playerThatLost": playerQuery,
        "outcome.draw": false,
    })
    return losses
}

const sortMatchesByScoringDifference = async () => {
    const matches = await matchesModel
        .find(
            { "outcome.draw": false },
            "playerP1 scoreP1 teamP1 playerP2 scoreP2 teamP2 tournament"
        )
        .sort({
            "outcome.scoringDifference": -1,
            "outcome.scoreFromTeamThatWon": -1,
        })
        .limit(5)
    return matches
}

const sortMatchesFromTournamentById = async (tournamentId) => {
    let matches = await matchesModel
        .find(
            {
                "tournament.id": tournamentId,
                played: true,
                type: { $ne: "playin" },
            },
            "playerP1 teamP1 scoreP1 playerP2 teamP2 scoreP2 outcome tournament updatedAt"
        )
        .sort({ updatedAt: -1, _id: -1 })
    return matches
}

// const sortMatchesFromOngoingTournaments = async () => {

//     const tournaments = await tournamentsModel.find()

//     const matches = await matchesModel.find({

//     })
// }

const createMatch = async (match) => {
    const newMatch = await matchesModel.create(match)
    return newMatch
}

const createManyMatches = async (matchesToBePlayed) => {
    const newMatches = await matchesModel.insertMany(matchesToBePlayed)
    return newMatches
}

const updateMatchResult = async (matchId, scoreP1, scoreP2, outcome) => {
    const uploadedMatch = await matchesModel.findByIdAndUpdate(
        matchId,
        {
            scoreP1,
            scoreP2,
            outcome,
            played: true,
        },
        { new: true } // Returns the updated document, not the original
    )
    return uploadedMatch
}

const updateMatchResultToRemoveIt = async (matchId) => {
    const removedMatchResult = await matchesModel.findByIdAndUpdate(
        matchId,
        {
            $unset: {
                scoreP1: 1,
                scoreP2: 1,
                outcome: 1,
            },
            played: false,
        },
        { new: true } // Returns the updated document, not the original
    )
    return removedMatchResult
}

const findMatchById = async (id) => {
    const match = await matchesModel.findById(id, "teamP1 teamP2 outcome")
    return match
}

const removeMatchById = async (id) => {
    const deletedMatch = await matchesModel.findByIdAndRemove(id)
    return deletedMatch
}

const findMatchesByQuery = async (query) => {
    let matches = await matchesModel
        .find({
            played: true,
            $or: [
                { "teamP1.name": { $regex: query, $options: "i" } },
                { "teamP2.name": { $regex: query, $options: "i" } },
            ],
        })
        .sort({ updatedAt: -1, _id: -1 })
    return matches
}

const findMatchesByTournamentId = async (id) => {
    let matches = await matchesModel.find({
        "tournament.id": id,
        // type: "regular", // Activar a futuro //
    })
    return matches
}

const findMatches = async (qty) => {
    let matches = await matchesModel
        .find({
            played: { $ne: false },
            valid: { $ne: false },
        })
        .sort({ updatedAt: -1, _id: -1 })
        .limit(qty)
    return matches
}

/* -------------- tournamentsModel -------------- */

const findTournamentNames = async () => {
    const tournaments = await tournamentsModel
        .find({}, "name")
        .sort({ _id: -1 })
    return tournaments
}

const findRecentTournamentNames = async () => {
    const tournaments = await tournamentsModel
        .find({}, "name")
        .sort({ _id: -1 })
        .limit(4)
    return tournaments
}

const findOngoingTournaments = async () => {
    const tournaments = await tournamentsModel.find({ ongoing: true })
    return tournaments
}

const findTournamentById = async (id) => {
    const tournament = await tournamentsModel.findById(id)
    return tournament
}

const createTournament = async (tournament) => {
    const newTournament = await tournamentsModel.create(tournament)
    return newTournament
}

const findTournaments = async () => {
    const tournaments = await tournamentsModel.find({}, "id name status")
    return tournaments
}

const findTournamentPlayersByTournamentId = async (id) => {
    const { players } = await tournamentsModel.findById(id, "players")
    return players
}

const findTournamentTeamsByTournamentId = async (id) => {
    const { teams } = await tournamentsModel.findById(id, "teams")
    return teams
}

const updateTeamUsersFromTournamentByTournamentId = async (id, teams) => {
    const updatedTeamUsers = await tournamentsModel.findByIdAndUpdate(
        id,
        { teams },
        { new: true } // Returns the updated document, not the original
    )
    return updatedTeamUsers
}

// const updateFixtureFromTournamentVersionOne = async (
//     tournamentId,
//     firstTeamByUser,
//     secondTeamByUser,
//     firstScoreByUser,
//     secondScoreByUser,
//     matchId
// ) => {
//     const isUpdated = await tournamentsModel.updateOne(
//         {
//             _id: tournamentId,
//             fixture: {
//                 $elemMatch: {
//                     teamP1: firstTeamByUser,
//                     teamP2: secondTeamByUser,
//                 },
//             },
//         },
//         {
//             $set: {
//                 "fixture.$.scoreP1": Number(firstScoreByUser),
//                 "fixture.$.scoreP2": Number(secondScoreByUser),
//                 "fixture.$.matchId": matchId,
//             },
//         }
//     )

//     const updatedTournament = await tournamentsModel.findById(tournamentId)

//     return { isUpdated, updatedTournament }
// }

// const updateFixtureFromTournamentVersionTwo = async (
//     tournamentId,
//     firstTeamByUser,
//     secondTeamByUser,
//     firstScoreByUser,
//     secondScoreByUser,
//     matchId
// ) => {
//     const isUpdated = await tournamentsModel.updateOne(
//         {
//             _id: tournamentId,
//             fixture: {
//                 $elemMatch: {
//                     teamP1: secondTeamByUser,
//                     teamP2: firstTeamByUser,
//                 },
//             },
//         },
//         {
//             $set: {
//                 "fixture.$.scoreP1": Number(secondScoreByUser),
//                 "fixture.$.scoreP2": Number(firstScoreByUser),
//                 "fixture.$.matchId": matchId,
//             },
//         }
//     )

//     const updatedTournament = await tournamentsModel.findById(tournamentId)

//     return { isUpdated, updatedTournament }
// }

// const updateFixtureFromTournamentWhenEditing = async (
//     tournamentId,
//     teamP1,
//     teamP2,
//     scoreP1,
//     scoreP2
// ) => {
//     const isUpdated = await tournamentsModel.updateOne(
//         {
//             _id: tournamentId,
//             fixture: {
//                 $elemMatch: {
//                     teamP1,
//                     teamP2,
//                 },
//             },
//         },
//         {
//             $set: {
//                 "fixture.$.scoreP1": Number(scoreP1),
//                 "fixture.$.scoreP2": Number(scoreP2),
//             },
//         }
//     )

//     const updatedTournament = await tournamentsModel.findById(tournamentId)

//     return { isUpdated, updatedTournament }
// }

// const updateFixtureFromTournamentWhenRemoving = async (
//     tournamentId,
//     matchId
// ) => {
//     const isDeleted = await tournamentsModel.updateOne(
//         {
//             _id: tournamentId,
//             fixture: {
//                 $elemMatch: {
//                     matchId,
//                 },
//             },
//         },
//         {
//             $unset: {
//                 "fixture.$.scoreP1": "",
//                 "fixture.$.scoreP2": "",
//                 "fixture.$.matchId": "",
//             },
//         }
//     )

//     const updatedTournament = await tournamentsModel.findById(tournamentId)

//     return { isDeleted, updatedTournament }
// }

const updateTeamsFromTournament = async (tournamentId, teams) => {
    const updatedTournament = await tournamentsModel.findByIdAndUpdate(
        tournamentId,
        {
            teams: teams,
        },
        { new: true } // Returns the updated document, not the original
    )
    return updatedTournament
}

// const updateTeamsFromTournament = async (tournamentId, team, player) => {
//     const updatedTournament = await tournamentsModel.updateOne(
//         {
//             _id: tournamentId,
//             "teams.team.id": team.id,
//         },
//         {
//             $set: {
//                 "teams.$.player": player,
//             },
//         }
//     )
//     return updatedTournament
// }

const updateFixtureFromTournamentWhenCreated = async (
    tournamentId,
    fixture
) => {
    const updatedTournament = await tournamentsModel.findByIdAndUpdate(
        tournamentId,
        {
            fixture,
            fixtureStatus: true,
        }
    )
    return updatedTournament
}

// const updateManyMatches = async () => {
//     const updatedMatches = matchesModel.updateMany(
//         {
//             teamP2: "Coventry",
//         },
//         {
//             $set: {
//                 teamP2: {
//                     name: "Coventry",
//                     id: "1346",
//                 },
//             },
//         }
//     )
//     return updatedMatches
// }

// const updateManyMatches = async () => {
//     const updatedMatches = matchesModel.updateMany(
//         {
//             "outcome.teamThatWon": "Coventry",
//         },
//         {
//             $set: {
//                 "outcome.teamThatWon": {
//                     name: "Coventry",
//                     id: "1346",
//                 },
//             },
//         }
//     )
//     return updatedMatches
// }

// const updateManyMatches = async () => {
//     const updatedMatches = matchesModel.updateMany(
//         { "outcome.playerThatLost": "none" },
//         {
//             $unset: {
//                 "outcome.playerThatLost": {
//                     field: 1,
//                 },
//                 "outcome.teamThatLost": {
//                     field: 1,
//                 },
//                 "outcome.scoreFromTeamThatLost": {
//                     field: 1,
//                 },
//             },
//         }
//         // { strict: false } // It's necessary for props that aren't in the model anymore //
//     )
//     return updatedMatches
// }

const updateManyMatches = async () => {
    const updatedMatches = matchesModel.updateMany(
        {
            "tournament.name": "Copa del Mundo 2022",
            played: { $ne: true },
        },
        { $set: { played: false } }
    )
    return updatedMatches
}

module.exports = {
    createUser,
    findUserById,
    findUserByUserName,
    findAllUsers,
    findRecentMatchesFromPlayer,
    findWonMatchesFromPlayer,
    countTotalMatchesFromAPlayerTeam,
    countTotalMatchesFromPlayerByTournament,
    countTotalWinsFromPlayerByTournament,
    countTotalLossesFromPlayerByTournament,
    countTotalMatchesFromPlayer,
    findTeamsWithAtLeastOneWinFromPlayer,
    countTotalWinsFromPlayer,
    countTotalDrawsFromPlayer,
    countTotalLossesFromPlayer,
    sortMatchesByScoringDifference,
    sortMatchesFromTournamentById,
    createMatch,
    createManyMatches,
    updateMatchResult,
    updateMatchResultToRemoveIt,
    findMatchById,
    removeMatchById,
    findMatchesByQuery,
    findMatchesByTournamentId,
    findMatches,
    findTournamentNames,
    findRecentTournamentNames,
    findOngoingTournaments,
    findTournamentById,
    createTournament,
    findTournaments,
    findTournamentPlayersByTournamentId,
    findTournamentTeamsByTournamentId,
    updateTeamUsersFromTournamentByTournamentId,
    // updateFixtureFromTournamentVersionOne,
    // updateFixtureFromTournamentVersionTwo,
    // updateFixtureFromTournamentWhenEditing,
    // updateFixtureFromTournamentWhenRemoving,
    updateTeamsFromTournament,
    updateFixtureFromTournamentWhenCreated,
    updateManyMatches,
}

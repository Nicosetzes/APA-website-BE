// const { createPlayoffByTournamentId } = require("./../../dao")

// const originateChampionsLeaguePlayoffUpdateByTournamentId = async (
//     round,
//     tournament,
//     matches
// ) => {
//     const playedMatches = matches
//         .filter(({ played }) => played)
//         .map(({ playoff_id }) => playoff_id)

//     const newMatches = []

//     if (round == 2) {
//         // 2da ronda (cuartos) //
//         if (playedMatches.includes(1) && playedMatches.includes(2)) {
//             // Primero chequeo que, a pesar de cumplirse estas condiciones, el partido no se haya generado con anterioridad //
//             !matches.filter(({ playoff_id }) => playoff_id == 9).length &&
//                 newMatches.push({
//                     playerP1: matches.at(0).outcome.playerThatWon,
//                     teamP1: matches.at(0).outcome.teamThatWon,
//                     seedP1: matches.at(0).outcome.seedFromTeamThatWon,
//                     playerP2: matches.at(1).outcome.playerThatWon,
//                     teamP2: matches.at(1).outcome.teamThatWon,
//                     seedP2: matches.at(1).outcome.seedFromTeamThatWon,
//                     type: "playoff",
//                     tournament,
//                     played: false,
//                     playoff_id: 9,
//                 })
//         }

//         if (playedMatches.includes(3) && playedMatches.includes(4)) {
//             // Primero chequeo que, a pesar de cumplirse estas condiciones, el partido no se haya generado con anterioridad //
//             !matches.filter(({ playoff_id }) => playoff_id == 10).length &&
//                 newMatches.push({
//                     playerP1: matches.at(2).outcome.playerThatWon,
//                     teamP1: matches.at(2).outcome.teamThatWon,
//                     seedP1: matches.at(2).outcome.seedFromTeamThatWon,
//                     playerP2: matches.at(3).outcome.playerThatWon,
//                     teamP2: matches.at(3).outcome.teamThatWon,
//                     seedP2: matches.at(3).outcome.seedFromTeamThatWon,
//                     type: "playoff",
//                     tournament,
//                     played: false,
//                     playoff_id: 10,
//                 })
//         }
//         if (playedMatches.includes(5) && playedMatches.includes(6)) {
//             // Primero chequeo que, a pesar de cumplirse estas condiciones, el partido no se haya generado con anterioridad //
//             !matches.filter(({ playoff_id }) => playoff_id == 11).length &&
//                 newMatches.push({
//                     playerP1: matches.at(4).outcome.playerThatWon,
//                     teamP1: matches.at(4).outcome.teamThatWon,
//                     seedP1: matches.at(4).outcome.seedFromTeamThatWon,
//                     playerP2: matches.at(5).outcome.playerThatWon,
//                     teamP2: matches.at(5).outcome.teamThatWon,
//                     seedP2: matches.at(5).outcome.seedFromTeamThatWon,
//                     type: "playoff",
//                     tournament,
//                     played: false,
//                     playoff_id: 11,
//                 })
//         }
//         if (playedMatches.includes(7) && playedMatches.includes(8)) {
//             // Primero chequeo que, a pesar de cumplirse estas condiciones, el partido no se haya generado con anterioridad //
//             !matches.filter(({ playoff_id }) => playoff_id == 12).length &&
//                 newMatches.push({
//                     playerP1: matches.at(6).outcome.playerThatWon,
//                     teamP1: matches.at(6).outcome.teamThatWon,
//                     seedP1: matches.at(6).outcome.seedFromTeamThatWon,
//                     playerP2: matches.at(7).outcome.playerThatWon,
//                     teamP2: matches.at(7).outcome.teamThatWon,
//                     seedP2: matches.at(7).outcome.seedFromTeamThatWon,
//                     type: "playoff",
//                     tournament,
//                     played: false,
//                     playoff_id: 12,
//                 })
//         }
//     } else if (round == 3) {
//         // 3ra ronda (semis) //
//         if (playedMatches.includes(9) && playedMatches.includes(10)) {
//             // Primero chequeo que, a pesar de cumplirse estas condiciones, el partido no se haya generado con anterioridad //
//             !matches.filter(({ playoff_id }) => playoff_id == 13).length &&
//                 newMatches.push({
//                     playerP1: matches.at(8).outcome.playerThatWon,
//                     teamP1: matches.at(8).outcome.teamThatWon,
//                     seedP1: matches.at(8).outcome.seedFromTeamThatWon,
//                     playerP2: matches.at(9).outcome.playerThatWon,
//                     teamP2: matches.at(9).outcome.teamThatWon,
//                     seedP2: matches.at(9).outcome.seedFromTeamThatWon,
//                     type: "playoff",
//                     tournament,
//                     played: false,
//                     playoff_id: 13,
//                 })
//         }

//         if (playedMatches.includes(11) && playedMatches.includes(12)) {
//             // Primero chequeo que, a pesar de cumplirse estas condiciones, el partido no se haya generado con anterioridad //
//             !matches.filter(({ playoff_id }) => playoff_id == 14).length &&
//                 newMatches.push({
//                     playerP1: matches.at(10).outcome.playerThatWon,
//                     teamP1: matches.at(10).outcome.teamThatWon,
//                     seedP1: matches.at(10).outcome.seedFromTeamThatWon,
//                     playerP2: matches.at(11).outcome.playerThatWon,
//                     teamP2: matches.at(11).outcome.teamThatWon,
//                     seedP2: matches.at(11).outcome.seedFromTeamThatWon,
//                     type: "playoff",
//                     tournament,
//                     played: false,
//                     playoff_id: 14,
//                 })
//         }
//     } else {
//         // 4ta ronda (final) //
//         if (playedMatches.includes(13) && playedMatches.includes(14)) {
//             // Primero chequeo que, a pesar de cumplirse estas condiciones, el partido no se haya generado con anterioridad //
//             !matches.filter(({ playoff_id }) => playoff_id == 15).length &&
//                 newMatches.push({
//                     playerP1: matches.at(12).outcome.playerThatWon,
//                     teamP1: matches.at(12).outcome.teamThatWon,
//                     seedP1: matches.at(12).outcome.seedFromTeamThatWon,
//                     playerP2: matches.at(13).outcome.playerThatWon,
//                     teamP2: matches.at(13).outcome.teamThatWon,
//                     seedP2: matches.at(13).outcome.seedFromTeamThatWon,
//                     type: "playoff",
//                     tournament,
//                     played: false,
//                     playoff_id: 15,
//                 })
//         }
//     }

//     return await createPlayoffByTournamentId(newMatches)
// }

// module.exports = originateChampionsLeaguePlayoffUpdateByTournamentId

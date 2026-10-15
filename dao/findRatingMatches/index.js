const matchesModel = require("./../models/matches.js")

// Solo lo que lee el motor de ratings (service/playerRatings): quién jugó, con
// qué equipo, el marcador, cuándo y en qué torneo. Se piden los subcampos que se
// usan (id y name) y no los objetos enteros de jugador, equipo y torneo.
const RATING_PROJECTION = [
    "playerP1.id",
    "playerP1.name",
    "teamP1.id",
    "teamP1.name",
    "scoreP1",
    "playerP2.id",
    "playerP2.name",
    "teamP2.id",
    "teamP2.name",
    "scoreP2",
    "tournament.id",
    "tournament.name",
    "type",
    "playedAt",
].join(" ")

// Solo jugados y válidos, igual que `findAllMatches` sin opciones.
const RATING_FILTER = { played: { $ne: false }, valid: { $ne: false } }

// Todos los partidos jugados y válidos, listos para `calculatePlayerRatings`.
//
// - `.lean()`: devuelve objetos planos y no documentos Mongoose, que es lo que
//   necesita un cálculo de solo lectura (menos CPU y memoria por documento).
// - Sin ordenar: el motor ordena cronológicamente por su cuenta (`playedAt` y
//   luego `_id`), así que ordenar acá sería trabajo repetido.
//
// No lo usen quienes necesiten `outcome`, `playedAtPrecision` u otros campos
// del partido: para eso está `findAllMatches`.
const findRatingMatches = async () =>
    matchesModel.find(RATING_FILTER, RATING_PROJECTION).lean()

module.exports = findRatingMatches
module.exports.RATING_FILTER = RATING_FILTER
module.exports.RATING_PROJECTION = RATING_PROJECTION

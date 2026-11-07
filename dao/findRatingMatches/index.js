const matchesModel = require("./../models/matches.js")
const tournamentsModel = require("./../models/tournaments.js")

// Solo lo que lee el motor de ratings (service/playerRatings): quién jugó, con
// qué equipo, el marcador, cuándo y en qué torneo. Se piden los subcampos que se
// usan (id y name) y no los objetos enteros de jugador, equipo y torneo. Además
// del cálculo, el motor guarda en cada evento el tipo de cruce (`leg`), la
// precisión de la fecha y la tanda de penales (`outcome.*`).
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
    "leg",
    "playedAt",
    "playedAtPrecision",
    "outcome.penalties",
    "outcome.teamThatWon.id",
    "outcome.scoreFromTeamThatWon",
    "outcome.scoreFromTeamThatLost",
].join(" ")

// Del torneo solo se necesita lo que decide el tipo de cruce de sus playoffs.
const TOURNAMENT_CONTEXT_PROJECTION = "format playoffMode"

// Solo jugados y válidos, igual que `findAllMatches` sin opciones.
const RATING_FILTER = { played: { $ne: false }, valid: { $ne: false } }

const textOrNull = (value) => (typeof value === "string" ? value : null)

// Todos los partidos jugados y válidos, listos para `calculatePlayerRatings`.
//
// - `.lean()`: devuelve objetos planos y no documentos Mongoose, que es lo que
//   necesita un cálculo de solo lectura (menos CPU y memoria por documento).
// - Sin ordenar: el motor ordena cronológicamente por su cuenta (`playedAt` y
//   luego `_id`), así que ordenar acá sería trabajo repetido.
// - Una sola lectura de torneos por carga (hay pocas decenas): cada partido
//   recibe `tournamentContext` = `{ format, playoffMode }` de su torneo, o
//   `null` si no tiene `tournament.id` o el torneo no existe. Así el motor
//   resuelve el `kind` igual en vivo, al recalcular y al sincronizar. Si la
//   lectura de torneos falla, se propaga el error: seguir sin torneos
//   guardaría un `kind` nulo equivocado.
//
// No lo usen quienes necesiten otros campos del partido: para eso está
// `findAllMatches`.
const findRatingMatches = async ({
    matchesModel: matches = matchesModel,
    tournamentsModel: tournaments = tournamentsModel,
} = {}) => {
    const [matchDocuments, tournamentDocuments] = await Promise.all([
        matches.find(RATING_FILTER, RATING_PROJECTION).lean(),
        tournaments.find({}, TOURNAMENT_CONTEXT_PROJECTION).lean(),
    ])

    const contextById = new Map(
        tournamentDocuments.map((tournament) => [
            String(tournament._id),
            {
                format: textOrNull(tournament.format),
                playoffMode: textOrNull(tournament.playoffMode),
            },
        ])
    )

    return matchDocuments.map((match) => {
        const tournamentId = match.tournament?.id
        const hasTournament =
            tournamentId !== null && tournamentId !== undefined
        return {
            ...match,
            tournamentContext: hasTournament
                ? contextById.get(String(tournamentId)) ?? null
                : null,
        }
    })
}

module.exports = findRatingMatches
module.exports.RATING_FILTER = RATING_FILTER
module.exports.RATING_PROJECTION = RATING_PROJECTION
module.exports.TOURNAMENT_CONTEXT_PROJECTION = TOURNAMENT_CONTEXT_PROJECTION

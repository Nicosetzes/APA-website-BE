// Referencia al torneo que se guarda en cada partido (`match.tournament`).
//
// Además de `id` y `name` lleva la edición del juego (`gameVersion`) cuando el
// torneo la tiene: el motor de ratings la lee de ahí para buscar el overall de
// cada equipo (service/playerRatings/teamStrength.js), así no necesita leer el
// torneo. La edición es inmutable en el torneo, por eso copiarla no se
// desincroniza.
const toTournamentReference = (tournament = {}, { id } = {}) => {
    const gameVersion =
        typeof tournament.gameVersion === "string" &&
        tournament.gameVersion.trim()
            ? tournament.gameVersion.trim()
            : null
    return {
        id: id === undefined ? tournament.id : id,
        name: tournament.name,
        ...(gameVersion ? { gameVersion } : {}),
    }
}
module.exports = { toTournamentReference }

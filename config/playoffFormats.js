// Geometría del bracket por formato. Única fuente de verdad: la consumen la
// carga de resultados (`putMatchByTournamentId`) y el update manual del playoff
// (`postPlayoffUpdateByTournamentId`), que antes tenían tablas propias.
//
// El fallback de 16 preserva el comportamiento histórico de los formatos que no
// están en la tabla, como el legacy `club_world_cup`.
const DEFAULT_PLAYOFF_START_SIZE = 16

const PLAYOFF_START_SIZE_BY_FORMAT = {
    playoff: 32,
    world_cup_2026: 32,
    world_cup: 16,
    league_playin_playoff: 16,
    super_cup: 16,
}

// En un bracket de N equipos la final es el `playoff_id` N - 1.
// `champions_league` es la excepción histórica: sus llaves son de ida y vuelta,
// así que su final es la 29 y el backend no le genera rondas automáticamente.
const FINAL_PLAYOFF_ID_BY_FORMAT = {
    champions_league: 29,
}

const getPlayoffStartSize = (format) =>
    PLAYOFF_START_SIZE_BY_FORMAT[format] ?? DEFAULT_PLAYOFF_START_SIZE

// El update manual del playoff necesita distinguir "formato tabulado" de
// "formato que cae al fallback": generarle rondas a un formato desconocido con
// una geometría inventada es peor que rechazar el pedido.
const hasTabulatedPlayoffStartSize = (format) =>
    typeof format === "string" &&
    Object.hasOwn(PLAYOFF_START_SIZE_BY_FORMAT, format)

// Un formato tiene final conocida si está en cualquiera de las dos tablas. Los
// que no lo están cierran igual por el fallback de 16, pero ese id no lo
// verificó nadie contra su bracket, así que conviene poder detectarlos.
const hasTabulatedFinalPlayoffId = (format) =>
    hasTabulatedPlayoffStartSize(format) ||
    (typeof format === "string" &&
        Object.hasOwn(FINAL_PLAYOFF_ID_BY_FORMAT, format))

const getFinalPlayoffId = (format) =>
    FINAL_PLAYOFF_ID_BY_FORMAT[format] ?? getPlayoffStartSize(format) - 1

// La final se deriva del formato del torneo y del `playoff_id` persistido del
// partido. Nunca de un flag que manda el cliente.
const isFinalPlayoffMatch = ({ format, type, playoffId }) =>
    type === "playoff" &&
    Number.isInteger(Number(playoffId)) &&
    Number(playoffId) === getFinalPlayoffId(format)

module.exports = {
    DEFAULT_PLAYOFF_START_SIZE,
    FINAL_PLAYOFF_ID_BY_FORMAT,
    PLAYOFF_START_SIZE_BY_FORMAT,
    getFinalPlayoffId,
    getPlayoffStartSize,
    hasTabulatedFinalPlayoffId,
    hasTabulatedPlayoffStartSize,
    isFinalPlayoffMatch,
}

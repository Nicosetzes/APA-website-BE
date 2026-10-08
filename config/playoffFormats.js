// Geometría del bracket por formato. Única fuente de verdad: la consume la
// carga de resultados (`putMatchByTournamentId`), que avanza el bracket.
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

// Distingue "formato tabulado" de "formato que cae al fallback".
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
    type === "playoff" && playoffId === getFinalPlayoffId(format)

// Rondas de playoff por cantidad de equipos que las disputan.
const TEAMS_BY_PLAYOFF_ROUND = {
    round_of_32: 32,
    round_of_16: 16,
    quarterfinal: 8,
    semifinal: 4,
    final: 2,
}

const PLAYOFF_ROUNDS = Object.keys(TEAMS_BY_PLAYOFF_ROUND)

// Los formatos de ida y vuelta no siguen la geometría de eliminación simple:
// cada llave ocupa dos `playoff_id` salvo la final. Mismos rangos que usa el FE
// para dibujar el bracket.
const PLAYOFF_ROUND_IDS_BY_FORMAT = {
    playoff: {
        round_of_32: [1, 16],
        round_of_16: [17, 24],
        quarterfinal: [25, 28],
        semifinal: [29, 30],
        final: [31, 31],
    },
    champions_league: {
        round_of_16: [1, 16],
        quarterfinal: [17, 24],
        semifinal: [25, 28],
        final: [29, 29],
    },
}

// Rango [desde, hasta] de `playoff_id` de una ronda para un formato, o null si
// el bracket de ese formato no tiene esa ronda. En un bracket de N equipos la
// ronda que disputan r equipos ocupa los ids N - r + 1 a N - r / 2.
const getPlayoffRoundIdRange = (format, round) => {
    if (!Object.hasOwn(TEAMS_BY_PLAYOFF_ROUND, round)) return null

    if (
        typeof format === "string" &&
        Object.hasOwn(PLAYOFF_ROUND_IDS_BY_FORMAT, format)
    ) {
        return PLAYOFF_ROUND_IDS_BY_FORMAT[format][round] ?? null
    }

    const size = getPlayoffStartSize(format)
    const teams = TEAMS_BY_PLAYOFF_ROUND[round]

    if (teams > size) return null

    return [size - teams + 1, size - teams / 2]
}

module.exports = {
    DEFAULT_PLAYOFF_START_SIZE,
    FINAL_PLAYOFF_ID_BY_FORMAT,
    PLAYOFF_ROUNDS,
    PLAYOFF_ROUND_IDS_BY_FORMAT,
    PLAYOFF_START_SIZE_BY_FORMAT,
    getFinalPlayoffId,
    getPlayoffRoundIdRange,
    getPlayoffStartSize,
    hasTabulatedFinalPlayoffId,
    hasTabulatedPlayoffStartSize,
    isFinalPlayoffMatch,
}

const { getPlayoffStartSize } = require("./playoffFormats")
const GROUP_PLAYOFF_CONFIGS = require("../service/calculateGroupStagePlayoff/formats")

const TABLE_TIEBREAK =
    "Tabla: 3 puntos por victoria y 1 por empate. Desempate por diferencia de gol, goles a favor y menos goles en contra."

const KNOCKOUT_SINGLE_MATCH =
    "Cada cruce es un partido único; si empatan hay alargue (gol de plata) y, si sigue igualado, se define por penales."

const BEST_THIRDS_PAIRING =
    "Los terceros se ordenan entre sí con el mismo criterio que la tabla (puntos, diferencia de gol, goles a favor y menos goles en contra). Sólo algunos primeros del cuadro (`firstsFacingThirds`) enfrentan a un tercero; se ordenan igual, y el mejor de esos primeros enfrenta al peor de los terceros clasificados, el segundo mejor al segundo peor, y así. Dos equipos del mismo grupo no pueden cruzarse en la primera ronda del playoff: si el emparejamiento lo produce, ese cruce se reasigna al siguiente tercero disponible."

const GROUP_FORMAT_LABELS = {
    super_cup: "grupos de la A a la F",
    world_cup: "grupos de la A a la H",
    world_cup_2026: "grupos de la A a la L",
    champions_league: "grupos de la A a la H",
}

const LEGACY_FORMAT_DESCRIPTIONS = {
    american_cup:
        "Copa América: formato propio, distinto de la eliminatoria pura. El backend no define sus fases ni sus reglas; hoy solo existe en un torneo legacy.",
    club_world_cup:
        "Mundial de Clubes: formato propio, distinto del Mundial de selecciones. El backend no define sus fases ni sus reglas; hoy solo existe en un torneo legacy.",
}

// Reglas fijas por formato, escritas a mano a partir de cómo el backend arma
// la fase de grupos y el cuadro.

const describeTournamentFormat = ({ format, playoffMode } = {}) => {
    const bracketSize = getPlayoffStartSize(format)

    if (format === "league") {
        return {
            stages: ["regular"],
            description: "Liga de tabla única, sin eliminatorias.",
            tableTiebreak: TABLE_TIEBREAK,
            qualification: {
                note: "`eliminated` indica que, ganando todos los partidos que le quedan, el equipo ya no alcanza los puntos actuales del líder.",
            },
            knockout: null,
        }
    }

    if (format === "league_playin_playoff") {
        return {
            stages: ["regular", "playin", "playoff"],
            description:
                "Dos grupos (A y B) con tabla propia, un play-in y un playoff de 16 equipos.",
            tableTiebreak: TABLE_TIEBREAK,
            qualification: {
                directPerGroup: 6,
                playinPerGroup: 4,
                note: "Del 1° al 6° de cada grupo clasifican directo al playoff; del 7° al 10° juegan el play-in; del 11° en adelante quedan eliminados. Los ganadores del play-in completan los 16 del playoff. Mientras quedan partidos, `directlyQualified`, `playinQualified` y `eliminated` sólo son true si ya es matemático por puntos.",
            },
            knockout: KNOCKOUT_SINGLE_MATCH,
        }
    }

    if (format === "playoff") {
        const twoLegged = playoffMode === "two_legged"
        return {
            stages: ["playoff"],
            description: `Eliminación directa con ${bracketSize} equipos, sin fase de grupos.`,
            tableTiebreak: null,
            qualification: null,
            knockout: twoLegged
                ? "Cada cruce es de ida y vuelta, definido por el marcador global. Si el global empata se juega un tercer partido de desempate a gol de oro: avanza quien convierte primero (no hay penales)."
                : KNOCKOUT_SINGLE_MATCH,
        }
    }

    if (LEGACY_FORMAT_DESCRIPTIONS[format]) {
        return {
            stages: [],
            description: LEGACY_FORMAT_DESCRIPTIONS[format],
            tableTiebreak: null,
            qualification: null,
            knockout: null,
        }
    }

    const groupConfig = GROUP_PLAYOFF_CONFIGS[format]

    if (format === "champions_league") {
        return {
            stages: ["regular", "playoff"],
            description: `Fase de grupos (${GROUP_FORMAT_LABELS[format]}) y un cuadro de eliminación directa.`,
            tableTiebreak: TABLE_TIEBREAK,
            qualification: {
                perGroup: 2,
                bestThirds: 0,
                note: "Clasifican el 1° y el 2° de cada grupo.",
            },
            knockout: "Los cruces son de ida y vuelta.",
        }
    }

    if (format === "world_cup" || groupConfig) {
        const bestThirds = groupConfig?.numQualifyingThirds ?? 0
        return {
            stages: ["regular", "playoff"],
            description: `Fase de grupos (${GROUP_FORMAT_LABELS[format]}) y un cuadro de eliminación directa de ${bracketSize} equipos.`,
            tableTiebreak: TABLE_TIEBREAK,
            qualification: {
                perGroup: 2,
                bestThirds,
                ...(bestThirds && {
                    firstsFacingThirds: groupConfig.hostsForThirdsGroups,
                }),
                note: bestThirds
                    ? `Clasifican el 1° y el 2° de cada grupo y los ${bestThirds} mejores terceros. ${BEST_THIRDS_PAIRING}`
                    : "Clasifican el 1° y el 2° de cada grupo.",
            },
            knockout: KNOCKOUT_SINGLE_MATCH,
        }
    }

    return {
        stages: [],
        description: null,
        tableTiebreak: null,
        qualification: null,
        knockout: null,
    }
}

module.exports = { describeTournamentFormat }

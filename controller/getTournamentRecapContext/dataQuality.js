const { LOW_MATCH_COUNT_WARNING } = require("../../config/tournamentRecap")
const { RATING_CONFIG } = require("../../config/ratings")

// Fechas con precisión menor al día: no sirven para contar una cronología fina.
const EXACT_PRECISIONS = new Set(["exact", "day"])

const isApproximate = (precision) =>
    precision !== null &&
    precision !== undefined &&
    !EXACT_PRECISIONS.has(precision)

// Advertencias para el agente sobre cuánto confiar en cada parte del contexto.
// Pura.
//
// - `entries`: log completo de partidos (ver `matchLog.js`).
// - `ratingMovement.players[].ratingProvisional`: jugadores que EMPEZARON el
//   torneo con pocos partidos previos (se evalúa antes de su primer partido, no
//   al final). Solo afecta a sus primeros partidos, cuyas probabilidades son
//   poco confiables (`matches[].p1/p2.provisional`, por partido).
// - `overlappingEvents`: eventos de rating de OTROS torneos jugados entre el
//   primer y el último partido de este.
// - `extraWarnings`: advertencias de otros módulos (por ejemplo, de títulos).
const buildDataQuality = ({
    tournament,
    entries,
    ratingMovement,
    overlappingEvents = 0,
    extraWarnings = [],
    provisionalMatches = RATING_CONFIG.provisionalMatches,
}) => {
    const rated = entries.filter(({ rated: isRated }) => isRated)
    const unrated = entries.filter(({ rated: isRated }) => !isRated)
    const provisionalPlayers = ratingMovement.players
        .filter(({ ratingProvisional }) => ratingProvisional)
        .map(({ player }) => player.name)
    const datesApproximate =
        isApproximate(tournament.closedAtPrecision) ||
        isApproximate(tournament.startedAtPrecision) ||
        entries.some(({ playedAtPrecision }) =>
            isApproximate(playedAtPrecision)
        )
    const predictable = entries.some(({ odds }) => odds !== null)
    const warnings = [...extraWarnings]

    if (provisionalPlayers.length > 0) {
        warnings.push(
            `Jugadores que empezaron este torneo con rating provisorio (menos de ${provisionalMatches} partidos previos): ${provisionalPlayers.join(
                ", "
            )}. Solo afecta a sus primeros partidos; los partidos marcados provisional:true tienen probabilidades poco confiables.`
        )
    }
    if (unrated.length > 0) {
        warnings.push(
            `${unrated.length} partido(s) sin evento de rating (W.O., simulados o sin goles): no tienen probabilidades ni cambio de Elo.`
        )
    }
    if (datesApproximate) {
        warnings.push(
            "Hay fechas aproximadas: no armar una cronología exacta por día."
        )
    }
    if (rated.length < LOW_MATCH_COUNT_WARNING) {
        warnings.push(
            `Pocos partidos con rating (${rated.length}): las estadísticas del torneo son limitadas.`
        )
    }
    if (!predictable) {
        warnings.push(
            "Este formato no tiene probabilidades por partido: no hablar de favoritos ni de sorpresas."
        )
    }
    if (overlappingEvents > 0) {
        warnings.push(
            `Se jugaron ${overlappingEvents} partido(s) de otros torneos mientras este estaba en curso: los ratings globales (globalRating*, globalPeakRating) y las posiciones del ranking global pueden incluirlos, y por eso no son lo que se ganó o perdió en este torneo. El delta del torneo no los incluye.`
        )
    }

    return {
        warnings,
        ratedMatches: rated.length,
        unratedMatchIds: unrated.map(({ matchId }) => matchId),
        datesApproximate,
        provisionalPlayers,
    }
}

module.exports = { buildDataQuality }

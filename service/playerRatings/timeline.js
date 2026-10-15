const { calculatePlayerRatings, snapshotBefore } = require("./index")
const { defaultTeamStrength } = require("./teamStrength")

// Timeline de ratings: el resultado del motor sobre todo el historial, con lo
// que necesitan las pantallas y endpoints que lo consumen.
//
// Es la única puerta de entrada al motor para la API (rankings, períodos,
// predicciones de duelos y lo que venga): ningún controller llama a
// `calculatePlayerRatings` por su cuenta. Así hay un solo lugar donde después
// se puede cachear o medir el costo del cálculo.
//
// `options` es el mismo que acepta `calculatePlayerRatings` (sirve para tests).
// Es una función pura: no lee la base. Para cargar los partidos ver
// `service/retrieveRatingsTimeline`.
const buildRatingsTimeline = (matches, options = {}) => {
    const { players, events, config } = calculatePlayerRatings(
        matches || [],
        options
    )
    // Debe ser el mismo lookup que usó el motor.
    const lookup =
        options.teamStrength === undefined
            ? defaultTeamStrength
            : options.teamStrength

    const eventsByMatchId = new Map()
    for (const event of events) {
        if (event.matchId !== null) eventsByMatchId.set(event.matchId, event)
    }

    return {
        players,
        events,
        config,
        lookup,
        eventsByMatchId,
        // Estado de cada jugador justo antes de `cutoffMs` (ms). Sin argumento
        // (o `null`) es el estado actual, con todo el historial.
        snapshotAt: (cutoffMs = null) =>
            snapshotBefore(events, cutoffMs, config.initialRating),
    }
}

module.exports = { buildRatingsTimeline }

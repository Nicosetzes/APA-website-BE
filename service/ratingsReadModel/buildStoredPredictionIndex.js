const { RATING_CONFIG } = require("../../config/ratings")
const { defaultTeamStrength } = require("../playerRatings/teamStrength")
// Adaptador: arma, a partir de los documentos guardados, el MISMO índice que
// `buildPredictionIndex` (service/playerRatings/prediction) arma corriendo el
// motor. `predictMatch` / `predictOutcomes` lo consumen sin cambios.
//
// Es una función pura. Valida los tipos de lo guardado y lanza con un mensaje en
// español si algo viene malformado: el que lo usa lo registra como error y
// vuelve al camino en vivo.
//
// - `players`: docs de `player-ratings` ({ ratingVersion, id, rating, matches }).
//   El `rating` guardado es bit a bit el del snapshot del motor.
// - `events`: docs de `rating-events` ({ matchId, expectedP1, p1, p2 }), con
//   `matchId` como ObjectId (o string). La clave del mapa es `String(matchId)`.
//   `p1.teamOverall` ausente se normaliza a `null`: la predicción lo compara con
//   `!== null` para decidir `teamAdjusted`.
const isFiniteNumber = (value) =>
    typeof value === "number" && Number.isFinite(value)
const isCount = (value) => Number.isInteger(value) && value >= 0

const fail = (message) => {
    throw new Error(`buildStoredPredictionIndex: ${message}`)
}

const buildSnapshot = (players, config) => {
    if (!Array.isArray(players)) fail("players tiene que ser un arreglo")
    const snapshot = new Map()
    for (const player of players) {
        if (player?.ratingVersion !== config.version) {
            fail(
                `el jugador guardado tiene ratingVersion ${player?.ratingVersion}, se esperaba ${config.version}`
            )
        }
        if (typeof player.id !== "string" || player.id === "") {
            fail("un jugador guardado no tiene id (string)")
        }
        if (!isFiniteNumber(player.rating)) {
            fail(`el jugador ${player.id} no tiene un rating numérico`)
        }
        if (!isCount(player.matches)) {
            fail(`el jugador ${player.id} no tiene matches entero >= 0`)
        }
        snapshot.set(player.id, {
            id: player.id,
            rating: player.rating,
            matches: player.matches,
        })
    }
    return snapshot
}

const buildEventsByMatchId = (events) => {
    if (!Array.isArray(events)) fail("events tiene que ser un arreglo")
    const eventsByMatchId = new Map()
    for (const event of events) {
        if (event?.matchId === undefined || event.matchId === null) {
            fail("un evento guardado no tiene matchId")
        }
        const key = String(event.matchId)
        if (
            !isFiniteNumber(event.expectedP1) ||
            event.expectedP1 < 0 ||
            event.expectedP1 > 1
        ) {
            fail(`el evento ${key} no tiene expectedP1 en [0, 1]`)
        }
        if (!isCount(event.p1?.games) || !isCount(event.p2?.games)) {
            fail(`el evento ${key} no tiene p1.games y p2.games enteros >= 0`)
        }
        const teamOverall = event.p1.teamOverall ?? null
        if (teamOverall !== null && !isFiniteNumber(teamOverall)) {
            fail(`el evento ${key} tiene un p1.teamOverall inválido`)
        }
        eventsByMatchId.set(key, {
            expectedP1: event.expectedP1,
            p1: { games: event.p1.games, teamOverall },
            p2: { games: event.p2.games },
        })
    }
    return eventsByMatchId
}

const buildStoredPredictionIndex = ({
    players,
    events,
    config = RATING_CONFIG,
    lookup = defaultTeamStrength,
} = {}) => ({
    eventsByMatchId: buildEventsByMatchId(events),
    snapshot: buildSnapshot(players, config),
    config,
    lookup,
})

module.exports = { buildStoredPredictionIndex }

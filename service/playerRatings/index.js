const { RATING_CONFIG } = require("../../config/ratings")
const { defaultTeamStrength } = require("./teamStrength")

const toTime = (value) => {
    if (value === null || value === undefined) return null
    const time = new Date(value).getTime()
    return Number.isNaN(time) ? null : time
}

const isScore = (value) => Number.isInteger(value) && value >= 0

const teamName = (team) => {
    const name = typeof team?.name === "string" ? team.name.trim() : ""
    return name || null
}

const playerId = (player) =>
    player?.id === undefined || player?.id === null ? null : String(player.id)

// Un partido entra al rating si está jugado, es válido, tiene dos jugadores
// distintos y goles enteros. Lo demás es legado incompleto y se ignora.
const isRateable = (match) =>
    match?.played !== false &&
    match?.valid !== false &&
    playerId(match?.playerP1) !== null &&
    playerId(match?.playerP2) !== null &&
    playerId(match.playerP1) !== playerId(match.playerP2) &&
    isScore(match.scoreP1) &&
    isScore(match.scoreP2)

// Orden cronológico: `playedAt` ascendente y, a igual fecha, `_id` ascendente.
// Los partidos sin fecha van primero, igual que quedan al final del orden desc
// que usa el resto de la API. Importa porque el Elo depende del orden.
const compareChronologically = (a, b) => {
    const timeA = toTime(a.playedAt)
    const timeB = toTime(b.playedAt)

    if (timeA !== timeB) {
        if (timeA === null) return -1
        if (timeB === null) return 1
        return timeA - timeB
    }

    const idA = String(a._id ?? "")
    const idB = String(b._id ?? "")
    if (idA === idB) return 0
    return idA < idB ? -1 : 1
}

// Puntaje que se espera de A contra B, entre 0 y 1. Un empate vale 0,5, así que
// no es la probabilidad de ganar.
const expectedScore = (ratingA, ratingB, scale = RATING_CONFIG.scale) =>
    1 / (1 + 10 ** ((ratingB - ratingA) / scale))

const resultScore = (scoreA, scoreB) => {
    if (scoreA > scoreB) return 1
    if (scoreA < scoreB) return 0
    // Un empate en los goles vale 0,5 también cuando se definió por penales.
    return 0.5
}

const marginMultiplier = (goalDifference, marginWeight) =>
    1 + marginWeight * Math.log(1 + Math.abs(goalDifference))

// Puntaje esperado de P1 contra P2 con los ratings dados, incluido el término de
// equipo de la 2.0 cuando `lookup` conoce el overall de ambos. Es el mismo cálculo
// que usa el motor en cada partido y que reutiliza la predicción de duelos.
// `teamAdjustment` son los puntos Elo a favor de P1 que sumó el equipo (0 si no
// se aplicó) y `teamOverall*` es `null` cuando no hay término de equipo.
const expectedForMatch = ({ rating1, rating2, match, config, lookup }) => {
    const teams =
        config.teamStrengthWeight !== 0 && lookup ? lookup(match) : null
    const adjust1 = teams ? config.teamStrengthWeight * teams.t1 : 0
    const adjust2 = teams ? config.teamStrengthWeight * teams.t2 : 0

    const expectedP1 = expectedScore(
        rating1 + adjust1,
        rating2 + adjust2,
        config.scale
    )

    return {
        expectedP1,
        teamAdjustment: adjust1 - adjust2,
        teamOverall1: teams ? teams.t1 : null,
        teamOverall2: teams ? teams.t2 : null,
    }
}

const createPlayerState = (id, name, initialRating) => ({
    id,
    name,
    rating: initialRating,
    peak: initialRating,
    matches: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    lastPlayedAt: null,
    lastChange: null,
})

// Recorre los partidos en orden cronológico y devuelve, por cada uno, los
// ratings de ambos antes y después. No guarda nada: ante una edición de un
// resultado viejo se recalcula todo, que con unos miles de partidos es inmediato.
//
// Modelo 2.0: el puntaje esperado usa un rating efectivo,
//   efectivo = rating del jugador + teamStrengthWeight * overall del equipo,
// pero el cambio (`delta`) se suma y resta solo a los ratings de los jugadores:
// el término de equipo nunca entra al rating mostrado y el intercambio sigue
// siendo de suma cero. Si falta el overall de cualquiera de los dos equipos (o el
// peso es 0) el partido se calcula exactamente como en la 1.0.
//
// `options.teamStrength` reemplaza la búsqueda de overalls (`(match) => {t1, t2}
// | null`); `null` la desactiva. Sirve para tests y para evaluar con datos propios.
const calculatePlayerRatings = (matches = [], options = {}) => {
    const { teamStrength: injected, ...overrides } = options
    const config = { ...RATING_CONFIG, ...overrides }
    const lookup = injected === undefined ? defaultTeamStrength : injected
    const players = new Map()
    const events = []

    const getPlayer = (reference) => {
        const id = playerId(reference)
        if (!players.has(id)) {
            players.set(
                id,
                createPlayerState(
                    id,
                    reference.name ?? id,
                    config.initialRating
                )
            )
        }
        const player = players.get(id)
        if (reference.name) player.name = reference.name
        return player
    }

    const ordered = matches.filter(isRateable).sort(compareChronologically)

    for (const match of ordered) {
        const p1 = getPlayer(match.playerP1)
        const p2 = getPlayer(match.playerP2)

        const before1 = p1.rating
        const before2 = p2.rating
        const games1 = p1.matches
        const games2 = p2.matches

        const { expectedP1, teamAdjustment, teamOverall1, teamOverall2 } =
            expectedForMatch({
                rating1: before1,
                rating2: before2,
                match,
                config,
                lookup,
            })
        const resultP1 = resultScore(match.scoreP1, match.scoreP2)
        const delta =
            config.kFactor *
            marginMultiplier(
                match.scoreP1 - match.scoreP2,
                config.marginWeight
            ) *
            (resultP1 - expectedP1)

        p1.rating = before1 + delta
        p2.rating = before2 - delta

        const playedAt = toTime(match.playedAt)
        for (const [player, result] of [
            [p1, resultP1],
            [p2, 1 - resultP1],
        ]) {
            player.matches += 1
            if (result === 1) player.wins += 1
            else if (result === 0) player.losses += 1
            else player.draws += 1
            player.peak = Math.max(player.peak, player.rating)
            player.lastPlayedAt = playedAt
        }
        p1.lastChange = delta
        p2.lastChange = -delta

        events.push({
            matchId: match._id === undefined ? null : String(match._id),
            time: playedAt,
            tournament: match.tournament?.name ?? null,
            type: match.type ?? null,
            scoreP1: match.scoreP1,
            scoreP2: match.scoreP2,
            expectedP1,
            resultP1,
            delta,
            // Puntos Elo a favor de P1 que el equipo sumó al diferencial (0 si no
            // se aplicó el término de equipo).
            teamAdjustment,
            p1: {
                id: p1.id,
                name: p1.name,
                before: before1,
                games: games1,
                team: teamName(match.teamP1),
                teamOverall: teamOverall1,
            },
            p2: {
                id: p2.id,
                name: p2.name,
                before: before2,
                games: games2,
                team: teamName(match.teamP2),
                teamOverall: teamOverall2,
            },
        })
    }

    return { players, events, config }
}

// Estado de cada jugador justo antes de `cutoffMs` (milisegundos), a partir de
// los eventos. Un `null` toma todo el historial.
const snapshotBefore = (events, cutoffMs, initialRating) => {
    const snapshot = new Map()

    const entry = (side) => {
        if (!snapshot.has(side.id)) {
            snapshot.set(
                side.id,
                createPlayerState(side.id, side.name, initialRating)
            )
        }
        const state = snapshot.get(side.id)
        state.name = side.name
        return state
    }

    for (const event of events) {
        if (cutoffMs !== null && event.time !== null && event.time >= cutoffMs)
            continue

        for (const [side, sign] of [
            [event.p1, 1],
            [event.p2, -1],
        ]) {
            const state = entry(side)
            const result = sign === 1 ? event.resultP1 : 1 - event.resultP1

            state.rating = side.before + sign * event.delta
            state.peak = Math.max(state.peak, state.rating)
            state.matches += 1
            if (result === 1) state.wins += 1
            else if (result === 0) state.losses += 1
            else state.draws += 1
            state.lastPlayedAt = event.time
            state.lastChange = sign * event.delta
        }
    }

    return snapshot
}

// Ranking de un snapshot: rating descendente y, a igual rating, más partidos y
// luego nombre. Sólo entran los jugadores con algún partido.
const rankPlayers = (snapshot) =>
    [...snapshot.values()]
        .filter((player) => player.matches > 0)
        .sort(
            (a, b) =>
                b.rating - a.rating ||
                b.matches - a.matches ||
                String(a.name).localeCompare(String(b.name))
        )
        .map((player, index) => ({ ...player, position: index + 1 }))

module.exports = {
    calculatePlayerRatings,
    compareChronologically,
    expectedForMatch,
    expectedScore,
    isRateable,
    marginMultiplier,
    rankPlayers,
    resultScore,
    snapshotBefore,
}

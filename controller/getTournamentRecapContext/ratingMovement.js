const { rankPlayers } = require("../../service/playerRatings")
const { round } = require("../../service/playerRatings/presentation")

// `delta`, `bestCumulativeDelta`, `worstCumulativeDelta`, `biggestGainer`,
// `biggestLoser` y `overtakes` salen SOLO de los eventos de rating de los
// partidos de este torneo. Los campos `global*` y `leaderboard` son del ranking
// global y pueden incluir partidos de otros torneos jugados en el medio.
const SCOPE =
    "delta (lo que el jugador ganó o perdió de Elo en este torneo), bestCumulativeDelta y worstCumulativeDelta (el punto más alto y el más bajo de ese delta acumulado, desde 0 al empezar el torneo), biggestGainer, biggestLoser y overtakes se calculan solo con los cambios de Elo de los partidos de este torneo. globalRatingBeforeFirstMatch, globalRatingAfterLastMatch, globalPeakRating y leaderboard son del ranking global: pueden incluir partidos de otros torneos jugados en el medio y no son lo que el jugador ganó o perdió en este torneo."

const MAX_OVERTAKES = 10

// Adelantamientos en el ranking de Elo según el torneo: se parte del rating
// previo al torneo de cada jugador y se le suman solo los cambios de Elo de los
// partidos del torneo, en orden (los partidos de otros torneos no cuentan). Un
// jugador que ya estaba rankeado adelanta a otro cuando estaba estrictamente por
// debajo y, tras el partido, queda estrictamente por encima. Quien entra al
// ranking en este torneo no adelanta ni es adelantado al entrar.
const findOvertakes = ({ before, events, nameOf }) => {
    const ratings = new Map(
        [...before.values()].map((player) => [player.id, player.rating])
    )
    const knownNames = new Map()
    for (const { p1, p2 } of events) {
        knownNames.set(p1.id, p1.name)
        knownNames.set(p2.id, p2.name)
    }
    const nameFor = (id) =>
        nameOf({ id, name: knownNames.get(id) ?? before.get(id)?.name ?? id })
    const overtakes = []

    for (const event of events) {
        const previous = new Map(ratings)

        ratings.set(
            event.p1.id,
            (ratings.get(event.p1.id) ?? event.p1.before) + event.delta
        )
        ratings.set(
            event.p2.id,
            (ratings.get(event.p2.id) ?? event.p2.before) - event.delta
        )

        for (const side of [event.p1, event.p2]) {
            if (!previous.has(side.id)) continue

            for (const [otherId, priorOther] of previous) {
                if (otherId === side.id) continue

                if (
                    previous.get(side.id) < priorOther &&
                    ratings.get(side.id) > ratings.get(otherId)
                ) {
                    overtakes.push({
                        player: { id: side.id, name: nameFor(side.id) },
                        passed: { id: otherId, name: nameFor(otherId) },
                        atMatchId: event.matchId,
                    })
                }
            }
        }
    }

    return overtakes
}

// Movimiento de Elo del torneo por jugador. Usa el timeline del motor de
// ratings (una lectura cacheada) y solo los eventos de los partidos del
// torneo; `delta` nunca depende de otros torneos.
//
// - `matchIds`: ids (string) de los partidos del torneo.
// - `nameOf`: nombre visible de un jugador ({ id, name }).
const buildRatingMovement = ({ timeline, matchIds, nameOf }) => {
    const events = timeline.events.filter(
        (event) => event.matchId !== null && matchIds.has(event.matchId)
    )

    if (events.length === 0) {
        return {
            scope: SCOPE,
            players: [],
            biggestGainer: null,
            biggestLoser: null,
            overtakes: [],
        }
    }

    const times = events.map(({ time }) => time).filter((t) => t !== null)
    const datedAll = times.length === events.length
    const firstTime = datedAll ? Math.min(...times) : null
    const lastTime = datedAll ? Math.max(...times) : null
    // Sin fechas en todos los partidos no hay un "antes" confiable.
    const before = datedAll ? timeline.snapshotAt(firstTime) : new Map()
    const after = timeline.snapshotAt(datedAll ? lastTime + 1 : null)
    const positionBefore = new Map(
        rankPlayers(before).map(({ id, position }) => [id, position])
    )
    const positionAfter = new Map(
        rankPlayers(after).map(({ id, position }) => [id, position])
    )
    const byPlayer = new Map()

    for (const event of events) {
        for (const [side, sign] of [
            [event.p1, 1],
            [event.p2, -1],
        ]) {
            const post = side.before + sign * event.delta

            if (!byPlayer.has(side.id)) {
                byPlayer.set(side.id, {
                    id: side.id,
                    name: nameOf(side),
                    matches: 0,
                    // Globales: rating justo antes del primer y después del
                    // último partido del torneo (incluye lo que pasó en otros
                    // torneos en el medio).
                    globalStart: side.before,
                    globalEnd: post,
                    globalPeak: Math.max(side.before, post),
                    // Del torneo: delta acumulado, desde 0.
                    delta: 0,
                    bestDelta: 0,
                    worstDelta: 0,
                    gamesBefore: side.games,
                })
            }

            const state = byPlayer.get(side.id)

            state.matches += 1
            state.globalEnd = post
            state.globalPeak = Math.max(state.globalPeak, post)
            state.delta += sign * event.delta
            state.bestDelta = Math.max(state.bestDelta, state.delta)
            state.worstDelta = Math.min(state.worstDelta, state.delta)
        }
    }

    const provisionalMatches = timeline.config.provisionalMatches
    const players = [...byPlayer.values()]
        .sort(
            (a, b) =>
                b.delta - a.delta ||
                String(a.name).localeCompare(String(b.name))
        )
        .map((state) => {
            const priorPeak = before.get(state.id)?.peak ?? null

            return {
                player: { id: state.id, name: state.name },
                matches: state.matches,
                delta: round(state.delta) + 0,
                bestCumulativeDelta: round(state.bestDelta) + 0,
                worstCumulativeDelta: round(state.worstDelta) + 0,
                ratingProvisional: state.gamesBefore < provisionalMatches,
                globalRatingBeforeFirstMatch: round(state.globalStart),
                globalRatingAfterLastMatch: round(state.globalEnd),
                globalPeakRating: round(state.globalPeak),
                leaderboard: {
                    before: positionBefore.get(state.id) ?? null,
                    after: positionAfter.get(state.id) ?? null,
                    // Solo tiene sentido si ya tenía historial: su primer
                    // torneo siempre "supera" el rating inicial.
                    isNewAllTimePeak:
                        priorPeak !== null && state.globalPeak > priorPeak,
                },
            }
        })

    const gainer = players.find(({ delta }) => delta > 0) ?? null
    const loser = [...players].reverse().find(({ delta }) => delta < 0) ?? null

    return {
        scope: SCOPE,
        players,
        biggestGainer: gainer ? gainer.player : null,
        biggestLoser: loser ? loser.player : null,
        overtakes: findOvertakes({ before, events, nameOf }).slice(
            0,
            MAX_OVERTAKES
        ),
    }
}

module.exports = { buildRatingMovement, SCOPE }

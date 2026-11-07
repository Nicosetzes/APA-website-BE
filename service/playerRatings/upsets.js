// Sorpresas (upsets) del Elo: partidos con ganador que el puntaje esperado
// menos esperaba. Los usan `/api/ratings/period` y `/api/ratings/history`.
const { displayName, round, toIso } = require("./presentation")

// La sorpresa del período: el partido con ganador que el Elo menos esperaba.
// Los empates y los penales no cuentan, y si el favorito ganó siempre no hay
// sorpresa.
const findBiggestUpset = (periodEvents, names) => {
    let upset = null

    for (const event of periodEvents) {
        if (event.resultP1 === 0.5) continue

        const p1Won = event.resultP1 === 1
        const winnerExpected = p1Won ? event.expectedP1 : 1 - event.expectedP1

        if (
            winnerExpected < 0.5 &&
            (!upset || winnerExpected < upset.expected)
        ) {
            upset = { event, p1Won, expected: winnerExpected }
        }
    }

    if (!upset) return null

    const { event, p1Won, expected } = upset
    const winner = p1Won ? event.p1 : event.p2
    const loser = p1Won ? event.p2 : event.p1

    return {
        matchId: event.matchId,
        playedAt: toIso(event.time),
        tournament: event.tournament,
        type: event.type,
        winner: { id: winner.id, name: displayName(names, winner) },
        loser: { id: loser.id, name: displayName(names, loser) },
        score: {
            winner: p1Won ? event.scoreP1 : event.scoreP2,
            loser: p1Won ? event.scoreP2 : event.scoreP1,
        },
        // Puntaje esperado por el Elo, no la probabilidad de ganar: el empate
        // cuenta como 0,5. Incluye el término de fuerza de equipo cuando hay
        // overall de ambos equipos (rating 2.0).
        winnerExpectedScore: round(expected, 3),
        ratingSwing: round(Math.abs(event.delta)),
    }
}

module.exports = { findBiggestUpset }

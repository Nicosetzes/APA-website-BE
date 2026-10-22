const { predictionKind } = require("../../service/playerRatings/prediction")
const { round, toIso } = require("../../service/playerRatings/presentation")

const PREDICTION_KIND_TO_INSIGHT_KIND = {
    outcomes: "expected_points",
    advance: "advance",
}

const sameId = (a, b) =>
    a !== null && a !== undefined && b !== null && b !== undefined
        ? String(a) === String(b)
        : false

// Qué tipo de predicción tiene el partido, sin reglas nuevas: sale de
// `predictionKind`, la misma que usan las predicciones de playoff y play-in.
//
// - "advance": cruce de partido único; el puntaje esperado es la probabilidad
//   de AVANZAR (incluye alargue y penales). Ojo: el play-in de los formatos que
//   no son `champions_league` también cuenta como "advance", y el de
//   `champions_league` no tiene predicción (`null`).
// - "expected_points": el partido puede terminar empatado (liga, patas 1 y 2
//   de un cruce de ida y vuelta, playoffs de la Champions); el empate vale 0,5.
// - `null`: sin predicción con sentido (ej. la pata 3 que desempata a gol de
//   oro).
const resolveInsightKind = ({ match, tournament }) =>
    PREDICTION_KIND_TO_INSIGHT_KIND[
        predictionKind({
            match: { type: match.type, leg: match.leg },
            tournament,
        })
    ] ?? null

// Lado que ganó, por `outcome` y no por el signo del marcador: un cruce que se
// definió por penales termina con goles iguales (el motor lo cuenta 0,5) pero
// tiene ganador. Sin `outcome` usable cae al marcador.
const resolveWinner = (match) => {
    const outcome = match.outcome

    if (outcome?.draw === true && outcome?.penalties !== true) return "draw"

    const playerId = outcome?.playerThatWon?.id
    const onP1 = sameId(playerId, match.playerP1?.id)
    const onP2 = sameId(playerId, match.playerP2?.id)
    if (onP1 !== onP2) return onP1 ? "p1" : "p2"

    // Los dos lados son del mismo jugador (o no figura): desempata el equipo.
    const teamId = outcome?.teamThatWon?.id
    const teamOnP1 = sameId(teamId, match.teamP1?.id)
    const teamOnP2 = sameId(teamId, match.teamP2?.id)
    if (teamOnP1 !== teamOnP2) return teamOnP1 ? "p1" : "p2"

    if (match.scoreP1 > match.scoreP2) return "p1"
    if (match.scoreP1 < match.scoreP2) return "p2"
    return "draw"
}

const buildSide = (match, event, suffix) => {
    const side = event[suffix.toLowerCase()]
    const player = match[`player${suffix}`]
    const team = match[`team${suffix}`]

    return {
        player: {
            id: player?.id ?? side.id,
            name: player?.name ?? side.name,
        },
        team: { id: team?.id ?? null, name: team?.name ?? null },
        ratingBefore: round(side.before),
        teamOverall: side.teamOverall ?? null,
    }
}

const buildInsight = (event, match, tournament) => {
    const winner = resolveWinner(match)
    // `expectedP1` ya incluye el término de equipo. Se redondea una vez y
    // `winnerExpectedScore` se deriva del valor redondeado para que los campos
    // de la respuesta cuadren exactamente.
    const expectedP1 = round(event.expectedP1, 3)
    let winnerExpectedScore = null
    if (winner === "p1") winnerExpectedScore = expectedP1
    if (winner === "p2") winnerExpectedScore = round(1 - expectedP1, 3)

    return {
        matchId: String(match._id),
        playedAt: toIso(event.time),
        type: match.type ?? event.type,
        playoffId: match.playoff_id ?? null,
        leg: match.leg ?? null,
        p1: buildSide(match, event, "P1"),
        p2: buildSide(match, event, "P2"),
        scoreP1: event.scoreP1,
        scoreP2: event.scoreP2,
        expectedP1,
        // `+ 0` evita que salga `-0`.
        teamAdjustment: round(event.teamAdjustment) + 0,
        kind: resolveInsightKind({ match, tournament }),
        winner,
        // Puntaje esperado del ganador antes del partido. Es probabilidad de
        // avanzar solo si `kind` es "advance"; si no, el empate cuenta 0,5.
        winnerExpectedScore,
        ratingSwing: round(Math.abs(event.delta)),
    }
}

// Un ítem por partido rateado de `matches` (los del torneo), en el orden de
// `events`, que el motor ya emite por `playedAt` ascendente. Los eventos sin
// partido en `matches` son de otro torneo y se omiten. Un partido sin evento
// (`valid: false`, sin goles) no aparece.
const buildMatchInsights = ({ events, matches, tournament }) => {
    const matchesById = new Map(
        matches.map((match) => [String(match._id), match])
    )
    const insights = []

    for (const event of events) {
        const match = matchesById.get(event.matchId)
        if (match) insights.push(buildInsight(event, match, tournament))
    }

    return insights
}

module.exports = { buildMatchInsights, resolveInsightKind, resolveWinner }

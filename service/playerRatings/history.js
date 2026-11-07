// Historial de ratings de un período: un punto por partido y jugador, para
// graficar cómo se movió el Elo. Lo usa `GET /api/ratings/history`.
//
// Es una función pura: recibe lo mismo que `buildPeriodPayload` (los rankings
// en `start` y en `end` y los eventos del período), así que el camino en vivo
// y el guardado dan el mismo resultado por construcción.
const {
    describeParameters,
    displayName,
    round,
    toIso,
} = require("./presentation")
const { eventProbability } = require("./eventProbability")
const { findBiggestUpset } = require("./upsets")

const emptyRecord = () => ({ wins: 0, draws: 0, losses: 0 })

// Mismo criterio que el récord de `/api/ratings/period`: 1 gana, 0 pierde y
// cualquier otro valor (0,5) es empate.
const addToRecord = (record, result) => {
    if (result === 1) record.wins += 1
    else if (result === 0) record.losses += 1
    else record.draws += 1
}

// Equipo de un lado del evento: `{ id, name }`, o `null` si no hay ni nombre ni
// id. Ambos salen del evento (`side.team` y `side.teamId`; `null` si es un
// evento viejo, un partido sin equipo o un dato inválido). El id 0 es válido.
// Con solo uno de los dos, el otro queda en `null`.
const teamOf = (side) => {
    const name =
        typeof side?.team === "string" && side.team !== "" ? side.team : null
    const teamId = side?.teamId ?? null
    return name === null && teamId === null ? null : { id: teamId, name }
}

const isCount = (value) => Number.isInteger(value) && value >= 0

// Punto de un jugador en un partido. `rating` es el valor DESPUÉS del partido;
// `raw` guarda los números sin redondear para calcular mínimo, máximo y
// sorpresas sin arrastrar el redondeo de la respuesta.
const toPoint = ({ event, x, side, opponent, isP1, names }) => {
    const sign = isP1 ? 1 : -1
    const delta = sign * event.delta
    const rating = side.before + delta
    const expected = isP1 ? event.expectedP1 : 1 - event.expectedP1
    const result = isP1 ? event.resultP1 : 1 - event.resultP1
    // Victoria o avance según el tipo de partido: lo trae el evento (`kind`).
    // Un evento sin ese dato resuelve solo los `regular`; el resto, `null`.
    const kind = event.kind ?? (event.type === "regular" ? "win" : null)
    const probability = eventProbability({
        kind,
        expectedP1: event.expectedP1,
        isP1,
    })

    // Tanda de penales (solo en empates en goles definidos así), desde el punto
    // de vista del jugador. El Elo no la cuenta: el resultado sigue siendo 0,5.
    // Sale del evento (`shootoutP1`/`shootoutP2`); sin dato válido, `null`.
    const hasShootout = isCount(event.shootoutP1) && isCount(event.shootoutP2)

    return {
        raw: { rating, delta, expected, result, probability },
        point: {
            seq: event.seq,
            x,
            matchId: event.matchId,
            t: toIso(event.time),
            rating: round(rating),
            delta: round(delta),
            // Partidos propios jugados hasta este, incluido.
            games: side.games + 1,
            tournament: event.tournament,
            type: event.type,
            opponent: { id: opponent.id, name: displayName(names, opponent) },
            score: {
                for: isP1 ? event.scoreP1 : event.scoreP2,
                against: isP1 ? event.scoreP2 : event.scoreP1,
            },
            // Tanda de penales `{ for, against }` del jugador, o `null` si el
            // partido no se definió por penales o no hay dato.
            penalties: hasShootout
                ? {
                      for: isP1 ? event.shootoutP1 : event.shootoutP2,
                      against: isP1 ? event.shootoutP2 : event.shootoutP1,
                  }
                : null,
            // Equipo con el que jugó el jugador y el del rival (`{ id, name }`
            // o `null`), con la misma orientación que `score`.
            teams: {
                for: teamOf(side),
                against: teamOf(opponent),
            },
            // Puntaje esperado por el Elo (el empate cuenta 0,5), no la
            // probabilidad de ganar.
            expectedScore: round(expected, 3),
            // Probabilidad previa de ganar o de avanzar (ver
            // `eventProbability`), o `null` si no se puede clasificar.
            probability,
        },
    }
}

// Mayor sorpresa ganada y peor sorpresa perdida del jugador. Los partidos con
// resultado 0,5 (empates y penales) no cuentan. Ante igual puntaje esperado
// gana el primero en el orden del motor (el de menor `seq`).
const findPlayerUpsets = (entries) => {
    let won = null
    let lost = null

    for (const entry of entries) {
        const { result, expected } = entry.raw
        if (
            result === 1 &&
            expected < 0.5 &&
            (!won || expected < won.raw.expected)
        ) {
            won = entry
        } else if (
            result === 0 &&
            expected > 0.5 &&
            (!lost || expected > lost.raw.expected)
        ) {
            lost = entry
        }
    }

    const toUpset = (entry) =>
        entry && {
            matchId: entry.point.matchId,
            t: entry.point.t,
            opponent: entry.point.opponent,
            expectedScore: entry.point.expectedScore,
            ratingSwing: round(Math.abs(entry.raw.delta)),
            score: entry.point.score,
            teams: entry.point.teams,
            // Cambio de rating CON signo del jugador dueño del upset.
            ratingChange: round(entry.raw.delta),
            probability: entry.point.probability,
        }

    return { biggestUpsetWon: toUpset(won), worstUpsetLost: toUpset(lost) }
}

// Mínimo y máximo del jugador en el período. El rating inicial es un candidato
// más (`seq` y `t` nulos): si todo el período fue una baja, el máximo es donde
// empezó, no el punto más alto del período. Ante empate gana el primero (el
// inicial y después el de menor `seq`).
const findExtremes = (startRating, entries) => {
    let min = { rating: startRating, seq: null, t: null }
    let max = { rating: startRating, seq: null, t: null }

    for (const { raw, point } of entries) {
        if (raw.rating < min.rating) {
            min = { rating: raw.rating, seq: point.seq, t: point.t }
        }
        if (raw.rating > max.rating) {
            max = { rating: raw.rating, seq: point.seq, t: point.t }
        }
    }

    const rounded = (extreme) => ({ ...extreme, rating: round(extreme.rating) })
    return { min: rounded(min), max: rounded(max) }
}

const buildHistoryPayload = ({
    previousRanking,
    currentRanking,
    periodEvents,
    config,
    names,
    dateFrom,
    dateTo,
    playerIds = null,
}) => {
    const initial = config.initialRating
    const previousById = new Map(
        previousRanking.map((player) => [player.id, player])
    )

    // Orden del motor. `x` cuenta TODOS los partidos del período, no solo los
    // de cada jugador, para que las líneas de todos compartan el eje.
    const events = [...periodEvents].sort((a, b) => a.seq - b.seq)

    const entriesById = new Map()
    const matchesTimeline = []
    events.forEach((event, index) => {
        const x = index + 1
        matchesTimeline.push({ x, seq: event.seq, t: toIso(event.time) })

        for (const [side, opponent, isP1] of [
            [event.p1, event.p2, true],
            [event.p2, event.p1, false],
        ]) {
            if (!entriesById.has(side.id)) entriesById.set(side.id, [])
            entriesById.get(side.id).push(
                toPoint({
                    event,
                    x,
                    side,
                    opponent,
                    isP1,
                    names,
                })
            )
        }
    })

    const selected = playerIds?.length ? new Set(playerIds) : null

    const players = currentRanking
        .filter((player) => !selected || selected.has(player.id))
        .map((player) => {
            const previous = previousById.get(player.id) ?? null
            const entries = entriesById.get(player.id) ?? []
            const record = emptyRecord()
            for (const { raw } of entries) addToRecord(record, raw.result)

            // Quien debuta en el período arranca desde el rating inicial.
            const startRating = previous ? previous.rating : initial

            return {
                player: { id: player.id, name: displayName(names, player) },
                start: previous
                    ? {
                          rating: round(previous.rating),
                          matches: previous.matches,
                      }
                    : null,
                end: { rating: round(player.rating), matches: player.matches },
                summary: {
                    ratingChange: round(player.rating - startRating),
                    ...findExtremes(startRating, entries),
                    matchesInPeriod: entries.length,
                    record,
                    position: player.position,
                    previousPosition: previous?.position ?? null,
                    // Positivo: subió lugares en el ranking.
                    positionChange: previous
                        ? previous.position - player.position
                        : null,
                    ...findPlayerUpsets(entries),
                    provisional: player.matches < config.provisionalMatches,
                },
                points: entries.map((entry) => entry.point),
            }
        })

    return {
        success: true,
        dateFrom,
        dateTo,
        scope: { type: "period", tournament: null },
        parameters: describeParameters(config),
        data: {
            matchesInPeriod: events.length,
            players,
            matchesTimeline,
            highlights: {
                biggestUpset: findBiggestUpset(events, names),
            },
        },
    }
}

module.exports = { buildHistoryPayload, findPlayerUpsets }

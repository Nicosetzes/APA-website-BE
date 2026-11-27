const { expectedScore } = require("./index")
const { describeParameters, displayName, round } = require("./presentation")

const MINIMUM_COMPARABLE_MATCHES = 5

const emptyRecord = () => ({ wins: 0, draws: 0, losses: 0 })

const addToRecord = (record, result) => {
    if (result === 1) record.wins += 1
    else if (result === 0) record.losses += 1
    else record.draws += 1
}

const hasTournamentId = (event) =>
    typeof event.tournamentId === "string" && event.tournamentId !== ""

const tournamentName = (event) =>
    typeof event.tournament === "string" && event.tournament.trim() !== ""
        ? event.tournament
        : null

const playedAt = (event) => {
    if (event.time === null || event.time === undefined) {
        return { value: null, precision: null }
    }

    const date = new Date(event.time)
    if (Number.isNaN(date.getTime())) {
        return { value: null, precision: null }
    }

    return {
        value: date.toISOString(),
        precision: event.playedAtPrecision ?? null,
    }
}

const createTournament = (event) => {
    const first = playedAt(event)
    return {
        id: event.tournamentId,
        name: tournamentName(event),
        firstPlayedAt: first.value,
        firstPlayedAtPrecision: first.precision,
        lastPlayedAt: first.value,
        lastPlayedAtPrecision: first.precision,
    }
}

const updateTournament = (tournament, event) => {
    if (tournament.name === null) tournament.name = tournamentName(event)
    const date = playedAt(event)
    if (date.value === null) return
    if (tournament.firstPlayedAt === null) {
        tournament.firstPlayedAt = date.value
        tournament.firstPlayedAtPrecision = date.precision
    }
    tournament.lastPlayedAt = date.value
    tournament.lastPlayedAtPrecision = date.precision
}

const performanceKey = (tournamentId, playerId) =>
    `${tournamentId}\u0000${playerId}`

const createPerformance = (tournamentId, playerId) => ({
    tournamentId,
    playerId,
    matches: 0,
    record: emptyRecord(),
    ratingChange: 0,
    actual: 0,
    expected: 0,
    ratingExpected: 0,
    hasTeamOveralls: false,
})

const addEvent = ({ performance, event, side, opponent, isP1, scale }) => {
    const result = isP1 ? event.resultP1 : 1 - event.resultP1
    const expected = isP1 ? event.expectedP1 : 1 - event.expectedP1
    const delta = isP1 ? event.delta : -event.delta

    performance.matches += 1
    addToRecord(performance.record, result)
    performance.ratingChange += delta
    performance.actual += result
    performance.expected += expected
    performance.ratingExpected += expectedScore(
        side.before,
        opponent.before,
        scale
    )
    performance.hasTeamOveralls ||=
        Number.isFinite(side.teamOverall) &&
        Number.isFinite(opponent.teamOverall)
}

const presentPerformance = (performance) => {
    const {
        tournamentId,
        playerId,
        matches,
        record,
        ratingChange,
        actual,
        expected,
        ratingExpected,
        hasTeamOveralls,
    } = performance

    return {
        tournamentId,
        playerId,
        matches,
        record,
        ratingChange: round(ratingChange),
        actualPercentage: round((actual / matches) * 100),
        expectedPercentage: round((expected / matches) * 100),
        differencePercentagePoints: round(
            ((actual - expected) / matches) * 100
        ),
        teamAdjustmentPercentagePoints: hasTeamOveralls
            ? round(((expected - ratingExpected) / matches) * 100) || 0
            : null,
        comparable: matches >= MINIMUM_COMPARABLE_MATCHES,
    }
}

// Comparación global de actuaciones jugador-torneo. Agrupa únicamente por el
// `tournamentId` de cada evento: un partido de otro torneo intercalado nunca se
// incorpora al cambio de rating ni a las demás métricas de la actuación. La
// respuesta normaliza jugadores, torneos y actuaciones para no repetir nombres
// y rangos en cada fila.
const buildTournamentComparisonsPayload = ({ periodEvents, config, names }) => {
    const players = new Map()
    const tournaments = new Map()
    const performances = new Map()
    const events = [...periodEvents].sort((a, b) => a.seq - b.seq)

    for (const event of events) {
        if (!hasTournamentId(event)) continue

        if (!tournaments.has(event.tournamentId)) {
            tournaments.set(event.tournamentId, createTournament(event))
        } else {
            updateTournament(tournaments.get(event.tournamentId), event)
        }

        for (const [side, opponent, isP1] of [
            [event.p1, event.p2, true],
            [event.p2, event.p1, false],
        ]) {
            players.set(side.id, {
                id: side.id,
                name: displayName(names, side),
            })

            const key = performanceKey(event.tournamentId, side.id)
            if (!performances.has(key)) {
                performances.set(
                    key,
                    createPerformance(event.tournamentId, side.id)
                )
            }
            addEvent({
                performance: performances.get(key),
                event,
                side,
                opponent,
                isP1,
                scale: config.scale,
            })
        }
    }

    return {
        success: true,
        parameters: describeParameters(config),
        data: {
            players: [...players.values()],
            tournaments: [...tournaments.values()],
            performances: [...performances.values()].map(presentPerformance),
        },
    }
}

module.exports = {
    MINIMUM_COMPARABLE_MATCHES,
    buildTournamentComparisonsPayload,
}

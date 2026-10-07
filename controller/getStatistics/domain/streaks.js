// Tipos de racha calculados en la misma pasada. Cada uno es un predicado sobre
// el partido visto desde la perspectiva del jugador.
const STREAK_TYPES = {
    CS: ({ goalsAgainst }) => goalsAgainst === 0,
    G1: ({ goalsFor }) => goalsFor >= 1,
    G2: ({ goalsFor }) => goalsFor >= 2,
    G3: ({ goalsFor }) => goalsFor >= 3,
    W: ({ result }) => result === "W",
    D: ({ result }) => result === "D",
    L: ({ result }) => result === "L",
    U: ({ result }) => result !== "L",
}

// Rachas de mata-mata: sólo las alimentan los partidos de play-in y playoff,
// con el resultado mata-mata (los penales definen ganador y perdedor).
const KNOCKOUT_STREAK_TYPES = {
    KW: (result) => result === "W",
    KU: (result) => result !== "L",
}

// Rachas de tandas de penales: sólo las alimentan los partidos definidos por
// penales con ganador registrado; el resto no las extiende ni las corta.
const SHOOTOUT_STREAK_TYPES = {
    PS: (result) => result === "W",
}

// Rachas por torneo (semis, finales y títulos). Las alimenta
// `tournamentStreaks.applyTournamentStreaks`, después de la pasada de partidos.
const TOURNAMENT_STREAK_TYPES = ["T4", "T2", "T1"]

const ALL_STREAK_TYPES = [
    ...Object.keys(STREAK_TYPES),
    ...Object.keys(SHOOTOUT_STREAK_TYPES),
    ...Object.keys(KNOCKOUT_STREAK_TYPES),
    ...TOURNAMENT_STREAK_TYPES,
]

const isKnockoutStreakMatch = (match) =>
    match?.type === "playin" || match?.type === "playoff"

// Resultado de la tanda en la perspectiva de `playerId`, o null si el partido
// no se definió por penales (o no registra ganador).
const getShootoutResult = (match, playerId) => {
    const outcome = match?.outcome
    const winnerId = outcome?.playerThatWon?.id

    if (outcome?.penalties !== true || !winnerId) return null
    return String(winnerId) === String(playerId) ? "W" : "L"
}

// Resultado mata-mata en la perspectiva de `playerId`: una tanda de penales
// con ganador registrado es victoria o derrota; en el resto vale el marcador
// (una ida empatada, sin penales, es empate).
const getKnockoutResult = (result, match, playerId) => {
    const outcome = match?.outcome
    const winnerId = outcome?.playerThatWon?.id

    if (outcome?.penalties === true && winnerId) {
        return String(winnerId) === String(playerId) ? "W" : "L"
    }
    return result
}

const createStreakState = () => {
    const state = {
        // Partido del jugador visto justo antes (el siguiente en el tiempo).
        _prevStreakMatch: null,
        // Lo mismo, contando sólo los partidos mata-mata.
        _knockoutPlayed: 0,
        _prevKnockoutMatch: null,
        // Lo mismo, contando sólo los partidos definidos por penales.
        _shootoutPlayed: 0,
        _prevShootoutMatch: null,
    }

    for (const type of TOURNAMENT_STREAK_TYPES) {
        // Torneos contados para el tipo y el último visto (el siguiente en el
        // tiempo), para la recencia y el corte.
        state[`_seen${type}`] = 0
        state[`_prev${type}`] = null
    }

    for (const type of ALL_STREAK_TYPES) {
        // Racha en curso. Como los ítems llegan del más nuevo al más viejo,
        // End es el primero visto y Start el último visto. Break es el ítem
        // que la cortó (null si sigue vigente).
        state[`_run${type}`] = 0
        state[`_run${type}Start`] = null
        state[`_run${type}End`] = null
        state[`_run${type}Break`] = null
        state[`_run${type}Active`] = false
        // Máximo del jugador (sólo referencias a los ítems ya en memoria).
        state[`_max${type}`] = 0
        state[`_max${type}Start`] = null
        state[`_max${type}End`] = null
        state[`_max${type}Break`] = null
        state[`_max${type}Active`] = false
        // Racha vigente: la que incluye el ítem más reciente del jugador.
        state[`_active${type}`] = 0
        state[`_active${type}Start`] = null
        state[`_active${type}End`] = null
    }

    return state
}

// `isMostRecent`: el ítem es el más reciente del jugador para este tipo.
// `previous`: el ítem visto justo antes (el siguiente en el tiempo), que corta
// la racha que arranca en este.
const updateRun = (accumulator, type, continues, item, context) => {
    const { isMostRecent, previous } = context
    const runKey = `_run${type}`
    const maxKey = `_max${type}`

    if (!continues) {
        accumulator[runKey] = 0
        accumulator[`${runKey}Start`] = null
        accumulator[`${runKey}End`] = null
        accumulator[`${runKey}Break`] = null
        accumulator[`${runKey}Active`] = false
        return
    }

    if (accumulator[runKey] === 0) {
        accumulator[`${runKey}End`] = item
        accumulator[`${runKey}Break`] = previous
        accumulator[`${runKey}Active`] = isMostRecent
    }
    accumulator[runKey] += 1
    accumulator[`${runKey}Start`] = item

    const run = accumulator[runKey]
    const active = accumulator[`${runKey}Active`]

    if (active) {
        accumulator[`_active${type}`] = run
        accumulator[`_active${type}Start`] = item
        accumulator[`_active${type}End`] = accumulator[`${runKey}End`]
    }

    // Desempate dentro del jugador: la vigente gana; si no, la más vieja.
    if (
        run > accumulator[maxKey] ||
        (run === accumulator[maxKey] && !accumulator[`${maxKey}Active`])
    ) {
        accumulator[maxKey] = run
        accumulator[`${maxKey}Start`] = item
        accumulator[`${maxKey}End`] = accumulator[`${runKey}End`]
        accumulator[`${maxKey}Break`] = accumulator[`${runKey}Break`]
        accumulator[`${maxKey}Active`] = active
    }
}

// These helpers mutate only accumulators privately owned by playerAggregation.
const updateStreaks = ({
    accumulator,
    result,
    goalsFor,
    goalsAgainst,
    match,
}) => {
    const perspective = { result, goalsFor, goalsAgainst }
    // `played` ya se incrementó: vale 1 en el partido más reciente.
    const context = {
        isMostRecent: accumulator.played === 1,
        previous: accumulator._prevStreakMatch,
    }

    for (const [type, predicate] of Object.entries(STREAK_TYPES)) {
        updateRun(accumulator, type, predicate(perspective), match, context)
    }
    accumulator._prevStreakMatch = match

    if (isKnockoutStreakMatch(match)) {
        accumulator._knockoutPlayed += 1
        const knockoutResult = getKnockoutResult(result, match, accumulator.id)
        const knockoutContext = {
            isMostRecent: accumulator._knockoutPlayed === 1,
            previous: accumulator._prevKnockoutMatch,
        }

        for (const [type, predicate] of Object.entries(KNOCKOUT_STREAK_TYPES)) {
            updateRun(
                accumulator,
                type,
                predicate(knockoutResult),
                match,
                knockoutContext
            )
        }
        accumulator._prevKnockoutMatch = match
    }

    const shootoutResult = getShootoutResult(match, accumulator.id)
    if (shootoutResult) {
        accumulator._shootoutPlayed += 1
        const shootoutContext = {
            isMostRecent: accumulator._shootoutPlayed === 1,
            previous: accumulator._prevShootoutMatch,
        }

        for (const [type, predicate] of Object.entries(SHOOTOUT_STREAK_TYPES)) {
            updateRun(
                accumulator,
                type,
                predicate(shootoutResult),
                match,
                shootoutContext
            )
        }
        accumulator._prevShootoutMatch = match
    }

    if (!accumulator._curDone) {
        if (accumulator._curType === null) {
            accumulator._curType = result
            accumulator._curLen = 1
        } else if (accumulator._curType === result) {
            accumulator._curLen += 1
        } else {
            accumulator._curDone = true
        }
    }
}

module.exports = {
    KNOCKOUT_STREAK_TYPES,
    SHOOTOUT_STREAK_TYPES,
    TOURNAMENT_STREAK_TYPES,
    createStreakState,
    getKnockoutResult,
    getShootoutResult,
    isKnockoutStreakMatch,
    updateRun,
    updateStreaks,
}

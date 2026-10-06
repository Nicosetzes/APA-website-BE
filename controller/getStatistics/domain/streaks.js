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

const createStreakState = () => {
    // Partido del jugador visto justo antes (el siguiente en el tiempo).
    const state = { _prevStreakMatch: null }

    for (const type of Object.keys(STREAK_TYPES)) {
        // Racha en curso. Como los partidos llegan del más nuevo al más viejo,
        // endMatch es el primero visto y startMatch el último visto. breakMatch
        // es el partido que la cortó (null si sigue vigente).
        state[`_run${type}`] = 0
        state[`_run${type}Start`] = null
        state[`_run${type}End`] = null
        state[`_run${type}Break`] = null
        state[`_run${type}Active`] = false
        // Máximo del jugador (sólo referencias a los partidos ya en memoria).
        state[`_max${type}`] = 0
        state[`_max${type}Start`] = null
        state[`_max${type}End`] = null
        state[`_max${type}Break`] = null
        state[`_max${type}Active`] = false
        // Racha vigente: la que incluye el partido más reciente del jugador.
        state[`_active${type}`] = 0
        state[`_active${type}Start`] = null
        state[`_active${type}End`] = null
    }

    return state
}

const updateRun = (accumulator, type, continues, match) => {
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
        accumulator[`${runKey}End`] = match
        accumulator[`${runKey}Break`] = accumulator._prevStreakMatch
        // `played` ya se incrementó: vale 1 en el partido más reciente.
        accumulator[`${runKey}Active`] = accumulator.played === 1
    }
    accumulator[runKey] += 1
    accumulator[`${runKey}Start`] = match

    const run = accumulator[runKey]
    const active = accumulator[`${runKey}Active`]

    if (active) {
        accumulator[`_active${type}`] = run
        accumulator[`_active${type}Start`] = match
        accumulator[`_active${type}End`] = accumulator[`${runKey}End`]
    }

    // Desempate dentro del jugador: la vigente gana; si no, la más vieja.
    if (
        run > accumulator[maxKey] ||
        (run === accumulator[maxKey] && !accumulator[`${maxKey}Active`])
    ) {
        accumulator[maxKey] = run
        accumulator[`${maxKey}Start`] = match
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

    for (const [type, predicate] of Object.entries(STREAK_TYPES)) {
        updateRun(accumulator, type, predicate(perspective), match)
    }
    accumulator._prevStreakMatch = match

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

module.exports = { createStreakState, updateStreaks }

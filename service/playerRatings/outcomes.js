const { DRAW_MODEL } = require("../../config/drawModel")

// Reparte el puntaje esperado E del motor en victoria / empate / derrota.
//
// E = P(gana P1) + 0,5 * P(empate). Por eso E no es la probabilidad de ganar
// cuando el partido puede terminar empatado. Dado un empate `draw`:
//   p1Win = E - draw / 2
//   p2Win = (1 - E) - draw / 2
// que siempre suman 1 y conservan E = p1Win + draw / 2.
//
// Es una capa de predicción pura: no toca ni alimenta al motor de ratings.

// Probabilidad de empate sin redondear. `evenness` vale 1 en un duelo parejo y
// tiende a 0 en uno desparejo. El tope `2 * min(E, 1 - E)` evita que alguna
// victoria quede negativa (con los parámetros actuales nunca se activa).
const drawProbability = (expectedScore, model = DRAW_MODEL) => {
    const evenness = 4 * expectedScore * (1 - expectedScore)
    return Math.min(
        model.d0 * Math.pow(evenness, model.k),
        2 * Math.min(expectedScore, 1 - expectedScore)
    )
}

// `{ p1Win, draw, p2Win }` sin redondear (lo usa el script de evaluación).
const splitOutcomes = (expectedScore, model = DRAW_MODEL) => {
    const draw = drawProbability(expectedScore, model)
    return {
        p1Win: expectedScore - draw / 2,
        draw,
        p2Win: 1 - expectedScore - draw / 2,
    }
}

// Igual que `splitOutcomes` pero redondeado a 3 decimales y sumando exactamente
// 1: se redondean p1Win y draw y p2Win es el resto. Si el resto da negativo, el
// faltante se saca de p1Win. `null` si E no es un número finito entre 0 y 1.
const outcomeProbabilities = (expectedScore, model = DRAW_MODEL) => {
    if (
        typeof expectedScore !== "number" ||
        !Number.isFinite(expectedScore) ||
        expectedScore < 0 ||
        expectedScore > 1
    ) {
        return null
    }

    const raw = splitOutcomes(expectedScore, model)
    let p1 = Math.round(raw.p1Win * 1000)
    const draw = Math.round(raw.draw * 1000)
    let p2 = 1000 - p1 - draw

    if (p2 < 0) {
        p1 += p2
        p2 = 0
    }

    return { p1Win: p1 / 1000, draw: draw / 1000, p2Win: p2 / 1000 }
}

module.exports = { drawProbability, outcomeProbabilities, splitOutcomes }

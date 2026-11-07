// Probabilidad previa de un partido ya jugado, desde el punto de vista de un
// jugador, para explicar un resultado sorpresivo en `GET /api/ratings/history`.
//
// Reutiliza EXACTAMENTE el modelo de `prediction.js` (el de los endpoints de
// playoff, play-in y fixture): `predictionKind` decide si el partido es de
// victoria o de eliminación, `outcomeProbabilities` reparte el puntaje esperado
// en victoria / empate / derrota y `toProbabilities` lo redondea para avanzar.
// No cambia el motor ni lo que se guarda: solo lee `expectedP1`.
//
// - "win": partido que puede empatarse. `for` = prob. de ganar, `against` =
//   prob. de perder; el empate queda afuera (`for + against + empate = 1`).
// - "advance": cruce de eliminación de partido único. `for` = prob. de avanzar,
//   `against` = prob. de quedar eliminado (`for + against = 1`).
const { outcomeProbabilities } = require("./outcomes")
const { toProbabilities } = require("./prediction")
// `eventKind` (tipo de cruce de un partido) vive en `matchKind.js`: el motor lo
// usa al armar el evento y se re-exporta acá con el mismo nombre.
const { eventKind } = require("./matchKind")

// `{ kind, for, against }` (3 decimales) o `null` si no hay clasificación o
// `expectedP1` no es válido. `expectedP1` es el valor SIN redondear del evento
// y `isP1` indica de qué lado está el jugador.
const eventProbability = ({ kind, expectedP1, isP1 }) => {
    if (kind === "win") {
        const probabilities = outcomeProbabilities(expectedP1)
        if (probabilities === null) return null
        return isP1
            ? { kind, for: probabilities.p1Win, against: probabilities.p2Win }
            : { kind, for: probabilities.p2Win, against: probabilities.p1Win }
    }

    if (kind === "advance") {
        if (
            typeof expectedP1 !== "number" ||
            !Number.isFinite(expectedP1) ||
            expectedP1 < 0 ||
            expectedP1 > 1
        ) {
            return null
        }
        const { p1, p2 } = toProbabilities(expectedP1)
        return isP1
            ? { kind, for: p1, against: p2 }
            : { kind, for: p2, against: p1 }
    }

    return null
}

module.exports = { eventKind, eventProbability }

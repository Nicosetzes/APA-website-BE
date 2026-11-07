// Tipo de cruce de un partido, sin dependencias. Vive aparte para que el motor
// (`index.js`) pueda guardar el `kind` en cada evento sin crear un ciclo de
// imports (`index.js` -> `eventProbability.js` -> `prediction.js` -> `index.js`).
// `prediction.js` y `eventProbability.js` re-exportan estas funciones con los
// mismos nombres.

// Qué tipo de predicción corresponde a un partido: "outcomes" (se puede
// empatar), "advance" (partido único, hay ganador sí o sí) o `null` (sin
// predicción: ej. el desempate de un cruce a dos piernas o un play-in de
// Champions).
const predictionKind = ({ match, tournament }) => {
    if (match?.type === "regular") return "outcomes"

    if (tournament?.format === "champions_league") {
        return match?.type === "playoff" ? "outcomes" : null
    }

    if (
        tournament?.format === "playoff" &&
        tournament?.playoffMode === "two_legged"
    ) {
        return match?.type === "playoff" &&
            (match?.leg === 1 || match?.leg === 2)
            ? "outcomes"
            : null
    }

    return "advance"
}

const KIND_BY_PREDICTION = { outcomes: "win", advance: "advance" }

// `"win" | "advance" | null` para un partido del historial.
//
// `type: "regular"` se resuelve sin torneo. En playin/playoff hace falta el
// torneo (`format` y `playoffMode`) y el `leg` del partido: sin torneo NO se usa
// el valor por defecto de `predictionKind` (devolvería "advance" y podría ser
// falso), se devuelve `null`. Lo mismo para un `type` desconocido o nulo y para
// los casos sin predicción (play-in de Champions, pata 3 de un cruce a dos
// piernas).
const eventKind = ({ type, leg, tournament }) => {
    if (type === "regular") return "win"
    if (type !== "playin" && type !== "playoff") return null
    if (tournament === null || typeof tournament !== "object") return null

    const prediction = predictionKind({ match: { type, leg }, tournament })
    return KIND_BY_PREDICTION[prediction] ?? null
}

module.exports = { KIND_BY_PREDICTION, eventKind, predictionKind }

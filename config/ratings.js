// Parámetros del rating Elo de jugadores (v1, sin fuerza de equipos).
//
// Los valores salen de `scripts/evaluateRatings.js` (`npm run evaluate:ratings`),
// que los contrasta con el historial real.
const RATING_CONFIG = {
    initialRating: 1500,
    // Cada `scale` puntos de diferencia, el favorito espera 10 veces más
    // "puntaje" que el otro. 400 es la convención del Elo.
    scale: 400,
    // Cuánto se mueve el rating por partido. Con el historial real (~1.700
    // partidos, 5 jugadores) valores entre 4 y 16 predicen casi igual: K bajo
    // acierta un poco más en lo reciente, K alto converge más rápido al
    // principio. 12 es el punto medio.
    kFactor: 12,
    // Peso de la diferencia de gol: multiplica K por 1 + peso * ln(1 + |dif|).
    // 0 ignora la goleada y sólo cuenta ganar, empatar o perder. Con el
    // historial real no mejoró las predicciones, por eso queda en 0.
    marginWeight: 0,
    // Hasta esta cantidad de partidos el rating se marca como provisorio.
    provisionalMatches: 10,
}

module.exports = { RATING_CONFIG }

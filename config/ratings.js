// Parámetros del rating Elo de jugadores (2.0: el puntaje esperado de cada
// partido también considera la fuerza de los equipos usados).
//
// Los valores salen de `scripts/evaluateRatings.js` (`npm run evaluate:ratings`),
// que los contrasta con el historial real.
//
// `version` es la del APA Rating y se registra en `docs/APA-RATING.md`. Al
// cambiar la fórmula o un parámetro: subirla acá, sumar su sección en el doc y
// crear el tag `rating-v<versión>`.
const RATING_CONFIG = {
    version: "2.0",
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
    // Cuánto pesa la fuerza del equipo en el puntaje esperado. Unidad: puntos
    // Elo por cada punto de "overall" de Sofifa del equipo. Con 25, una brecha de
    // 10 de overall equivale a 250 puntos Elo (≈0,81 de puntaje esperado entre
    // dos jugadores iguales). Solo afecta al esperado: el rating mostrado del
    // jugador no incluye este término. 0 reproduce exactamente la 1.0. El valor
    // sale de `npm run evaluate:ratings`.
    teamStrengthWeight: 25,
    // Hasta esta cantidad de partidos el rating se marca como provisorio.
    provisionalMatches: 10,
}

module.exports = { RATING_CONFIG }

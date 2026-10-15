// Parámetros del modelo de empate usado para predecir victoria / empate /
// derrota en partidos donde se puede empatar (liga, Champions, ida y vuelta).
//
// Es un parámetro de PREDICCIÓN: nunca alimenta al motor de ratings. El Elo, la
// `ratingVersion` ("2.0") y el historial no cambian. El modelo solo reparte el
// puntaje esperado E = P(gana) + 0,5 P(empata) entre victoria, empate y derrota.
//
// Forma: la probabilidad de empate es máxima en un duelo parejo y baja a medida
// que el duelo se asimetriza:
//   draw = d0 * (4 * E * (1 - E)) ^ k
// - `d0`: probabilidad de empate en un duelo perfectamente parejo (E = 0,5).
// - `k`: qué tan rápido cae el empate al alejarse de lo parejo. Con 0 el empate
//   es constante; con valores más altos desaparece antes en duelos desparejos.
//
// Los valores se ajustaron con 1.541 partidos de liga de PROD (2026-10-14, tasa
// de empate 16,2 %) usando `npm run evaluate:draws`. En validación cronológica el
// log-loss de tres resultados fue 0,780 con esta forma, 0,787 con un empate
// constante y 1,099 al azar. La precisión esperada es de unos ±3 puntos
// porcentuales. Se probó una propensión al empate por pareja de jugadores y se
// descartó: no mejoró fuera de muestra.
//
// `version` se publica en cada predicción como `drawModelVersion`. Al cambiar
// cualquier valor, subirla acá.
const DRAW_MODEL = {
    version: "draw-1",
    d0: 0.22,
    k: 1,
}

module.exports = { DRAW_MODEL }

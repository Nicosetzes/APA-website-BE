// Niveles ya calculados que el contexto del recap (`GET /api/recaps/context`)
// agrega a cada partido, para que el agente no tenga que inferirlos de números
// crudos ni los cite. Las etiquetas de favorito NO viven acá: salen de
// `FAVORITE_LEVELS` (`config/assistant.js`), los mismos niveles del asistente.

// Diferencia de APA Rating entre los dos jugadores, de menor a mayor corte. Se
// calibró con el ranking real (de ~1230 a ~1660): los pares típicos del grupo
// están entre ~40 (Nico-Leo) y ~180 puntos (Leo-Santi), así que 25 / 75 / 150
// separan "casi igual", "ventaja clara" y "ventaja grande".
const RATING_EDGE_LEVELS = [
    { level: "large", minDiff: 150 },
    { level: "clear", minDiff: 75 },
    { level: "slight", minDiff: 25 },
]

// Diferencia de overall entre los equipos. 4 puntos es lo que el usuario
// considera "bastante"; 8 separa los cruces claramente desparejos (con los
// partidos reales del 21/10, 9 de 13 tienen 4 o más y 4 de 13 tienen 8 o más).
const OVERALL_GAP_LEVELS = [
    { level: "large", minDiff: 8 },
    { level: "notable", minDiff: 4 },
]

module.exports = { OVERALL_GAP_LEVELS, RATING_EDGE_LEVELS }

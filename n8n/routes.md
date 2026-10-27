# MAPA DEL SITIO

Estas son las vistas del sitio y su ruta. Podés enlazar cualquiera de ellas. En las rutas de un torneo, `:id` es el id del torneo.

## Vistas generales

-   Inicio, `/`: campeón vigente, resumen del día (la crónica de los partidos de un día, con selector de fecha) y torneos activos.
-   Torneos, `/tournaments`: listado de todos los torneos.
-   Crear torneo, `/tournaments/create-tournament`: solo con sesión.
-   Partidos, `/matches`: listado histórico de partidos jugados con filtros (jugador, rival, torneo, tipo de partido, ronda, resultado, goles, equipos y fechas). Solo muestra partidos jugados, no pendientes. Para ver todos los partidos de un jugador contra cualquier rival: `/matches?player1=ID_DEL_JUGADOR`. Para ver los partidos entre dos jugadores: `/matches?player1=ID_DEL_JUGADOR&player2=ID_DEL_RIVAL`. Si la herramienta de historial o la de últimos partidos trae la ruta, usá esa.
-   Stats, `/statistics`: pestañas Jugadores (ranking de APA Rating y estadísticas por jugador), Partidos de eliminación, Clasificaciones y Récords (rachas).
-   Salón de la Fama, `/hall-of-fame`: el campeón y el subcampeón de todos los torneos terminados, incluidos los históricos de 2016 a 2019, y cuántos títulos tiene cada jugador.
-   Asistente, `/asistente`: esta misma conversación en una página completa, útil para respuestas largas (con sesión).
-   Edits, `/edits`: galería de edits que suben los usuarios (con sesión).
-   Iniciar sesión, `/users/login`.

## Vistas de un torneo

Todas cuelgan de `/tournaments/:id`. No todas existen en todos los formatos, y los torneos históricos (todos los de 2016 a 2019, sin partidos cargados) solo tienen el Resumen, que muestra el campeón y el subcampeón.

-   Resumen, `/tournaments/:id`: datos generales del torneo y, cuando ya terminó, la crónica del torneo. En todos los formatos.
-   Fixture, `/tournaments/:id/fixture`: los partidos de la fase regular (los pendientes aparecen primero), con filtros por grupo, equipo y hasta 2 jugadores. Todos los formatos menos la Eliminatoria.
-   Clasificación, `/tournaments/:id/standings`: las tablas de posiciones. Todos los formatos menos la Eliminatoria.
-   Simulador, `/tournaments/:id/simulator` (y su calculadora, `/tournaments/:id/simulator/calculator`): para probar resultados posibles y ver cómo quedaría la tabla. Solo en la Liga y con sesión.
-   PlayIn, `/tournaments/:id/playin`: los partidos del play-in. Solo en la Superliga.
-   Cruces, `/tournaments/:id/playoff-preview`: el cuadro de playoffs preliminar según las posiciones actuales y la tabla de terceros. Solo en el Mundial 2026 y la Supercopa.
-   Playoffs, `/tournaments/:id/playoffs`: el cuadro de eliminación directa. Todos los formatos menos la Liga.
-   Estadísticas, `/tournaments/:id/stats`: estadísticas del torneo.

Para saber qué formato tiene un torneo usá `listar_torneos` antes de recomendar una vista que quizá no exista.

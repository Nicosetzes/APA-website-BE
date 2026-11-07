# APA Rating: registro de versiones

Registro interno de las versiones del rating Elo de jugadores. La versión vigente está en `config/ratings.js` (`RATING_CONFIG.version`) y se devuelve en `parameters.version` de `GET /api/ratings` y `GET /api/ratings/period`.

## Cómo se versiona

-   **Mayor (2.0):** cambia el modelo, por ejemplo si empieza a usar la fuerza de los equipos o un dato nuevo. Los ratings de una versión y otra no son comparables.
-   **Menor (1.1):** se reajustan parámetros o se corrige un detalle sin cambiar el modelo.
-   El rating **no se guarda**: se recalcula completo desde el historial en cada consulta. Al publicar una versión nueva, cambia el rating de todo el historial y los números de la versión anterior dejan de existir. Por eso cada sección guarda sus parámetros y, si hace falta comparar, un ranking de referencia.

### Checklist para publicar una versión

1. Cambiar `version` (y lo que corresponda) en `config/ratings.js`.
2. Agregar su sección arriba en este documento. Las secciones anteriores no se editan.
3. Correr `npm run evaluate:ratings` y anotar las métricas en la sección.
4. Commit, y después `git tag rating-v<versión>` y `git push --tags`.

---

## 2.0

**Fecha:** 2026-10-13 (commit pendiente, tag pendiente: `rating-v2.0`)

**Resumen:** Elo entre jugadores humanos que ahora también tiene en cuenta qué equipo usó cada uno. A cada equipo se le suma su "overall" de Sofifa (de la edición del juego con que se jugó el torneo) al puntaje esperado del partido. El rating que se muestra sigue siendo el del jugador: el equipo no se acumula en él.

### Cambios respecto de la 1.0

-   Se agrega `teamStrengthWeight` (25) y el puntaje esperado se calcula con un rating efectivo que suma `teamStrengthWeight * overall_equipo` a cada lado.
-   El cambio de rating (`delta`) se sigue aplicando solo a los ratings de los jugadores y es de suma cero. El rating mostrado no incluye el término de equipo.
-   Si falta el overall de cualquiera de los dos equipos (torneo sin edición cargada, equipo sin rating, partido sin equipos) el partido se calcula exactamente como en la 1.0. Con `teamStrengthWeight` = 0 todo el historial da los números de la 1.0.
-   Lo demás no cambia: `initialRating`, `scale`, `kFactor`, `marginWeight`, `provisionalMatches`, qué partidos cuentan, orden, empates y desempate del ranking.

### Fórmula

Para cada partido, en orden cronológico:

```
rating_efectivo_A = rating_jugador_A + teamStrengthWeight * overall_equipo_A
rating_efectivo_B = rating_jugador_B + teamStrengthWeight * overall_equipo_B
esperado_A = 1 / (1 + 10 ^ ((rating_efectivo_B - rating_efectivo_A) / scale))
resultado_A = 1 si gana A, 0 si pierde, 0,5 si empata
delta = K * margen * (resultado_A - esperado_A)
rating_jugador_A += delta
rating_jugador_B -= delta
```

El término de equipo solo entra al puntaje esperado. El intercambio sigue siendo de suma cero entre jugadores. Como el esperado ya "sabe" que un equipo es mejor, ganar con el equipo fuerte suma menos y ganar con el equipo débil suma más.

### Parámetros

| Parámetro            | Valor | Notas                                                                                                                     |
| -------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------- |
| `teamStrengthWeight` | 25    | Puntos Elo por cada punto de overall: una brecha de 10 de overall pesa 250 puntos Elo (≈ 0,81 de esperado entre iguales). |
| `initialRating`      | 1500  | Sin cambios. Ver la nota de abajo.                                                                                        |
| `scale`              | 400   | Sin cambios.                                                                                                              |
| `kFactor`            | 12    | Sin cambios.                                                                                                              |
| `marginWeight`       | 0     | Sin cambios.                                                                                                              |
| `provisionalMatches` | 10    | Sin cambios.                                                                                                              |

**Sobre el valor inicial:** `initialRating` sigue en 1500. Como las actualizaciones son de suma cero, el promedio del pool se mantiene en el valor inicial y solo importan las diferencias entre jugadores; arrancar en 1000 o en 1500 da el mismo ranking relativo.

**Sobre `teamStrengthWeight`:** en el historial real el log-loss mejora hasta pesos de 20 a 30 y empeora después. Con el 70 % antiguo el mejor fue 20; en el 30 % reciente el mejor fue 30. Se eligió 25 por estar en el medio de esa zona plana (la diferencia entre 20, 25 y 30 es chica frente al error estándar). Un valor 0 vuelve a la 1.0.

### Datos de fuerza de equipo

-   **Fuente de verdad:** `data/team-ratings.csv` (una fila por equipo y edición del juego: overall, ataque, medio, defensa, `capturedAt`) y `data/tournament-editions.csv` (qué edición del juego se usó en cada torneo). Hoy solo se usa `overall`; las otras tres columnas quedan guardadas para futuras versiones.
-   **Artefacto generado:** `data/teamRatings.json`, que sale de los CSV con `npm run build:team-ratings` (valida antes de escribir). El motor lo carga con un `require` plano, así que dev, tests y producción (Vercel) usan exactamente el mismo código y los mismos datos; no se leen CSV en runtime. Un test falla si el JSON está desactualizado respecto de los CSV.
-   **Control de calidad:** `npm run check:team-ratings` valida columnas, rangos (enteros de 40 a 99), fechas, duplicados, que cada torneo tenga edición y que el JSON esté sincronizado. Avisa si el overall se aleja más de 4 del promedio de las tres líneas. Con `-- --uri-env MONGO_URI_PROD` además lee (solo lectura) los partidos reales e informa torneos sin edición y pares equipo/edición sin rating.
-   **Qué valores se cargan:** la última sub-versión de Sofifa de cada edición del juego, con su fecha en `capturedAt` (una por fila).
-   **Excepciones conocidas:**
    -   Lokomotiv Moscow, FIFA 22: `capturedAt` 2022-03-31. El equipo salió del juego por el conflicto Rusia-Ucrania, así que se usó la última sub-versión que lo incluía.
    -   Selecciones nacionales de FIFA 23: salen del parche del Mundial (Sofifa lo llama "World Cup 2022"), publicado el 2022-11-09, que es la fecha que figura en `capturedAt`.
    -   FC 24: solo se jugó un torneo (Chempions 2024). Los equipos que figuraban únicamente en el modo torneo no aparecen en Sofifa como sub-versión (el FK Crvena Zvezda se completó con otra fuente); si llegara a faltar alguno, el partido se calcula como en la 1.0.

### Agregar un torneo o una edición nueva

Hacerlo **antes del primer partido** del torneo nuevo:

1. Definir la edición del juego en `data/tournament-editions.csv` para el nuevo `tournamentId` (columna `edition`, por ejemplo `FC 26`).
2. Agregar a `data/team-ratings.csv` los equipos de esa edición que todavía no estén, con la última sub-versión de Sofifa y su `capturedAt`.
3. Correr `npm run build:team-ratings`.
4. Correr `npm run check:team-ratings` (y, si se quiere, `npm run check:team-ratings -- --uri-env MONGO_URI_PROD` para ver torneos sin edición y pares sin rating en la base real).
5. Commitear los CSV y `data/teamRatings.json` juntos.

Se espera FC 27 en diciembre de 2026. Los datos que falten no rompen nada: esos partidos se calculan como en la 1.0 hasta que se completen.

### Qué no considera todavía

-   Tipo o fase del torneo (fase regular, playoff, final).
-   Diferencia de gol (el soporte existe pero está apagado).
-   Alineación, química de plantel o cambios de plantilla dentro de una edición del juego.
-   Interacción jugador × equipo (que un jugador rinda mejor con ciertos equipos).
-   Un `teamStrengthWeight` distinto por edición del juego.
-   Antigüedad de los partidos o inactividad (no hay decaimiento).
-   K variable según experiencia: el marcador de provisorio es solo informativo.

### Evaluación

Con `npm run evaluate:ratings` sobre el historial real (1.710 partidos, 5 jugadores; 1.694 con overall de ambos equipos, 99,1 %). Se miden los 1.679 partidos evaluables (ambos jugadores con 10 o más partidos previos) y se parten en orden cronológico: 70 % para elegir y 30 % (504 partidos) para medir. Las diferencias son pareadas, sobre los mismos partidos.

| Métrica                              | 1.0 (peso 0) | 2.0 (peso 25) |
| ------------------------------------ | ------------ | ------------- |
| log-loss, todo el historial          | 0,5815       | 0,5357        |
| log-loss, tramo de prueba            | 0,5551       | 0,4802        |
| Brier, todo el historial             | 0,1614       | 0,1432        |
| Brier, tramo de prueba               | 0,1589       | 0,1302        |
| El favorito gana, todo el historial  | 71,0 %       | 76,9 %        |
| El favorito gana, tramo de prueba    | 72,3 %       | 81,0 %        |
| Probabilidad media geométrica (todo) | 0,559        | 0,585         |

El azar (siempre 0,5) da un log-loss de 0,6931. La "probabilidad media geométrica" es `exp(-log-loss)`: la probabilidad que el modelo le daba en promedio a lo que terminó pasando. La mejora de log-loss de la 2.0 sobre la 1.0 es de 0,0458 ± 0,0065 en todo el historial y de 0,0749 ± 0,0134 en el tramo de prueba (error estándar de la diferencia pareada), o sea entre 5,6 y 7 errores estándar por encima de cero.

Log-loss por peso (todo / prueba): 0 → 0,5815 / 0,5551; 10 → 0,5510 / 0,5095; 15 → 0,5420 / 0,4949; 20 → 0,5371 / 0,4853; 25 → 0,5357 / 0,4802; 30 → 0,5375 / 0,4790; 35 → 0,5422 / 0,4813; 40 → 0,5495 / 0,4865.

Efecto de los equipos que queda sin explicar: entre los equipos con 20 o más partidos (79 con la 2.0), 10 se desviaban más de 2 desvíos de lo esperado con la 1.0 y 2 con la 2.0 (por azar se esperarían unos 3,6).

Ranking de referencia con los 1.710 partidos (rating 2.0; entre paréntesis el que daba la 1.0):

| Posición | Jugador | Rating 2.0 | Partidos | Rating 1.0 |
| -------- | ------- | ---------- | -------- | ---------- |
| 1        | Nico    | 1657       | 700      | 1632       |
| 2        | Leo     | 1623       | 766      | 1616       |
| 3        | Max     | 1549       | 767      | 1536       |
| 4        | Santi   | 1439       | 516      | 1446       |
| 5        | Lucho   | 1231       | 671      | 1271       |

### Endpoints

Los mismos de la 1.0 (`GET /api/ratings` y `GET /api/ratings/period`). `parameters` suma `teamStrengthWeight` y `parameters.version` pasa a `"2.0"`. El "esperaba" del mayor batacazo (`winnerExpectedScore`) ahora incluye el término de equipo. Cada evento del motor expone además `p1.teamOverall`, `p2.teamOverall` y `teamAdjustment`. Suma `GET /api/ratings/history` (ver [Historial](#historial-get-apiratingshistory)).

### Prob. de éxito en playoffs

`GET /api/tournaments/:tournament/playoff/matches` y `GET /api/tournaments/:tournament/playin/matches` agregan `prediction` a cada partido: la "Prob. de éxito" de cada lado según el Rating APA 2.0.

-   **Qué es:** el puntaje esperado del motor. En un cruce de partido único no hay empate final (se define por penales, que el motor cuenta 0,5), así que ese puntaje es la probabilidad de **avanzar**. No es la probabilidad de ganar en tiempo regular: el modelo no distingue ganar de empatar y definir por penales.
-   **A qué partidos aplica:** playoff y play-in de partido único (`league_playin_playoff`, `world_cup`, `world_cup_2026`, `super_cup` y `playoff` sin modo o `single`). En `champions_league` y en `playoff` con `playoffMode: "two_legged"` no hay "Prob. de éxito" (no hay una única probabilidad de avanzar): esos partidos usan la predicción de victoria / empate / derrota de la sección siguiente, o `null` en la pata 3 y en el play-in de `champions_league`.
-   **Campos:** `p1` y `p2` (0 a 1, 3 decimales, suman 1), `basis`, `teamAdjusted` (`false` si no se aplicó el término de equipo y se calculó como la 1.0), `provisional` (algún jugador con menos de `provisionalMatches` partidos) y `ratingVersion`. `teamAdjusted` y `provisional` quedan solo en la API; el FE no los muestra.
-   **Viva o previa (`basis`):** un partido jugado usa el evento que calculó el motor (`pre_match`, las odds de ese momento). Un partido por jugar con ambos lados cargados usa los ratings actuales (`current`): puede moverse si antes se juega otro partido de esos jugadores. Un jugador sin historial arranca en `initialRating` con 0 partidos.
-   **`null`:** partido simulado o W.O. (`valid: false`), lado vacío (jugador o equipo), mismo jugador en ambos lados, partido jugado que el motor no puede calificar y cualquier falla del cálculo (se registra `match_predictions_unavailable` y la respuesta sigue en 200).
-   **No se guarda nada.** Cambiar `config/ratings.js` o `data/teamRatings.json` cambia también las odds mostradas de partidos ya jugados; por eso se incluye `ratingVersion`. Los endpoints de playoff y play-in leen los ratings persistidos cuando están al día y, si no, calculan en vivo sobre el historial completo (ver [Lectura desde los ratings persistidos (etapa 2)](#lectura-desde-los-ratings-persistidos-etapa-2)).

### Probabilidades de victoria, empate y derrota (capa de empate)

En un partido donde se puede empatar, el puntaje esperado E del motor no es la probabilidad de ganar: incluye medio punto por el empate. Esta capa reparte E entre victoria, empate y derrota.

-   **Solo predicción.** El rating, `ratingVersion` (`"2.0"`) y el historial no cambian y nada de esto vuelve al motor. No hay versión ni tag nuevos del rating.
-   **Relación con E:** `E = P(gana) + 0,5 · P(empata)`. Invariantes: `p1Win + draw + p2Win = 1` y `p1Win + draw / 2 = E` (con redondeo de 3 decimales, a lo sumo 0,001 de diferencia). Ninguna probabilidad es negativa.
-   **Fórmula:** `draw = min(d0 · (4E(1 − E))^k, 2 · min(E, 1 − E))`, `p1Win = E − draw / 2`, `p2Win = 1 − E − draw / 2`. Parámetros en `config/drawModel.js`: `d0` 0,22 (empate entre iguales), `k` 1 (cuánto cae el empate en duelos desparejos) y `version` `draw-1`. Con estos valores el tope no se activa.
-   **Ajuste:** 1.541 partidos de liga de PROD (2026-10-14), con una tasa de empate de 16,2 %. En validación cronológica el log-loss de tres resultados fue 0,780 con esta forma, 0,787 con un empate constante y 1,099 al azar. La precisión esperada es de unos ±3 puntos porcentuales. Se probó una propensión al empate por pareja de jugadores y se descartó: no mejoró fuera de muestra.
-   **Referencia** (favorito / empate / el otro):

| Duelo (E) | Gana el favorito | Empate | Gana el otro |
| --------- | ---------------- | ------ | ------------ |
| 50 / 50   | 39,0 %           | 22,0 % | 39,0 %       |
| 55 / 45   | 44,1 %           | 21,8 % | 34,1 %       |
| 60 / 40   | 49,4 %           | 21,1 % | 29,4 %       |
| 70 / 30   | 60,8 %           | 18,5 % | 20,8 %       |
| 80 / 20   | 73,0 %           | 14,1 % | 13,0 %       |
| 90 / 10   | 86,0 %           | 7,9 %  | 6,0 %        |

-   **Campos:** `kind` (`"outcomes"`), `p1Win`, `draw`, `p2Win`, `basis`, `teamAdjusted`, `provisional`, `ratingVersion` y `drawModelVersion`. La predicción de "Prob. de éxito" (`p1` / `p2`) no tiene `kind`: así se distinguen.
-   **A qué partidos aplica:** liga (`type: "regular"`) en cualquier formato, playoffs de `champions_league` y las patas 1 y 2 de un playoff `two_legged`. La pata 3 es `null`. Los playoffs de partido único siguen con la "Prob. de éxito", sin cambios.
-   **Endpoints:** `GET /api/tournaments/:tournament/fixture` (cada partido trae `prediction`, `outcomes` o `null`) y `GET /api/tournaments/:tournament/playoff/matches`.
-   **Viva o previa (`basis`):** igual que la "Prob. de éxito". Un partido jugado usa el evento del motor (`pre_match`); uno por jugar usa los ratings actuales (`current`) y puede moverse si se juega antes otro partido de esos jugadores.
-   **`null`:** partido simulado o W.O. (`valid: false`), lado vacío, mismo jugador en ambos lados, partido jugado que el motor no puede calificar y cualquier falla del cálculo (se registra `match_predictions_unavailable` y la respuesta sigue en 200).
-   **Por partido, nunca de la serie.** No se estima la probabilidad de avanzar en un cruce de ida y vuelta.
-   **No validado en ida y vuelta.** Los parámetros se ajustaron solo con partidos de liga. Se aplican a las patas de un playoff `two_legged` por suposición, sin haberlo medido.
-   **Costo:** con los ratings persistidos al día, el fixture hace una agregación, la lectura de los jugadores y la de los eventos pedidos. Si no están al día, suma una lectura liviana (`.lean()`) del historial completo por consulta (con el caché de 30 s), igual que las predicciones de playoff.
-   **Cómo reajustar:** `npm run evaluate:draws -- --uri-env MONGO_URI_PROD` (solo lectura) imprime tasa de empate, lo observado por duelo, la validación cronológica y el mejor ajuste. El script no modifica nada: si hace falta cambiar los valores, editar `config/drawModel.js` a mano y subir `version`.

### Insights de partidos del recap (`matchInsights`)

`GET /api/recaps/context` agrega a cada torneo `matchInsights`: un ítem por partido rateado jugado en el día argentino pedido, ordenado por `playedAt`. Sirve para que el agente del recap diga qué resultados fueron sorpresas. Son números crudos (odds previas, overall de cada equipo, ganador y cuánto movió el rating); las etiquetas y los umbrales los pone quien consume.

-   **De dónde sale:** del timeline en vivo (historial liviano con el caché de 30 s), como los otros contextos de recap. No usa los eventos guardados: los lectores de predicciones y de `/matches` proyectan solo `expectedP1`, `games` y `teamOverall` (o `delta`) y no traen `time`, `before` ni `teamAdjustment` (el lector de `/ratings/period` sí trae `time` y `before`, pero no `teamAdjustment`), y sumar un lector con chequeo de frescura costaría más lecturas que el historial cacheado. Queda como posible mejora.
-   **Costo:** el historial cacheado (0 lecturas con caché caliente, una `.lean()` con caché frío) más una consulta a `matches` con los partidos jugados y válidos del día de todos los torneos (para sumar `playoff_id`, `leg` y `outcome`, que el evento no trae). Nunca una consulta por partido ni por torneo. Si ese día no hubo eventos, ni siquiera se hace la segunda.
-   **Qué partidos entran:** solo los que el motor califica. `valid: false` (W.O., gol de oro, simulados), sin jugar y sin goles no aparecen. Si falla la lectura el endpoint falla: devolver `[]` se confundiría con "no hubo partidos".
-   **`kind`:** sale de `predictionKind`, sin regla nueva. `advance` en cruces de partido único (también el play-in de los formatos que no son `champions_league`); `expected_points` cuando se puede empatar (liga, patas 1 y 2, playoffs de `champions_league`), donde el empate vale 0,5 y `expectedP1` no es la probabilidad de ganar; `null` en la pata 3 y en el play-in de `champions_league`.
-   **`winner`:** sale de `outcome` (con penales el marcador queda igual) y cae al marcador solo si no hay `outcome`. `winnerExpectedScore` es el puntaje esperado del ganador (`null` en empate).
-   **Sin overall:** `teamOverall: null` y `teamAdjustment: 0` (el motor calcula ese partido como la 1.0); el partido se incluye igual.

### Contexto del recap de torneo

`GET /api/tournament-recaps/context?tournamentId&detail` arma, para un torneo terminado, todo lo que el agente de n8n necesita para escribir su recap. El servidor calcula cada número, orden, racha y conteo histórico y entrega una lista priorizada de hechos (`facts`); el modelo de lenguaje solo redacta. Está protegido con `x-recap-secret`, igual que `GET /api/tournament-recaps/pending` y el `POST`. El detalle de cada bloque está en `docs/openapi.yaml`.

-   **De dónde sale:** del timeline en vivo (`retrieveRatingsTimeline`, historial cacheado 30 s) unido por `matchId` con una lectura `.lean()` de los partidos del torneo (que sí trae `valid`, `outcome`, `group`, `playoff_id` y `leg`), más la lista de torneos (`retrieveTournamentsForStatistics`) y los usuarios (apodos). Nunca una consulta por partido ni por torneo. Si falla cualquier lectura, el endpoint falla.
-   **Probabilidades (`odds`):** se calculan del `expectedP1` del evento. Con `kind: expected_points` (liga, patas 1 y 2 de un cruce a dos partidos, playoffs de `champions_league`) se reparte con `outcomeProbabilities` (modelo `draw-1`: `d0 = 0,22`, `k = 1`) en `p1Win`, `draw` y `p2Win`. Con `kind: advance` (cruce de partido único) es la probabilidad de avanzar, no de ganar en los 90 minutos. Sin predicción con sentido (pata 3 a gol de oro, play-in de `champions_league`) o sin evento (`valid: false`), `null`.
-   **Por partido, nunca por serie:** en ida y vuelta y en `champions_league` no hay probabilidad de serie. Los parámetros de empate se ajustaron con partidos de liga y no se validaron en ida y vuelta; el prompt no debe hablar de "probabilidad de ganar el cruce".
-   **Cambio de Elo (`ratingMovement`):** todo número de movimiento de Elo del torneo sale solo de los eventos de rating de los partidos de ese torneo; los partidos de otros torneos jugados en el medio no lo ensucian. `delta` de cada jugador es la suma firmada de esos cambios (suma cero entre los jugadores) y es la única cifra de "lo que ganó o perdió en el torneo". `bestCumulativeDelta` y `worstCumulativeDelta` son el punto más alto y el más bajo del delta acumulado partido a partido, desde 0 al empezar el torneo (no son ratings). `biggestGainer`, `biggestLoser` y los hechos `rating_biggest_gainer` y `rating_biggest_loser` salen del `delta`. `overtakes` suma solo los cambios del torneo al rating previo de cada jugador. Los campos **globales** son `globalRatingBeforeFirstMatch` y `globalRatingAfterLastMatch` (`snapshotAt` justo antes del primer partido y justo después del último del jugador), `globalPeakRating` y `leaderboard.before` / `after` (posiciones en el ranking global): **pueden incluir partidos de otros torneos** jugados en el medio, así que `globalRatingAfterLastMatch - globalRatingBeforeFirstMatch` puede no coincidir con `delta` (en PROD hasta unos 47 puntos en la Superliga Argentina 2023). `dataQuality.warnings` informa cuántos partidos ajenos se jugaron durante el torneo y `scope` repite la distinción. `isNewAllTimePeak` es verdadero si el pico global alcanzado en un partido del torneo supera el pico previo de un jugador que ya tenía historial; el hecho `new_peak_rating` lo dice como dato del rating global, no como ganancia del torneo. Cambió la forma del contexto respecto de `tournament-recap-1` (`start`, `end`, `peakInTournament` y `lowInTournament` ya no existen), por eso `contextVersion` pasó a `tournament-recap-2`. `tournament-recap-3` cambió la forma de los contadores de `titleContext` (ver "Títulos" y "Rendimiento contra lo esperado"). La versión actual es `tournament-recap-5`: `standings.progress[].leaders[]` y `standings.closeRace[]` traen `matchesPlayed` y `matchesLeft`; `closeRace` se toma con 10 partidos por jugar (ya no a un porcentaje, sin `afterPct`) y, junto con `progress` y `leaderChanges`, solo existe para tablas de 30 partidos o más; `titleContext.champion` trae `previousTitle` y `defendedEdition`.
-   **Criterio de V/E/D:** `playerStats` y `headToHead.inTournament` cuentan por `outcome` (quien gana por penales suma una victoria y los penales van aparte en `penaltyShootouts`), igual que `players/info` y `statistics`. `GET /api/tournaments/:id/summary` cuenta por signo del marcador, así que un partido ganado por penales figura como empate: el recap usa el criterio de `outcome` y lo declara en `playerStats.criterion`. Solo cuentan partidos válidos entre jugadores distintos. `headToHead.allTimeBefore` sí cuenta por marcador (un empate a penales es empate) y lo aclara en `criterion`.
-   **Rendimiento contra lo esperado (`playerStats.players[].performanceVsExpectedPct`):** porcentaje entero con signo, `(reales / esperados - 1) * 100`, que el servidor calcula para que el agente no divida ni interprete puntos. `+24` significa que el jugador sumó 24 % más puntos de los que predecía el Elo y `-40`, 40 % menos. Compara `actualPointsInRatedMatches` con `expectedPoints`, ambos sobre los mismos partidos (solo los que tienen predicción; un partido sin evento no suma a ninguno). La escala es la misma en las dos formas de predicción: en `kind: expected_points` lo esperado de un lado es `3 * P(victoria) + P(empate)` y en `kind: advance` (cruce de partido único) es `3 * P(avanzar)`, mientras que los puntos reales son 3 por victoria, 1 por empate y 0 por derrota; en un cruce de partido único no hay empate (quien gana por penales suma 3, igual que en el rating, donde los penales valen 0,5), así que las victorias reales se comparan con la suma de probabilidades de avanzar, y mezclar partidos de las dos formas en un mismo torneo (Superliga) también es consistente. Es `null` (no 0) si el jugador tiene menos de `PERFORMANCE_MIN_RATED_MATCHES` (3, en `config/tournamentRecap.js`) partidos con predicción o si lo esperado es 0. En un torneo de pocos partidos (un playoff) el porcentaje es volátil: con 4 cruces una victoria de más o de menos mueve decenas de puntos porcentuales. El hecho `standings_overperformance` ahora lo informa en porcentaje.
-   **Partidos `valid: false`:** (por ejemplo entre dos equipos del mismo jugador, cargados para avanzar el cuadro) no cuentan en ninguna estadística: `playerStats`, `headToHead`, `ratingMovement` (no tienen evento de rating) y `facts` (sorpresas, penales, remontadas y goles de oro) los ignoran, y `detail=compact` no los destaca entre los regulares. La excepción es la tabla `standings`, que sí los cuenta porque la tabla de la liga los necesita; lo aclara en `standings.criterion`, para que el agente no mezcle el `played` de la tabla con el PJ de `playerStats`. El recorrido del campeón y los cruces los muestran rotulados (`decidedBy`: `walkover` o `same_player_pick`).
-   **Títulos (`titleContext`):** cuenta todos los torneos que lista el Salón de la Fama: `ongoing: false`, `valid != false` y campeón (`outcome.champion`), **legacy incluidos**; es la misma fuente que usa el FE (`GET /api/tournaments?status=finalized`). Se ordenan por `closedAt` y luego `_id` y se cuentan los anteriores a este más este; sin `closedAt` un torneo va primero y suma una advertencia. Con el inventario de PROD del 2026-10-06 da Leo 9, Max 6, Nico 4, Santi 1 y Lucho 0 (lo reproduce `test/tournamentRecapTitles.test.js`). Los contadores (`ranking[]`, `champion` y `runnerUp`) se calculan al cierre de este torneo e **incluyen este torneo** (`countsIncludeThisTournament: true`; `beforeThisTournament` trae los mismos sin él), por torneo y una sola vez por jugador: `titles` (campeonatos); `runnerUps` (subcampeonatos en cualquier formato, también `league`, en torneos que el jugador no ganó); `titlesAndRunnerUps` (torneos distintos con título o subcampeonato, igual a `titles + runnerUps`); `finalsPlayed`, `finalsWon` y `finalsLost` (solo formatos con final, es decir todos menos `league`, que tiene campeón y subcampeón pero no final). Campeón = final jugada y ganada; subcampeón que no ganó = jugada y perdida; un jugador que tuvo los dos equipos de la final (o, en `league`, el primero y el segundo puesto) cuenta una vez, como título y, si hay final, como final ganada, nunca como subcampeonato. Por eso el viejo `finals` (títulos más subcampeonatos) y el `finalsPlayed` que contaba subcampeonatos de liga como finales ya no existen. `sameCompetition` repite los seis contadores solo para torneos de la misma familia que el recap (por ejemplo, finales jugadas y ganadas de Eliminatoria) y `runnerUp.isAlsoChampion` avisa cuando el finalista es el campeón. El ranking desempata por `titles` y luego por `titlesAndRunnerUps`. En PROD, a la fecha de cierre de la Copa Argentina 2025/26, Leo tiene 13 torneos con título o subcampeonato contando esta Copa Argentina (12 antes de ella: `beforeThisTournament`). `consecutiveTitles` y `wasDefendingChampion` son dos cosas distintas. `consecutiveTitles` cuenta títulos en torneos seguidos que el campeón jugó, **de cualquier formato**, e ignora los que no jugó (no cortan la racha; uno que jugó y no ganó sí). `previousTitle` (`{ tournamentId, name, competitionLabel, closedAt }`) es el torneo inmediatamente anterior de esa racha, el último que el campeón jugó antes de este, y solo existe si lo ganó (`consecutiveTitles >= 2`); si no es `null`. `wasDefendingChampion` mira solo la edición anterior de la **misma familia** (mismo formato, aunque en el medio haya otros torneos), y `defendedEdition` (`{ tournamentId, name, closedAt }`) nombra esa edición (es el último elemento de `competition.previousWinners`) o es `null`. Ejemplo (Torneo Argentino 2021/22, Leo): `defendedEdition` es Torneo Argentino 2018 y `previousTitle` es Chempions 2019/20 (otro formato); el hecho `title_milestone` lo dice con ambos nombres para que el agente no mezcle "defendió" con "viene de ganar".
-   **Familia de competencia:** sale del `format` del torneo, no de su nombre (`COMPETITION_FAMILIES` en `config/tournamentRecap.js`). `league_playin_playoff` es "Superliga", `league` "Liga", `playoff` "Eliminatoria" (eliminatoria pura, a partido único o ida y vuelta: Copa Argentina, Copa Afinidades, aunque esta última sea decorativa), `world_cup` y `world_cup_2026` "Mundial" (una sola familia), `champions_league` "Champions", `super_cup` "Supercopa" y `american_cup` "Copa América" y `club_world_cup` "Mundial de Clubes" (formatos legacy: están en el enum del modelo pero no se pueden crear torneos nuevos con ellos; cuentan como familias de pleno derecho). Así, un jugador que gana su 4º `league_playin_playoff` gana "su 4ª Superliga" sin importar si el torneo se llamó Europea, Inglesa, Argentina o Internacional, y la "Superliga ítalo-española 2022/23" (formato `league`) cuenta como Liga. Un formato ausente o desconocido cae en una familia aparte (`key` el texto del formato o `unknown`, etiqueta genérica) y suma una advertencia en `dataQuality.warnings`. `titlesSameFormat` se eliminó por redundante: `titlesSameCompetition` (`key`, `label`, `count`, `ordinal`) es el conteo de títulos del campeón en su familia, y `competition.previousWinners` lista los campeones de las ediciones anteriores de la familia, de la más vieja a la más nueva.
-   **Tabla de posiciones:** `standings.final` replica el desempate de `createGetStandingsTableByTournamentId` (puntos, diferencia de gol, goles a favor y menos goles en contra; un test de paridad lo comprueba) y `progress` la recalcula en una sola pasada al 25, 50, 75 y 100 % de los partidos de cada grupo. `closeRace[]` es el estado de la tabla cuando faltaban `matchesLeft` partidos (10 en una liga de tabla única, `TITLE_RACE_LAST_MATCHES` en `config/tournamentRecap.js`): `group`, `leader`, `leaderTeamId`, `gapToSecond`, `matchesPlayed` y `matchesLeft`, sin porcentaje. Cada `progress[].leaders[]` y cada `closeRace[]` traen `matchesPlayed` y `matchesLeft`: los partidos regulares del grupo ya jugados en ese punto y los que faltaban para cerrarlo (`matchesPlayed + matchesLeft` es el total del grupo; en una liga sin grupos, de la tabla entera). **Solo para tablas con muchos partidos:** `progress`, `leaderChanges` y `closeRace` incluyen únicamente a los grupos con al menos `LEAGUE_PROGRESS_MIN_MATCHES` (30) partidos regulares. Una liga de tabla única y los grupos de `league_playin_playoff` (decenas de partidos) los traen; los grupos chicos de `world_cup`, `world_cup_2026`, `champions_league` o `super_cup` no, y si ningún grupo llega, `progress` es `[]`, `leaderChanges` es `{}` y `closeRace` es `[]` (`final` siempre trae todos los grupos). Un grupo que no llega no aparece en `progress[].leaders`, `leaderChanges` ni `closeRace`, y los hechos `leader_changes` y `title_race_decided_on_last_matches` salen de esos datos, así que tampoco los generan. Se cuentan con el mismo universo que la tabla, `valid: false` incluidos (ver `standings.criterion`), para que el agente diga "con un cuarto de torneo jugado" o "a falta de solo 10 partidos" sin calcular ni mostrar porcentajes.
-   **Rating provisorio:** `ratingMovement.players[].ratingProvisional`, `participants[].ratingProvisional` y la advertencia de `dataQuality` significan que el jugador tenía menos de `provisionalMatches` (10) partidos con rating **antes de su primer partido del torneo**, no que siga provisorio al final (en un torneo de 200 partidos deja de serlo a los pocos partidos). Por partido, `matches[].p1.provisional` y `p2.provisional` valen `true` si ese jugador tenía menos de 10 partidos previos en ESE partido. Las probabilidades de un partido con un lado provisorio son poco confiables, por eso los hechos `biggest_upset` y `upsets` los excluyen (la sorpresa sigue marcada en `matches[].upset` e `importance`).
-   **Backfill controlado (`backlog`):** `GET /api/tournament-recaps/pending` lista en `backlog` los torneos terminados con partidos y sin recap, salvo los de `BACKFILL_EXCLUDED_TOURNAMENTS` (`config/tournamentRecap.js`, clave: id del torneo, con el nombre de comentario). Hoy excluye Chempions 2019/20 (`64697ac9d542ff4ada3038d3`, `champions_league`): su contexto compact mide unos 64.500 caracteres (el tope de prueba `CONTEXT_COMPACT_MAX_CHARS` es 70.000), y se prefiere decidir a mano los torneos viejos (el backfill arranca en Torneo Argentino 2021/22). La exclusión solo afecta a `backlog` (y a su `count`): la ventana diaria (`data`, `closedAfter` de 7 días, `limit` 3), `counts` y el contexto por `tournamentId` no cambian, así que una corrida manual sobre un torneo excluido sigue funcionando.
-   **Tamaño:** `detail=compact` (por defecto) manda todo el play-in y el playoff, los 15 partidos regulares más importantes (`importance`: etapa base + sorpresa + penales o goleada + partido entre los dos primeros del grupo, tope 5) y los demás bloques; hay un test con 201 partidos que exige menos de `CONTEXT_COMPACT_MAX_CHARS`. `full` trae todos los partidos y queda para depurar.
-   **`contextHash`:** sha256 del JSON de `data`, sin horas de la consulta; sirve para detectar un recap viejo si después se corrige un resultado (por ahora solo se guarda en `generation.contextHash`). `compact` y `full` dan hashes distintos.
-   **Umbrales:** viven en `config/tournamentRecap.js` (sorpresa por debajo de 0,30 de puntaje esperado, goleada de 4 goles, rachas, etc.) y son valores iniciales a calibrar con torneos reales. No se emite un hecho de "partido con más goles": en este juego los goles altos son normales.
-   **Nombres:** el nombre visible es el apodo del usuario (`buildNameIndex`) y, si no hay, el que quedó guardado en el partido o el torneo. En toda la app es "Max".

### Cómo se lee el historial (timeline)

Todos los endpoints de rating (`/ratings`, `/ratings/period` y las predicciones de playoff y play-in) pasan por un único punto, el **timeline** (`service/playerRatings/timeline.js`, `buildRatingsTimeline`): corre el motor una vez y expone `events`, `config`, `eventsByMatchId` y `snapshotAt(corte)`. Ningún controller llama al motor directo. Los scripts de evaluación (`scripts/evaluateRatings.js`, `service/playerRatings/evaluation.js`) sí lo usan directo porque prueban parámetros distintos.

El historial se lee con `dao/findRatingMatches`: `.lean()` (objetos planos, sin hidratar documentos Mongoose) y una proyección mínima con lo que usa el motor: `playerP1/2.id` y `.name`, `teamP1/2.id` y `.name`, `scoreP1/2`, `tournament.id` y `.name`, `type`, `leg`, `playedAt`, `playedAtPrecision` y de `outcome` solo `penalties`, `teamThatWon.id` y las dos puntuaciones de la tanda. Además hace **una** lectura de torneos (`format` y `playoffMode`, ~30 documentos) en paralelo con la de partidos y adjunta a cada partido su `tournamentContext` (`null` si no hay torneo resoluble): con eso el motor guarda en cada evento el tipo de cruce (`kind`). Esa función es la única que arma los partidos para el motor, así que el camino en vivo, el recompute, el verify y la sincronización al escribir producen el mismo `kind`. No se ordena en la consulta porque el motor ordena por su cuenta (`playedAt` y luego `_id`). Si el motor pasa a usar otro campo del partido, hay que sumarlo a `RATING_PROJECTION`; un test (`test/ratingsTimeline.test.js`) compara los eventos con el documento entero y con la proyección. Para el resto de las estadísticas (estadísticas globales, equipos históricos y cara a cara) se usa `dao/findAllMatches`, que también lee con `.lean()` pero con una proyección más amplia (incluye `outcome`, `playoff_id` y `playedAtPrecision`).

#### Caché en memoria del historial

`service/retrieveRatingMatches` guarda el historial liviano en memoria (`utils/singleFlightCache.js`) y lo comparten los caminos en vivo de los endpoints de rating (`/ratings`, `/ratings/period`, `playoff/matches`, `playin/matches` y el fixture). El motor se vuelve a calcular en cada pedido (unos 5 ms); lo que se evita es la lectura de la base (~0,5 s).

-   **TTL:** 30 s por defecto. Se cambia con la variable de entorno `RATING_MATCHES_CACHE_TTL_MS` (`0` lo desactiva). Ver `config/cache.js`.
-   **Pedidos simultáneos** comparten una sola lectura.
-   **Escrituras:** `middleware/invalidateRatingCache.js` descarta el historial cuando termina cualquier `POST`, `PUT`, `PATCH` o `DELETE` bajo `/api` (también si falló o se cortó la conexión), así que cargar o borrar un resultado se ve al instante en esa instancia. Una lectura que había empezado antes de la escritura no se guarda.
-   **Límite:** el caché es por instancia. En Vercel cada instancia serverless tiene el suyo y se pierde cuando se enfría. Otra instancia puede mostrar datos viejos hasta que venza el TTL, y los cambios hechos fuera de la API (scripts de migración, ediciones directas en la base) se ven recién al vencer el TTL.
-   **Compartido y congelado:** el arreglo que devuelve está congelado y lo comparten todos los llamadores; no hay que modificarlo (el motor lo filtra y ordena en copias).

### Ratings persistidos (etapa 1)

Se guarda la salida del motor en dos colecciones **derivadas**, para que más adelante las pantallas lean de ahí en vez de recalcular todo el historial. `matches` (`face-to-face`) sigue siendo la única fuente de verdad: las dos colecciones se pueden borrar y reconstruir en cualquier momento. Las escriben y verifican dos scripts; desde la etapa 2 tres endpoints las leen (ver [Lectura desde los ratings persistidos (etapa 2)](#lectura-desde-los-ratings-persistidos-etapa-2)) y desde la etapa 3 cada resultado cargado, editado o borrado las actualiza (ver [Actualización al escribir (etapa 3)](#actualización-al-escribir-etapa-3)). Después se sumaron `/ratings` (ranking), `/ratings/period` y `/matches` (columna `ratingChange`), ver [Ranking (`GET /api/ratings`) desde los ratings persistidos](#ranking-get-apiratings-desde-los-ratings-persistidos), [Período (`GET /api/ratings/period`) desde los ratings persistidos](#período-get-apiratingsperiod-desde-los-ratings-persistidos) y [Variación de Elo en `/matches`](#variación-de-elo-en-matches). Los contextos de recap siguen calculando en vivo.

#### `player-ratings` (un documento por `(ratingVersion, id)`)

-   `ratingVersion`, `id`, `name`, `rating`, `peak`, `matches`, `wins`, `draws`, `losses`, `lastPlayedAt`, `lastChange`.
-   `eventCount`: cantidad de eventos del jugador (siempre igual a `matches`; sirve de chequeo de consistencia).
-   `fingerprint` y `computedAt`.
-   `source`: `{ ratedMatches, maxUpdatedAt }`, la huella de los partidos de los que salió la corrida (cantidad que cumple el filtro del motor y mayor `updatedAt`). Es el mismo valor en todos los jugadores de una corrida y los eventos no lo tienen. Lo usa la etapa 2 para saber si lo guardado sigue al día. Los documentos de la etapa 1 no lo tienen hasta que se re-corra `recompute:ratings -- --apply`.
-   Solo hay jugadores con al menos un partido rateado.
-   Índice: único `(ratingVersion, id)`.

#### `rating-events` (un documento por `(ratingVersion, matchId)`)

-   `matchId` es el `_id` del partido en `face-to-face` (`ObjectId`): así se une un evento con su partido.
-   `seq`: posición cronológica del partido, desde 1, en el orden del motor (`playedAt` y luego `_id`).
-   `time`, `tournament`, `type`, `scoreP1`, `scoreP2`, `expectedP1`, `resultP1`, `delta`, `teamAdjustment`.
-   `p1` y `p2`: `id`, `name`, `before`, `after`, `games`, `team`, `teamId`, `teamOverall`. `after` se deriva igual que en el historial: `p1.after = p1.before + delta` y `p2.after = p2.before - delta`. `teamId` (esquema 2) es el id del equipo tal cual está en el partido (número o string; el `0` es válido), `null` si el lado no tiene equipo o el id no es un número finito ni un string no vacío.
-   Campos del esquema 2, todos opcionales (`null` si no hay dato, nunca ausentes en lo que escribe el builder) y derivados solo del partido y de su torneo; ninguno entra en el cálculo del rating:
    -   `kind`: `"win"`, `"advance"` o `null`. Es el tipo de cruce que usa la probabilidad del historial (misma lógica que `eventKind`, ver [Cómo se identifica el tipo](#historial-get-apiratingshistory)).
    -   `tournamentId` (string), `leg` (1, 2 o 3), `tournamentFormat` y `tournamentPlayoffMode`: el torneo del partido y los insumos crudos de `kind`.
    -   `playedAtPrecision`: precisión de la fecha (`exact`, `day`, `month`, `year` o `approx`, ver `utils/playedAt.js`).
    -   `shootoutP1`, `shootoutP2` y `shootoutWinner` (`"p1"` o `"p2"`): tanda de penales de cada equipo y lado ganador de la definición. Solo hay datos en un empate en goles definido por penales; los tres son `null` o ninguno lo es. El rating no cambia: `resultP1` sigue valiendo 0,5.
-   `fingerprint` y `computedAt`.
-   Índices: único `(ratingVersion, matchId)`; `(ratingVersion, seq)` **no único** (insertar un partido en el medio desplaza el `seq` de muchos eventos y un único fallaría de forma transitoria); `(ratingVersion, p1.id, seq)` y `(ratingVersion, p2.id, seq)` para leer la serie de un jugador; `(ratingVersion, time, seq)` (`rating_event_version_time_seq_v1`, **no único**) para leer los eventos de un período y la cola posterior, que usa `/ratings/period`. Como los demás, se crea solo con `recompute:ratings -- --apply`; sin él la consulta funciona igual, recorriendo la colección.

#### Fingerprint

Es un SHA-256 del JSON canónico (claves ordenadas) de `config/ratings.js` (todos los parámetros, incluida `version`), `data/teamRatings.json`, `RATINGS_STORE_SCHEMA_VERSION` (cambia la forma de los documentos; hoy vale **2**: la 1 era la de la etapa 1 y la 2 suma los ids de equipo, el tipo de cruce, el torneo, la precisión de la fecha y los penales al evento) y `RATINGS_ENGINE_VERSION` (se sube si cambia la lógica del motor sin tocar la configuración). Ambas constantes están en `service/ratingsStore/constants.js`. No depende de `computedAt` ni de `config/drawModel.js` (el modelo de empate es de predicción y no alimenta al motor). Si cambia, lo guardado quedó desactualizado y hay que re-correr `recompute:ratings`.

#### Cómo correrlo

-   `npm run recompute:ratings` es un **dry-run**: lee el historial, recalcula, compara con lo guardado e imprime el resumen del diff. No escribe nada.
-   `npm run recompute:ratings -- --apply` crea los índices de las dos colecciones, aplica el diff (`bulkWrite` en tandas de 500) y vuelve a leer para comprobar que no quedó ninguna diferencia. Solo escribe en `player-ratings` y `rating-events`; `matches` no se toca. En una base que no es de pruebas exige además `--allow-production`.
-   `npm run verify:ratings` es **solo lectura**: no acepta `--apply`, no crea índices y sale con código 1 si hay drift y 0 si coincide.
-   Ambos aceptan `--uri-env MONGO_URI_PROD` (por defecto `MONGO_URI`) y `--sample <n>` (ids de ejemplo del resumen). La URI nunca se imprime, solo el nombre de la base.
-   Desde la etapa 3 la API mantiene las colecciones al día cuando se carga, edita o borra un resultado. El script sigue siendo necesario para el relleno inicial, cuando cambia la fórmula o los datos de equipos (cambia el fingerprint), cuando una corrección toca muchos resultados (diff grande) y después de cualquier cambio hecho fuera de la API (migraciones, ediciones directas en la base).

#### Qué es un drift

Que lo guardado no coincide con lo que calcula hoy el código sobre los partidos: faltan eventos o jugadores, sobran (huérfanos, por ejemplo de un partido borrado), hay valores distintos (un resultado editado, otro `seq`), el `fingerprint` guardado no es el actual, o el `source` de los jugadores falta (documentos de la etapa 1) o no coincide con el de los partidos de hoy. `verify:ratings` lo informa con el motivo. El arreglo siempre es el mismo: volver a correr `npm run recompute:ratings -- --apply`.

Excepción: si en una etapa futura el builder deja de emitir un campo (un rename o un campo eliminado), `recompute:ratings -- --apply` solo hace `$set` y nunca `$unset`, así que los documentos viejos conservarían el campo y el diff no convergería. Un cambio de forma de los documentos requiere vaciar `player-ratings` y `rating-events` antes de recomputar (son derivadas, se reconstruyen desde `matches`). Subir `RATINGS_STORE_SCHEMA_VERSION` cambia el fingerprint pero no separa los documentos viejos de los nuevos.

#### Primera corrida

El camino con la base real (casteo de `matchId` en `bulkWrite`, `$set` anidado, `createIndexes()`, `Date` y números) se probó solo con fakes. Antes de producción conviene hacer el dry-run y luego `--apply` sobre una base de desarrollo (`*-dev`), y recién después `npm run recompute:ratings -- --apply --uri-env MONGO_URI_PROD --allow-production`.

#### Qué pasa al desplegar

Desde la etapa 2 la app carga los modelos (`dao/models/playerRatings.js` y `dao/models/ratingEvents.js`) para leer, pero tienen `autoIndex` y `autoCreate` apagados. Las colecciones y sus índices no se crean al desplegar: solo cuando se corre el script con `--apply`. Mientras no existan (o estén desactualizadas) los endpoints usan el camino en vivo. El camino de escritura (`dao/applyRatingDiff`, `dao/findStoredRatingDocuments`, `service/ratingsStore/` salvo la frescura y el fingerprint) no lo cargan la lectura ni los barrels `dao/index.js` y `service/index.js`; desde la etapa 3 lo cargan los controllers de cargar y borrar resultados, por ruta directa (`service/syncRatingsAfterWrite`). Los índices siguen sin crearse al desplegar: hay que correr `recompute:ratings -- --apply` ANTES de confiar en la actualización al escribir, porque en ejecución hace `upsert` y sin el índice único `(ratingVersion, id)` / `(ratingVersion, matchId)` una carrera entre instancias podría duplicar un documento.

**Esquema 2 (historial sin lecturas auxiliares).** Al desplegar la versión que sube `RATINGS_STORE_SCHEMA_VERSION` a 2 cambia el fingerprint, así que lo guardado queda desactualizado (`fingerprint_mismatch`) y TODOS los endpoints de rating caen al cálculo en vivo (~0,5 s por pedido, sin errores) hasta correr `npm run recompute:ratings -- --apply`. La sincronización al escribir saltea el diff en ese estado (`large_diff`) y no afecta a las escrituras. Con ~1.700 eventos el recompute supera el tope en línea (`RATING_SYNC_MAX_CHANGES=300`), por eso se corre solo por script. El recompute solo agrega campos (`$set`), converge y no cambia ningún rating. Contra PROD lo ejecuta el usuario siguiendo el runbook `.agents/tasks/rating-history-v5-prod-runbook.md`.

**Advertencia: `kind` desactualizado.** El `kind` (y `tournamentFormat` / `tournamentPlayoffMode`) se guardan al calcular. Si después cambia el `format` o el `playoffMode` de un torneo ya jugado, el camino en vivo lo ve enseguida (el caché de partidos se invalida con cualquier escritura bajo `/api`), pero el guardado conserva el `kind` viejo hasta el próximo recompute o hasta la próxima sincronización al escribir un resultado (esa sincronización recalcula todo y actualiza los eventos cuyo `kind` cambió, mientras el total no supere el tope). Editar un torneo por sí solo NO dispara la sincronización ni invalida la frescura (la huella mira solo `face-to-face`). Después de cambiar el formato de un torneo ya jugado, correr `recompute:ratings -- --apply`. Propuesta, **sin implementar**: sumar el mayor `updatedAt` de `tournaments` a la huella de frescura (`findRatingSourceStats` y el `source` de los jugadores) para que una edición de torneo dispare el cálculo en vivo hasta recomputar; cambia el `source` de todos los jugadores y el chequeo de `freshness.js`, por eso es un cambio aparte.

**Runbook de PROD (esquema 2).** Resumen; el detalle está en `.agents/tasks/rating-history-v5-prod-runbook.md`. Todo contra PROD lo ejecuta el usuario.

1. Desplegar primero el BE con la versión de esquema 2. Hasta el recompute, todo cae al cálculo en vivo sin errores.
2. `npm run verify:ratings -- --uri-env MONGO_URI_PROD`: con el código nuevo da `VERIFY: DRIFT` (exit 1), lo esperado.
3. Dry-run: `npm run recompute:ratings -- --uri-env MONGO_URI_PROD`. Revisar la línea `Base:` y que el resumen muestre ~1.700 eventos y todos los jugadores a actualizar, sin eliminados.
4. Aplicar: `npm run recompute:ratings -- --apply --allow-production --uri-env MONGO_URI_PROD` (termina con "Sin diferencias", exit 0).
5. `npm run verify:ratings -- --uri-env MONGO_URI_PROD` debe dar `VERIFY: OK` (exit 0). Para comprobar la frescura, pedir `/api/ratings/history` y buscar `rating_read_model` con `source: "stored"` y `reason: "ok"`.
6. Referencia medida en `apa-dev` (103 eventos): un evento pesa ~834 bytes (BSON) y el recompute completo con `--apply` tardó ~7 s. En PROD (~1.700 eventos) se estiman ~1,4 MB y decenas de segundos, no medido.
7. Rollback: redesplegar el BE anterior devuelve todo al cálculo en vivo. Volver al camino guardado con el código viejo exige antes que el usuario vacíe a mano `rating-events` y `player-ratings` (derivadas), porque `$set` no hace `$unset` y el diff del código viejo no convergería con los campos nuevos.

### Lectura desde los ratings persistidos (etapa 2)

Tres endpoints leen las colecciones de la etapa 1 en vez de recalcular el historial completo: `GET /api/tournaments/:tournament/playoff/matches`, `GET /api/tournaments/:tournament/playin/matches` y `GET /api/tournaments/:tournament/fixture`. En esta etapa `/ratings`, `/ratings/period`, las estadísticas y `/matches` no cambiaban (seguían en vivo); `/ratings`, `/ratings/period` y `/matches` se migraron después (ver más abajo).

-   **Qué se lee:** de un partido jugado, su evento guardado en `rating-events` (odds previas, `pre_match`); de uno pendiente, el estado actual de los dos jugadores en `player-ratings` (`current`). Solo se piden los eventos de los partidos jugados que el motor rateó; los pendientes, los no rateables (sin goles, SIM o W.O.) y los que no admiten predicción no piden evento.
-   **Mismo payload.** El cuerpo de la respuesta es idéntico al del cálculo en vivo (claves, valores redondeados y `null`), así que no hay cambios en el FE ni en `docs/openapi.yaml`. Un test dorado compara ambos caminos.
-   **Frescura.** Antes de usar lo guardado se lee una agregación liviana sobre `matches` (cantidad que cumple el filtro del motor y mayor `updatedAt`) y se compara con el `source` guardado. Se evalúan estas razones en orden y gana la primera que aplica:

| Razón                  | Cuándo                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `no_players`           | No hay jugadores guardados                                                           |
| `version_mismatch`     | Algún jugador es de otra `ratingVersion`                                             |
| `inconsistent_players` | Los jugadores no comparten un único `fingerprint` o un único `source`                |
| `fingerprint_mismatch` | El `fingerprint` guardado no es el del código actual (también si es el de un evento) |
| `missing_source`       | Algún jugador no tiene `source` válido (documentos de la etapa 1)                    |
| `stale_count`          | `ratedMatches` guardado distinto del actual                                          |
| `stale_updated_at`     | `maxUpdatedAt` guardado distinto del actual                                          |
| `ok`                   | Todo coincide                                                                        |

Además de esas, si falta el evento de un partido jugado que debería estar, la razón es `missing_event`.

-   **Fallback transparente.** Si lo guardado no está al día, falla la lectura, el interruptor lo apaga o hay `options` de predicción inyectadas (solo tests y evaluación), el endpoint calcula en vivo como antes y responde lo mismo. El cliente no se entera.
-   **Interruptor:** `RATING_READ_MODEL=off` (también `0` o `false`, sin importar mayúsculas) fuerza el camino en vivo. Cualquier otro valor, o sin definir, deja la lectura guardada encendida. Se lee en cada pedido (ver `config/ratingReadModel.js`).
-   **Log.** Cada respuesta decorada emite una línea `rating_read_model` (ninguna si no hay partidos que decorar), por ejemplo:

    ```text
    {"level":"info","event":"rating_read_model","source":"stored","reason":"ok","matches":9,"durationMs":14}
    ```

Campos de la línea:

-   `source`: `stored` si se usó lo guardado o `live` si se calculó en vivo.
-   `reason`: `ok` (guardado), una razón de la tabla de arriba o `missing_event`, `disabled` (interruptor apagado u `options` inyectadas) o `error` (la lectura guardada falló).
-   `matches`: cantidad de partidos decorados. `durationMs`: tiempo de la decoración.
-   Con `reason: "error"` el nivel es `warn` y se suma `errorName` (la clase del error, sin mensaje). Nunca lleva ids ni datos de los partidos.

Otras notas:

-   **`ratedMatches` y `eventCount`.** `ratedMatches` cuenta los partidos que cumplen el filtro del motor (jugados y válidos). Puede ser mayor que la cantidad de eventos porque ese filtro incluye partidos que el motor no califica (mismo jugador en ambos lados, goles no enteros, sin jugador). Se compara contra la misma consulta, no contra los eventos.
-   **Limitación de `updatedAt`.** Las ediciones nativas o masivas que no actualizan `updatedAt` (scripts de migración, `updateMany` sin timestamps, cambios directos en la base) solo las detecta la cantidad. Si una edición cambia un resultado sin cambiar la cantidad ni `updatedAt`, lo guardado se sigue usando hasta el próximo recompute.
-   **Qué hacer en la práctica.** Cada resultado cargado cambia la cantidad o el `updatedAt`, así que lo guardado queda desactualizado hasta que se actualice. Con la etapa 3 eso lo hace la propia API al escribir; si esa actualización no corre (`skipped`, `timeout`, `error` o interruptor apagado) los endpoints usan el camino en vivo (con el caché de 30 s) sin avisar. Después de migraciones o cambios fuera de la API, o si el log `rating_sync` dice `large_diff`: `npm run recompute:ratings -- --apply --uri-env <VAR>` y luego `npm run verify:ratings -- --uri-env <VAR>`.
-   **Primera vez tras el deploy.** Los documentos de la etapa 1 no tienen `source`, así que hay que re-correr `recompute:ratings -- --apply` una vez en dev y otra en PROD después del deploy. Hasta entonces la razón es `missing_source` y todo sigue en vivo. Con la etapa 3, la primera carga de un resultado también completa el `source` si el diff entra en el umbral (solo cambian los jugadores); si no entra, se saltea por `large_diff` y queda para el script.
-   **Costo por pedido:** una agregación sobre `matches` (no transfiere documentos), una lectura de los jugadores y una de los eventos pedidos, en lugar de leer el historial completo.

### Ranking (`GET /api/ratings`) desde los ratings persistidos

El ranking sale de `player-ratings` y no del historial: cada fila (rating, pico, partidos, victorias, empates, derrotas, `lastPlayedAt` y `lastChange`) ya está guardada por jugador. La respuesta es la misma que la del cálculo en vivo (hay un test que lo comprueba con la misma historia, y se comprobó con datos reales de dev y PROD).

-   **Lectura:** dos consultas en paralelo (el estado de los jugadores y el chequeo de frescura) más la de usuarios para los apodos, que ya se hacía. No se lee `matches` ni `rating-events`.
-   **Frescura:** las mismas reglas que la lectura de predicciones (`assessFreshness`). Si lo guardado no está al día, la lectura falla, el documento está malformado o el interruptor `RATING_READ_MODEL` está apagado, calcula en vivo como antes, con el mismo resultado.
-   **Log:** una línea `rating_read_model` con `endpoint: "ratings"`, `source` (`stored` o `live`), `reason`, `players` y `durationMs`. Solo se emite cuando el lector guardado está cableado (no en los tests que inyectan `retrieveAllMatches`).
-   **Medido (desde una PC, en frío):** en PROD ~1.020 ms en vivo contra ~170 ms guardado; en dev ~490 ms contra ~170 ms. Desde Vercel los tiempos pueden ser menores.
-   **Código:** `dao/findRankingPlayerRatings`, `service/ratingsReadModel/createRetrieveStoredRanking.js`, `service/retrieveStoredRanking` y `controller/getRatings`.

### Período (`GET /api/ratings/period`) desde los ratings persistidos

`/ratings/period` compara el ranking al inicio de `dateFrom` con el del cierre de `dateTo` (período `[start, end)`, con `start` y `end` en día argentino). Ahora lo arma con las colecciones persistidas en vez de recorrer todo el historial. Sirve para cualquier período, también para uno viejo: el costo no crece con la cantidad de partidos posteriores.

La respuesta es la misma que la del cálculo en vivo. Los dos caminos arman el cuerpo con la misma función (`buildPeriodPayload`), así que el payload es idéntico por construcción, y un test dorado lo comprueba sobre muchas historias y ventanas.

-   **Lectura:** cuatro consultas en paralelo más la de usuarios (apodos), que ya se hacía.
    -   Frescura (`findRatingSourceStats`) y estado actual de los jugadores (`findRankingPlayerRatings`).
    -   **A** (`dao/findRatingEventsInRange`): los eventos de `rating-events` con `start <= time < end`, ordenados por `seq`, con proyección mínima (ids, nombres, `before`, `games`, `delta`, `expectedP1`, `resultP1`, marcador, `matchId`, `time`, torneo, tipo y huella). Son los partidos del período: de ahí salen `matchesInPeriod`, el récord V/E/D de cada jugador y el mayor batacazo.
    -   **B** (`dao/findRatingBoundaryEvents`): una agregación sobre los eventos con `time >= end`. Ordena por `seq`, separa los dos lados de cada partido (`$unwind`) y agrupa por jugador. Devuelve **una fila por jugador** con su primer evento posterior (`name`, `before`, `games`), su último evento (`before`, `games`, `delta` y `sign`, 1 si fue `p1` y -1 si fue `p2`), la cantidad de eventos de esa cola y el conjunto de huellas. No se trae la cola entera: con 5 jugadores son 5 filas aunque haya miles de partidos después de `end`.
-   **Regla de reconstrucción.** El estado de un jugador en un instante T es el `before` y los `games` de su primer evento con `time >= T`; si no tiene ninguno, su estado actual de `player-ratings`. Es exacto bit a bit: el motor hace `rating = before ± delta` y el `before` del evento siguiente es ese mismo valor.
    -   En `start`: el primer evento del jugador en A; si no tiene, el primero de B; si no, el estado actual.
    -   En `end`: el primero de B; si no, el estado actual.
    -   Un jugador que debuta dentro del período o después tiene `games = 0` en su primer evento: queda con 0 partidos en `start` y el ranking lo descarta, igual que en vivo (`previousPosition` y `previousRating` en `null`).
    -   Los eventos sin `time` (partidos sin `playedAt`) van siempre antes de cualquier corte: no entran en A ni en B, pero cuentan en los `games` del evento siguiente.
    -   `time === start` entra al período (`$gte`) y `time === end` no (`$lt` en A, `$gte` en B), como el filtro del camino en vivo.
-   **Frescura:** las mismas reglas que el ranking y las predicciones (`assessFreshness`, ver la tabla de la etapa 2). Además, cada evento leído se compara con la huella actual: los de A uno por uno y los de B con el conjunto de huellas de **toda** la cola. Cualquier otra da `fingerprint_mismatch`. Un dato viejo nunca lanza.
-   **Chequeo de encadenado (`inconsistent_chain`).** Evita usar una mezcla de lecturas hechas en paralelo en medio de una actualización. Para cada jugador cuyos eventos se leyeron se verifica que: dentro de A cada evento sigue al anterior (`games + 1` y `before` igual al `before` anterior más o menos el `delta`); el primero de B sigue al último de A; `games` del primero de B más la cantidad de eventos de la cola es igual a `matches` guardado (sin huecos ni sobrantes); y el último evento termina en el `rating` y los `matches` de `player-ratings` (tolerancia `1e-9`). Todo jugador con eventos leídos tiene que existir en `player-ratings`.
-   **Límite del encadenado.** Los jugadores cuyo último evento es anterior a `start` no se leen, así que no se verifican, y tampoco el empalme entre los eventos previos a `start` y el primero leído. No afecta la respuesta: el estado de esos jugadores sale solo de `player-ratings`, una colección coherente por la regla de frescura. Un test fija este límite.
-   **Nombre.** En `end` el nombre es el del último evento del período del jugador; si no jugó en el período, el de su primer evento posterior; si no, el actual. Coincide con el cálculo en vivo (el del último evento anterior a `end`) salvo en un caso: un jugador **sin apodo de usuario** que no jugó en el período y cambió de nombre en partidos posteriores a `end` se muestra con el nombre nuevo. Con apodo de usuario (todos los jugadores reales lo tienen) la respuesta es idéntica. Eliminar ese caso exigiría otra agregación (último evento anterior a `end`). El nombre en `start` solo desempata el orden del ranking cuando rating y partidos son iguales y no se muestra.
-   **Fallback transparente.** Si lo guardado no está al día, falla alguna de las lecturas, un documento está malformado, el interruptor `RATING_READ_MODEL=off` lo apaga o no hay lector cableado (tests que inyectan `retrieveAllMatches`), el endpoint calcula en vivo y responde lo mismo. El cliente no se entera.
-   **Log:** una línea `rating_read_model` con `endpoint: "ratings_period"`, `source` (`stored` o `live`), `reason` (`ok`, una razón de frescura, `inconsistent_chain`, `disabled` o `error`), `players` y `durationMs`. Con `reason: "error"` el nivel es `warn` y se suma `errorName` (sin mensaje). Solo se emite cuando el lector guardado está cableado.
-   **Costo:** cuatro lecturas en paralelo en vez de leer el historial completo: una agregación sobre `matches`, los jugadores (5 documentos hoy), los eventos del período y la agregación del borde (una fila por jugador). Lo que más pesa es A, y solo crece con los partidos del período pedido. Los tiempos no se midieron en frío contra una base real; para eso hay que repetir la medición de la sección de ranking.
-   **Índice nuevo:** `(ratingVersion, time, seq)` en `rating-events` (ver arriba) sirve el filtro de A y el `$match` de B. No cambia la forma de los documentos, el fingerprint ni `RATINGS_STORE_SCHEMA_VERSION`: lo ya guardado sigue siendo válido.
-   **Despliegue.** Solo falta crear el índice nuevo, porque el diff de datos es vacío: `npm run recompute:ratings -- --apply` sobre dev y luego `npm run recompute:ratings -- --apply --uri-env MONGO_URI_PROD --allow-production`. Después `npm run verify:ratings -- --uri-env <VAR>` para confirmar que no hay drift. Sin el índice el endpoint funciona igual (recorre la colección), solo más lento. En los tests la consulta B se ejecuta con un intérprete de pipelines propio, que no reemplaza a Mongo. Se comprobó además contra la base de desarrollo (`apa-dev`, solo lectura, 103 partidos entre el 2026-10-07 y el 2026-10-15): 66 ventanas entre días del historial y sus bordes dieron el mismo JSON (mismo orden de claves) con `RATING_READ_MODEL=off` y encendido, todas servidas desde lo guardado. No se probó contra PROD: antes de confiar en ella allí conviene repetir esa comparación (varias ventanas, reciente, vieja y todo el historial) y confirmar en los logs `endpoint: "ratings_period"` con `source: "stored"`.

### Historial (`GET /api/ratings/history`)

Devuelve cómo se movió el rating de cada jugador **partido a partido** en un período, para el gráfico de líneas de la pestaña "Rating APA" de `/statistics` (punto 5.1 de `APA-RATING-IDEAS.md`). Es aditivo: `/ratings/period` no cambió de contrato ni de comportamiento.

**Consulta.** `dateFrom` y `dateTo` (`YYYY-MM-DD`, obligatorios, días argentinos inclusivos, `dateFrom <= dateTo`, mismas reglas y mismo mensaje que `/ratings/period`) y `players` (opcional, ids repetidos `?players=a&players=b`, hasta 50, sin duplicados). Cualquier otro parámetro da 400. Los atajos del FE ("última semana", "2025", etc.) se calculan en el FE; el BE solo conoce fechas. El ID de un jugador que no existe se ignora.

**Respuesta.** `{ success, dateFrom, dateTo, scope: { type: "period", tournament: null }, parameters, data }`. `data` tiene:

-   `matchesInPeriod` y `matchesTimeline`: todos los partidos del período, de cualquier jugador, como `[{ x, seq, t }]`. Sirven para armar el eje X sin depender de un jugador. No cambian con `players`.
-   `players`: en el orden del ranking al cierre. Cada uno trae `start` (`{ rating, matches }`, `null` si debuta dentro del período), `end`, `summary` y `points`.
-   `highlights.biggestUpset`: el mismo objeto que `/ratings/period`.

**Eje por partido, no por fecha.** Cada punto trae `x`, el índice del partido dentro del período (1..N, contando los partidos de todos los jugadores), así las líneas de todos comparten el eje. `x` avanza con cada partido aunque se hayan jugado (o cargado) el mismo día: en los torneos viejos muchos partidos se anotaron juntos por carga tardía y una fecha los aplastaría. El orden es el del motor, `seq` (`playedAt` y, a igual fecha, `_id`: el orden de carga), que es el que define el rating. `seq` se cuenta sobre todo el historial, así que un período no arranca en 1. No hay `granularity`: siempre es un punto por partido y jugador (`day` y `tournament` se descartaron).

**Punto (`points[]`).** `rating` es el valor **después** del partido y `delta` el cambio con el signo del jugador; `games` es su cantidad de partidos hasta ese, incluido; `expectedScore` es su puntaje esperado (no la probabilidad de ganar: el empate cuenta 0,5; para P2 es `1 - expectedP1`). Trae también `matchId`, `t`, `tournament`, `type`, `opponent`, `score { for, against }` `probability`, `penalties` y `teams` (ver abajo).

**Equipos (`teams`).** Cada punto trae `teams: { for, against }`, el equipo con el que jugó el jugador y el del rival, con la misma orientación que `score` (si el jugador fue P2, `for` es el equipo de P2). Cada lado es `{ id, name }` o `null` si no hay ni nombre ni id (partido sin equipo); el objeto `teams` siempre está presente. Con solo uno de los dos datos, el otro queda en `null` (por ejemplo `{ id: 5, name: null }` si el evento guardado es anterior al nombre, o `{ id: null, name: "Boca" }` si el id no se pudo leer). El `name` es el `teamP1.name` / `teamP2.name` del partido (recortado; `null` si está en blanco o no es un texto) y el `id` es el `teamP1.id` / `teamP2.id`; el motor guarda ambos en `rating-events` como `p1.team` / `p1.teamId` y `p2.team` / `p2.teamId` (`teamId` es nuevo en el esquema 2). El camino en vivo los trae del evento del motor; el guardado los pide a la consulta A con la opción `includeHistory` (`dao/findRatingEventsInRange`: suma `p1.team p1.teamId p2.team p2.teamId kind shootoutP1 shootoutP2` a la proyección, constante `RATING_EVENTS_HISTORY_PROJECTION`, solo cuando el historial lo pide), así que la proyección de `/ratings/period` y su respuesta no cambian.

El `id` (el que el FE usa para pedir el escudo en `/logos/:id`, igual que `/matches`) sale del evento, como el nombre, y se orienta desde el jugador igual que él: no hay consulta a los partidos. Es el mismo `id` que devuelve `/matches` (número o string, tal como estaba en el partido al calcular; el `0` es un id válido). Un evento guardado sin `teamId` (anterior al esquema 2) o con un valor inválido (ni número finito ni string no vacío) da `id: null` y el nombre se conserva; nunca es un error. Salvedad: nombre e id salen del evento, es decir, del partido al momento del cálculo; si se cambia el equipo de un partido, ambos se actualizan juntos cuando se sincroniza el rating (se hace sola al guardar el partido).

**Penales (`penalties`).** En un partido empatado en goles definido por penales, el punto trae `penalties: { for, against }` con la tanda desde el punto de vista del jugador; en cualquier otro caso es `null`. Es solo informativo: el Elo cuenta ese partido como empate (0,5) y no entra en los upsets. La tanda sale del evento (`shootoutP1` y `shootoutP2`, esquema 2), que el motor arma con `outcome.penalties`, `outcome.teamThatWon.id` y las dos puntuaciones de la tanda del partido (`toShootout` en `service/playerRatings/eventContext.js`). La tanda se orienta con el ganador de la definición: si su id coincide con el del equipo 1 (`teamP1.id`, comparado como string) la tanda ganadora es de P1 y, si no, de P2. El evento guarda además `shootoutWinner` (`"p1"` o `"p2"`), que hoy no se usa. Un evento guardado sin esos campos, con solo uno, o con valores que no son enteros >= 0 da `penalties: null`; nunca es un error.

**Probabilidad (`probability`).** `expectedScore` no es una probabilidad, así que cada punto trae `probability: { kind, for, against } | null` con la probabilidad previa al partido, desde el punto de vista del jugador (3 decimales, calculada con el `expectedP1` sin redondear del evento). El FE la usa para explicar un upset en términos que entiende el usuario. Reutiliza exactamente `service/playerRatings/prediction.js`, el mismo modelo de los endpoints de playoff, play-in y fixture:

-   `kind: "win"`: partidos que pueden terminar empatados (`type: "regular"`, playoff de la Champions y patas 1 y 2 de un cruce a dos piernas). Usa `outcomeProbabilities` (modelo de empate de `config/drawModel.js`): `for` es la probabilidad de **ganar** y `against` la de **perder**. **El empate no está incluido**, así que `for + against` es menor a 1.
-   `kind: "advance"`: cruces de eliminación de partido único (playoff y play-in de `world_cup`, `world_cup_2026`, `league_playin_playoff`, `american_cup`, `playoff`...). Usa `toProbabilities`: `for` es la probabilidad de **avanzar** y `against` la de **quedar eliminado** (suman 1). El motor cuenta los penales como 0,5, así que el puntaje esperado ya incluye el desempate.
-   `null`: no hay clasificación posible. Pasa en los play-in de la Champions, en la tercera pata de un cruce a dos piernas, en un playoff o play-in cuyo torneo no se puede resolver (por ejemplo, partidos sin `tournament.id`) y con un `type` nulo. No se usa el valor por defecto de `predictionKind` sin torneo, porque devolvería `"advance"` y podría ser falso.

**Cómo se identifica el tipo.** Sale del campo `kind` del evento (`"win"`, `"advance"` o `null`). Lo calcula el motor al emitir el evento con `eventKind` (`service/playerRatings/matchKind.js`, la misma lógica de `predictionKind`): `type: "regular"` es siempre `win`; para playoff y play-in hace falta el `format`, el `playoffMode` y el `leg`, que `dao/findRatingMatches` resuelve con una sola lectura de torneos al calcular o sincronizar (no por pedido del endpoint). Sin torneo resoluble el `kind` es `null`. Un evento guardado sin `kind` o con un valor inválido (que no sea `win` ni `advance`) resuelve solo los `regular` como `win`; el resto da `probability: null`, sin error. El endpoint no lee partidos ni torneos.

**Sin punto previo al debut.** Si el jugador debuta en el período, `start` es `null` y no hay punto antes del primer partido. Para `ratingChange`, `min` y `max` se toma el rating inicial (1500) como valor de partida. Un jugador que ya había debutado y no jugó en el período aparece con `points: []` y `start` igual a `end`. Uno que todavía no había debutado al cierre no aparece.

**Resumen (`summary`).**

-   `ratingChange`, `position`, `previousPosition`, `positionChange`, `matchesInPeriod`, `record` y `provisional` salen con las mismas reglas que `/ratings/period` (un test compara ambos). El ranking del período lo arma el FE ordenando por `ratingChange`.
-   `min` y `max` son `{ rating, seq, t }`. El **rating inicial del período es un candidato más** (con `seq` y `t` en `null`): si un jugador solo perdió, su máximo es donde empezó, no su mejor punto del período. Ante empate gana el primero (el inicial y después el de menor `seq`). Se calculan sobre los valores sin redondear.
-   `biggestUpsetWon` ("mayor upset"): entre los partidos que **ganó**, el de menor puntaje esperado propio (menor a 0,5). `worstUpsetLost` ("peor upset"): entre los que **perdió**, el de mayor puntaje esperado propio (mayor a 0,5). Ante igual puntaje esperado gana el de menor `seq`. Cada uno trae `matchId`, `t`, `opponent`, `expectedScore`, `ratingSwing` (valor absoluto), `score`, `teams` (el mismo objeto del punto), `ratingChange` (los puntos que movió el partido, **con el signo del jugador**: positivo en el upset ganado y negativo en el perdido) y `probability` (el mismo objeto del punto); `null` si no hubo. El FE muestra la probabilidad **del resultado que ocurrió**: en el upset ganado `for` ("Tenía 27% de chances de ganar" o "de avanzar") y en el perdido `against` ("Tenía 19% de chances de perder" o "de quedar eliminado").
-   **Limitación de la elección con tipos mezclados.** El upset se elige por puntaje esperado, no por la probabilidad mostrada. Dentro de un mismo tipo es equivalente (la probabilidad de ganar crece con el puntaje esperado), pero si un jugador tiene partidos de liga y cruces de eliminación puede salir uno cuya probabilidad mostrada no sea la menor: un partido de liga con puntaje esperado 0,31 (21,7 % de ganar) pierde contra un cruce con 0,28 (28 % de avanzar). Son eventos de distinta naturaleza (ganar vs avanzar) y el criterio coincide con lo que movió el rating. Elegir por la probabilidad mostrada es un cambio de una línea en `findPlayerUpsets`, pendiente de decidir con el usuario.
-   **Los empates y los partidos definidos por penales (`resultP1 = 0,5`) cuentan como punto y como empate en el récord, pero no como upset**, igual que `highlights.biggestUpset`. El evento ya guarda el ganador real de la definición (`shootoutWinner`), pero la elección de upsets no lo usa; incluirlos es etapa 2.

**De dónde sale.** Usa la misma lectura que `/ratings/period`, extraída a `controller/getRatingsPeriod/periodSource.js` (`createPeriodSource`): intenta lo guardado (consultas A y B, frescura y encadenado, ver arriba), cae a vivo si no está al día o falla, y registra la línea `rating_read_model` con `endpoint: "ratings_history"`. Los dos caminos arman el cuerpo con `buildHistoryPayload`, una función pura, así que el resultado es idéntico por construcción y un test dorado lo comprueba. El camino en vivo no trae `seq` del motor: se agrega como la posición dentro de `timeline.events` completo (1, 2, 3...), el mismo número que se persiste en `rating-events` (`buildRatingDocuments`). No hay lecturas adicionales: el tipo de cruce, la tanda de penales y los ids de equipo vienen en el propio evento (esquema 2, `RATINGS_STORE_SCHEMA_VERSION = 2`), así que `buildHistoryPayload` sigue siendo pura y el controller no recibe ni invoca lectores de partidos. Con el lector guardado fresco, el endpoint no consulta `matches`.

**Partidos sin fecha.** Los partidos sin `playedAt` van primero en el orden del motor y no entran en ningún período, pero sí cuentan en `start` y en `games`. Con un período que abarque todo el historial (el FE usa `dateFrom = 2019-01-01` para "Todo el historial"), un jugador con partidos sin fecha puede tener `start` distinto de `null` y de 1500, igual que en `/ratings/period`.

**Costo y peso.** Una lectura igual a la de `/ratings/period` (con seis campos más por evento en la consulta A: `p1.teamId`, `p2.teamId`, `kind`, `shootoutP1` y `shootoutP2`, además de los nombres de equipo), sin lecturas auxiliares, y armar un punto por partido y jugador, en memoria. La única lectura extra es la de torneos (~30 documentos) que hace `dao/findRatingMatches` al calcular o sincronizar, no al responder. El peso crece con el largo del período: contra `apa-dev` (103 partidos, 6 jugadores) todo el año son ~70 kB sin comprimir (~0,7 s en frío) y un día ~3 kB. Con el historial real (~1.700 partidos, 5 jugadores) "todo el historial" serían ~3.400 puntos, del orden de 1 MB sin comprimir (estimación, no medido contra PROD). Se acepta en la etapa 1; si molesta, comprimir la respuesta o acotar los campos del punto.

**Etapa 2 (no implementada).** Filtro por torneo: `tournamentId` está **reservado** (hoy llega como parámetro desconocido y da 400; `scope.tournament` ya existe en `null` para no romper el contrato). El esquema 2 ya dejó guardado en cada evento todo lo que necesita: `tournamentId`, `leg`, `tournamentFormat` y `tournamentPlayoffMode`, `playedAtPrecision` (para avisar qué fechas son aproximadas; hoy el FE muestra un aviso general) y `shootoutWinner` (para incluir los penales en los upsets), así que no hace falta otro recompute. Falta lo que no es dato: el parámetro y su validación, la proyección de esos campos y, para filtrar con eficiencia, un índice por torneo en `rating-events`, que se crearía con `syncIndexes` del mismo script de recompute (hoy no existe: YAGNI). Quedan también las bandas de torneo en el gráfico. Los equipos de cada lado ya se devuelven (`teams`, ver arriba).

### Variación de Elo en `/matches`

`GET /api/matches` agrega a cada partido el campo `ratingChange`: `{ p1, p2, ratingVersion }` con los puntos de rating que ganó o perdió cada jugador en ese partido, o `null`. El FE lo muestra en la columna "Elo" de la tabla de partidos.

-   **Origen:** el `delta` guardado en `rating-events` (puntos que pasan hacia el jugador 1; el jugador 2 recibe lo opuesto). Ya incluye el término de equipo del 2.0. No se recalcula nada. `p1` y `p2` van redondeados a 2 decimales y `p2` es siempre `-p1` (nunca `-0`).
-   **Lectura:** una consulta por índice con los `matchId` de la página (solo los partidos jugados, válidos y con dos jugadores distintos), en paralelo con las dos lecturas del chequeo de frescura. Si la página no tiene ninguno, no se lee nada.
-   **Frescura:** las mismas reglas que la lectura de predicciones (etapa 2), más la huella de cada evento. Si lo guardado no está al día, la columna queda en `null` en toda la página; **no hay cálculo en vivo de reemplazo**. Una carga de resultado vuelve a sincronizar sola (etapa 3). Un partido sin evento (por ejemplo uno recién cargado que todavía no se sincronizó) queda en `null` sin afectar a los demás.
-   **Es un adorno:** ante cualquier falla la respuesta sale igual (estado 200, mismos campos) con `ratingChange: null`. El interruptor `RATING_READ_MODEL=off` también deja la columna vacía.
-   **Log:** una línea por respuesta, evento `matches_rating_change`, con `source` (`stored` o `none`), `reason`, `matches` y `durationMs`. Sin ids.
-   **Código:** `dao/findRatingChangesByMatchIds`, `service/ratingsReadModel/{createRetrieveRatingChanges,decorateMatchesWithRatingChange}.js`, `service/retrieveRatingChanges` y `controller/getMatches`. Los tests de ese controller que inyectan solo `retrieveMatches` no leen la base ni ven el campo nuevo.

### Actualización al escribir (etapa 3)

Cuando se carga, edita o borra un resultado, la API deja al día `player-ratings` y `rating-events` antes de responder. Así lo guardado vuelve a estar fresco (etapa 2) sin correr el script a mano.

#### Mecanismo: recomputar al escribir y persistir solo el diff

Después de que la escritura del resultado se confirmó (y de cerrar cualquier transacción), el controller llama a la actualización, que corre **la misma tubería que `npm run recompute:ratings`** dentro del proceso:

1. Lee las estadísticas del origen (`findRatingSourceStats`) y **después** el historial rateado, directo de la base (`dao/findRatingMatches`). Nunca pasa por `service/retrieveRatingMatches`: ese caché en memoria puede tener datos previos a la escritura hasta que termina la respuesta.
2. Calcula el timeline y los documentos (`computeRatingsState`) con el fingerprint actual y el `source` leído.
3. Lee lo guardado (`findStoredRatingDocuments`) y calcula el diff (`diffRatingDocuments`).
4. Aplica **solo el diff** (`applyRatingDiff`). Si no hay diferencias, no escribe nada (`noop`).

La tubería vive en `service/ratingsStore/pipeline.js` (lecturas + diff, un solo lugar) y la usan el script y la actualización al escribir: no hay dos implementaciones. El script mantiene su comportamiento (dry-run por defecto, mismos mensajes y exit codes) y **no tiene límite de cambios**.

Se llama **antes** de responder y se espera (`await`): en Vercel la función puede congelarse apenas se envía la respuesta, así que no se deja trabajo "suelto" después de `res.json`. No se parchea `res.end`. El middleware que invalida el caché en memoria no cambia.

#### Rutas de escritura

El router tiene 11 rutas que no son `GET`. Solo dos cambian datos rateados:

| Ruta                                                           | ¿Cambia datos rateados?                                                                                                                                                                       | Dónde se llama                                                                                                                                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PUT /api/tournaments/:tournament/matches/update-game/:match`  | Sí: carga o edita un resultado (liga, play-in, playoff de partido único o de serie, desempate, simulado y W.O.). Incluye lo que dispara en cascada (cruces de playoff y play-in, desempates). | `controller/putMatchByTournamentId`: tras `processSeries` (serie) o tras la transacción (legado), antes de `res.send`. Disparador `match_result_saved`.                              |
| `PUT /api/tournaments/:tournament/matches/delete-game/:match`  | Sí: borra el resultado (`played: false`).                                                                                                                                                     | `controller/putRemoveMatchByTournamentId`: tras obtener el partido limpio (y comprobar que existe), antes de `res.json`. Sirve a los dos caminos. Disparador `match_result_removed`. |
| `PUT /api/tournaments/:tournament/complete`                    | No: solo cierra el torneo (`tournaments`); el motor no lee esa colección.                                                                                                                     | No se llama.                                                                                                                                                                         |
| `POST /api/tournaments/:tournament/fixture`                    | No: crea partidos sin jugar.                                                                                                                                                                  | No se llama.                                                                                                                                                                         |
| `POST /api/tournaments/:tournament/playin`                     | No: crea partidos sin jugar.                                                                                                                                                                  | No se llama.                                                                                                                                                                         |
| `POST /api/tournaments/:tournament/playoff`                    | No: crea llaves sin jugar.                                                                                                                                                                    | No se llama.                                                                                                                                                                         |
| `POST /api/tournaments`                                        | No: crea el torneo (y el bracket inicial sin jugar).                                                                                                                                          | No se llama.                                                                                                                                                                         |
| `POST /api/edits`, `DELETE /api/edits/:id`, `POST /api/recaps` | No: colecciones `edits` y `recaps`.                                                                                                                                                           | No se llama.                                                                                                                                                                         |
| `POST /api/users/login`                                        | No: no escribe datos.                                                                                                                                                                         | No se llama.                                                                                                                                                                         |

-   Se llama de forma **incondicional** tras cualquier escritura exitosa de resultado, aunque no haya cambiado ningún rating. Algunos DAOs (`updatePlayoffMatchTeams`, `updatePlayinMatchTeams`, `updatePlayoffSeriesSlots`) escriben con `timestamps: false`: un cambio en un partido ya jugado no sube `updatedAt` y la frescura no lo detectaría; el recálculo sí lo ve.
-   Un resultado simulado o W.O. (`valid: false`) queda fuera del filtro del motor: cargarlo no cambia la cantidad ni el `updatedAt` del origen y la actualización responde `noop`. Convertir un resultado ya rateado en simulado o W.O. sí cambia la cantidad (se borra su evento).
-   No se llama si la escritura falla (409, 404, error de transacción, etc.): la excepción se propaga antes.
-   **Fuera de la API no hay actualización**: scripts de migración, `seedTestData`, `smokeWrite` y ediciones directas en la base. Después de eso hay que correr `npm run recompute:ratings -- --apply`.
-   El test `test/ratingSyncRoutes.test.js` enumera las rutas del router y falla si aparece una de escritura sin clasificar.

#### Política de fallos

La actualización **nunca hace fallar la escritura ni cambia el status o el cuerpo de la respuesta**. Se llama dentro de un `try/catch`, con un presupuesto de tiempo (`Promise.race`) y, ante cualquier error o vencimiento, se loguea y se sigue. Esto es seguro porque el chequeo de frescura de la etapa 2 hace que, si lo guardado no quedó al día, los lectores vean `source: live` y la respuesta siga siendo correcta.

-   **Error:** resultado `error` (se loguea solo el nombre del error, nunca el mensaje: el de un error del driver puede traer la URI).
-   **Presupuesto vencido:** resultado `timeout`. El trabajo en curso no se cancela a la fuerza: corta solo en el próximo límite de tanda de escritura.
-   **Base sin conexión** (solo ocurre en tests unitarios): se saltea sin loguear.

#### Orden de escritura y por qué no hay transacción

Se escribe primero `rating-events` completo (altas, cambios y borrado de huérfanos) y recién después `player-ratings`, que lleva `source` y `fingerprint`: el marcador de frescura.

-   Mientras se escriben los eventos, los jugadores guardados siguen con el `source` viejo, que ya no coincide con `matches` (la escritura del resultado cambió la cantidad o el `updatedAt`): los lectores ven `stale_*` y calculan en vivo.
-   Si el apply se corta entre jugadores (error, tandas, presupuesto), los `source` quedan mezclados: `inconsistent_players`, también en vivo.
-   El estado "parece fresco pero está incompleto" exigiría jugadores nuevos con eventos viejos, y eso no puede pasar porque los jugadores se escriben cuando los eventos ya están completos. Hay tests que miran el estado intermedio (incluido el borrado de huérfanos) y lo evalúan con `assessFreshness`.

No hace falta una transacción entre las dos colecciones: ambas son derivadas y recomputables, el marcador de frescura ya vuelve seguro cualquier estado intermedio, y una transacción con miles de documentos sumaría contención y límites de tamaño y tiempo (Atlas M0) sin mejorar la seguridad de lectura.

**Límite conocido (doble fallo):** si una actualización queda a medias (eventos nuevos, jugadores viejos), después el origen vuelve exactamente al mismo `source` guardado (solo ocurre borrando o invalidando el último resultado editado) y la actualización siguiente también falla, los lectores podrían ver eventos del estado intermedio con jugadores "frescos". La próxima actualización exitosa lo corrige y `verify:ratings` lo detecta.

#### Diferencias grandes

Si el diff supera `RATING_SYNC_MAX_CHANGES` documentos (eventos y jugadores de las dos colecciones, 300 por defecto), la API **no lo aplica en línea** (límite de tiempo de la función en Vercel): loguea `skipped` con `reason: "large_diff"` y lo deja para el script. Pasa en estos casos:

-   Relleno inicial (colecciones vacías) o historial grande.
-   Cambio de fórmula, de parámetros o de datos de equipos (cambia el fingerprint: todo se reescribe).
-   Edición de un resultado viejo que cambia muchos eventos posteriores.
-   Muchos jugadores: una carga normal reescribe 1 evento y el `source` de **todos** los jugadores (cambia en cada escritura), así que el umbral alcanza mientras haya menos de unos 250 jugadores.

Qué hacer: `npm run recompute:ratings -- --apply --uri-env <VAR>` (el script no tiene límite) y luego `npm run verify:ratings -- --uri-env <VAR>`. Mientras tanto los lectores usan el camino en vivo, con la misma respuesta.

#### Concurrencia

-   **En el proceso:** mutex con coalescing (`service/ratingsSync/coordinator.js`). Nunca corren dos actualizaciones a la vez; los pedidos que llegan durante una corrida comparten **una sola** corrida posterior (la que estaba en curso pudo haber leído antes de esas escrituras).
-   **Pasada extra:** después de aplicar se vuelve a leer una vez las estadísticas del origen; si cambiaron durante la corrida, se hace otra pasada (máximo 2 extra). Si siguen cambiando se termina con `reason: "source_changed"` y lo guardado queda viejo (seguro: los lectores van en vivo).
-   **Entre instancias** (varias funciones serverless a la vez) no hay exclusión. Una carrera deja lo guardado desactualizado o mezclado, lo detecta el chequeo de frescura (lectura en vivo) y `verify:ratings`, y se corrige con la actualización siguiente o con el script.

#### Variables de entorno

Se leen en cada llamada (`config/ratingSync.js`), así que un cambio vale sin reiniciar la instancia.

| Variable                  | Default   | Efecto                                                                                                                                  |
| ------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `RATING_SYNC_ON_WRITE`    | encendido | `off`, `0` o `false` (sin importar mayúsculas ni espacios) apagan la actualización al escribir. Cualquier otro valor la deja encendida. |
| `RATING_SYNC_TIMEOUT_MS`  | `5000`    | Presupuesto de tiempo dentro del request. Vencido, la respuesta sale igual y se loguea `timeout`.                                       |
| `RATING_SYNC_MAX_CHANGES` | `300`     | Máximo de documentos que se aplican en línea. Más que eso: `skipped` / `large_diff`.                                                    |

Los dos números aceptan solo enteros positivos; un valor vacío, decimal, negativo, `0` o no numérico usa el default (`0` no significa "sin límite"; para apagar está el interruptor).

#### Log `rating_sync`

Una línea por actualización (ninguna si la base no está conectada, que solo ocurre en tests):

```text
{"level":"info","event":"rating_sync","result":"applied","reason":null,"changes":{"events":{"insert":1,"update":0,"delete":0},"players":{"insert":0,"update":42,"delete":0}},"ratedMatches":812,"durationMs":930,"trigger":"match_result_saved"}
```

-   `result`: `applied`, `noop`, `skipped`, `timeout`, `error` o `disabled`. Nivel `warn` para `timeout` y `error`, `info` para el resto.
-   `reason`: `large_diff` (skipped), `deadline` o `budget_exceeded` (timeout), `source_changed` (applied), `env_off` (disabled), el nombre del error (error) o `null`.
-   `changes`: documentos por colección y operación. En `applied` es lo aplicado; en `skipped`, lo que quedó sin aplicar.
-   `ratedMatches`: partidos que cumplen el filtro del motor. Puede ser mayor que la cantidad de eventos (ver la nota de la etapa 2).
-   `durationMs`, `trigger` (`match_result_saved` o `match_result_removed`) y `passes` si hubo más de una pasada. Nunca lleva ids ni datos personales.

#### Costo

En cada carga o borrado de un resultado se lee todo el historial rateado y todos los documentos guardados, dentro del request. Es el mismo trabajo del script más las escrituras del diff. El camino incremental ("agregar al final" sin recalcular todo) queda como optimización futura; requeriría extraer del motor un paso por partido y **no se hizo**.

#### Pendientes

-   Camino incremental "agregar al final" (optimización).
-   Migrar los contextos de recap con rating (`getRecapContext`, `getTournamentRecapContext`) a leer de lo persistido. `/ratings`, `/ratings/period` y `/matches` ya se migraron; `GET /statistics` no usa rating.

### Código

`config/ratings.js` (parámetros), `service/playerRatings/` (motor, `timeline.js` con el punto de entrada único, `teamStrength.js` con el acceso a los datos, `prediction.js` con la Prob. de éxito de los duelos, presentación y evaluación), `service/retrieveRatingsTimeline/` y `dao/findRatingMatches/` (lectura del historial), `data/` (CSV fuente y JSON generado), `scripts/lib/teamRatingsData.js`, `scripts/buildTeamRatings.js`, `scripts/checkTeamRatings.js` y `scripts/evaluateRatings.js`. Capa de empate: `config/drawModel.js` (parámetros), `service/playerRatings/outcomes.js` (reparto en victoria / empate / derrota), `scripts/evaluateDraws.js` y `scripts/lib/drawEvaluation.js` (reajuste, solo lectura). Ratings persistidos: `service/ratingsStore/` (builder, fingerprint, diff y resumen, puros), `dao/models/playerRatings.js` y `dao/models/ratingEvents.js`, `dao/applyRatingDiff/`, `dao/findStoredRatingDocuments/`, `scripts/lib/ratingsStoreCli.js`, `scripts/recomputeRatings.js` y `scripts/verifyRatings.js`. Lectura persistida (etapa 2): `service/ratingsStore/freshness.js` (frescura, pura), `config/ratingReadModel.js` (interruptor), `service/ratingsReadModel/` (índice guardado con la misma forma que el del motor y su retriever), `service/retrieveStoredPredictionIndex/` (cableado con los DAOs), `dao/findRatingSourceStats/`, `dao/findPlayerRatings/`, `dao/findRatingEventsByMatchIds/` y `decorateMatchesWithPrediction` en `service/playerRatings/prediction.js`. Período persistido: `dao/findRatingEventsInRange/` (consulta A), `dao/findRatingBoundaryEvents/` (consulta B), `service/ratingsReadModel/createRetrieveStoredPeriod.js` (lector, reconstrucción y chequeo de encadenado, puros), `service/retrieveStoredPeriod/` (cableado) y `controller/getRatingsPeriod` (`buildPeriodPayload` compartida por los dos caminos) y `controller/getRatingsPeriod/periodSource.js` (lectura del período, compartida con el historial). Datos del evento (esquema 2): `service/playerRatings/matchKind.js` (`eventKind` y `predictionKind`), `service/playerRatings/eventContext.js` (`teamIdOf`, `toShootout`, `buildEventContext`) y la lectura de torneos en `dao/findRatingMatches/`. Historial: `controller/getRatingsHistory` (sin lectores de partidos), `service/playerRatings/history.js` (`buildHistoryPayload`) y `service/playerRatings/upsets.js` (`findBiggestUpset`). Actualización al escribir (etapa 3): `service/ratingsStore/pipeline.js` y `service/ratingsStore/computeState.js` (tubería compartida con el script), `service/ratingsSync/` (corrida, coordinador y hook, puros con DI), `service/syncRatingsAfterWrite/` (cableado real con los DAOs; no se exporta desde `service/index.js` ni `dao/index.js`), `config/ratingSync.js` (variables de entorno) y la opción `shouldContinue` de `dao/applyRatingDiff/`.

### Al publicar

Publicar la 2.0 **reescribe todo el historial**: el rating se recalcula de cero en cada consulta, así que los números de la 1.0 dejan de existir (el ranking de arriba guarda la comparación). Después del commit, crear el tag `rating-v2.0` y subirlo, siguiendo el checklist. Con una versión nueva, volver a correr `npm run recompute:ratings -- --apply` para actualizar los ratings persistidos.

---

## 1.0

**Fecha:** 2026-10-12 (commit `5b39e99`, tag pendiente: `rating-v1.0`)

**Resumen:** Elo clásico entre jugadores humanos. Solo mira quién le ganó a quién, sin contexto adicional.

### Fórmula

Para cada partido, en orden cronológico:

```
esperado_A = 1 / (1 + 10 ^ ((rating_B - rating_A) / scale))
resultado_A = 1 si gana A, 0 si pierde, 0,5 si empata
delta = K * (resultado_A - esperado_A)
rating_A += delta
rating_B -= delta
```

El intercambio es de suma cero: lo que gana uno lo pierde el otro.

### Parámetros

| Parámetro            | Valor | Notas                                                                                                |
| -------------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| `initialRating`      | 1500  | Todos los jugadores arrancan igual.                                                                  |
| `scale`              | 400   | Convención del Elo: cada 400 puntos de diferencia, el favorito espera 10 veces más puntaje.          |
| `kFactor`            | 12    | Con el historial, valores entre 4 y 16 predecían casi igual. 12 es el punto medio.                   |
| `marginWeight`       | 0     | Peso de la diferencia de gol. Con 0 solo cuenta ganar, empatar o perder. No mejoró las predicciones. |
| `provisionalMatches` | 10    | Hasta esa cantidad de partidos el rating se marca como provisorio (`provisional`).                   |

### Qué partidos cuentan

Un partido entra si está jugado (`played` no es `false`), es válido (`valid` no es `false`), tiene dos jugadores distintos con id y goles enteros no negativos. El resto se ignora.

### Reglas y decisiones

-   **Orden:** por `playedAt` ascendente y, a igual fecha, por `_id`. Los partidos sin fecha van primero. El orden importa porque el Elo depende de él.
-   **Empates:** valen 0,5, también cuando se definieron por penales.
-   **Goleadas:** no pesan (`marginWeight` = 0), el multiplicador es `1 + marginWeight * ln(1 + |dif|)`.
-   **Nombre visible:** el nickname del usuario; si ya no existe como usuario, el nombre con que quedó en sus partidos.
-   **Desempate del ranking:** rating, luego más partidos, luego nombre. Solo entran jugadores con al menos un partido.

### Qué no considera todavía

-   Fuerza o nivel de los equipos usados en cada partido.
-   Tipo de torneo o instancia (fase regular, playoff, final).
-   Diferencia de gol (el soporte existe pero está apagado).
-   Antigüedad de los partidos o inactividad (no hay decaimiento).
-   K variable según experiencia: hoy el marcador de provisorio es solo informativo y no cambia el cálculo.

### Evaluación

Calibrado con `npm run evaluate:ratings` sobre el historial real (unos 1.700 partidos y 5 jugadores). Grilla probada: `kFactor` 2 a 16, `marginWeight` 0 y 0,25, `scale` 400 a 800. Se ajusta sobre el 70 % inicial del historial y se mide en el 30 % restante, con un mínimo de 10 partidos por jugador.

Métricas de referencia (medidas sobre los 1.679 partidos evaluables de 1.710, con un mínimo de 10 partidos previos por jugador; el tramo de prueba es el 30 % reciente, 504 partidos): log-loss 0,5815 en todo el historial y 0,5551 en el tramo de prueba (azar: 0,6931); Brier 0,1614 y 0,1589; el favorito gana el 71,0 % y el 72,3 % de los partidos con ganador.

### Endpoints

-   `GET /api/ratings`: ranking actual con `rating`, `peak`, `lastChange`, `provisional`, victorias, empates y derrotas.
-   `GET /api/ratings/period`: compara el ranking al inicio de `dateFrom` con el del cierre de `dateTo` (power ranking) e incluye el mayor batacazo del período.

### Código

`config/ratings.js` (parámetros), `service/playerRatings/` (motor, presentación y evaluación), `controller/getRatings/`, `controller/getRatingsPeriod/`, `scripts/evaluateRatings.js`.

---

<!--
Plantilla para la próxima versión (copiar arriba de la 1.0):

## X.Y

**Fecha:** AAAA-MM-DD (commit `abc1234`, tag `rating-vX.Y`)

**Resumen:** qué cambia y por qué.

### Cambios respecto de la versión anterior
### Parámetros
### Qué no considera todavía
### Evaluación (métricas antes y después)
-->

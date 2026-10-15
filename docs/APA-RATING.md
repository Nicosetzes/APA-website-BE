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

Los mismos de la 1.0 (`GET /api/ratings` y `GET /api/ratings/period`). `parameters` suma `teamStrengthWeight` y `parameters.version` pasa a `"2.0"`. El "esperaba" del mayor batacazo (`winnerExpectedScore`) ahora incluye el término de equipo. Cada evento del motor expone además `p1.teamOverall`, `p2.teamOverall` y `teamAdjustment`.

### Prob. de éxito en playoffs

`GET /api/tournaments/:tournament/playoff/matches` y `GET /api/tournaments/:tournament/playin/matches` agregan `prediction` a cada partido: la "Prob. de éxito" de cada lado según el Rating APA 2.0.

-   **Qué es:** el puntaje esperado del motor. En un cruce de partido único no hay empate final (se define por penales, que el motor cuenta 0,5), así que ese puntaje es la probabilidad de **avanzar**. No es la probabilidad de ganar en tiempo regular: el modelo no distingue ganar de empatar y definir por penales.
-   **A qué partidos aplica:** playoff y play-in de partido único (`league_playin_playoff`, `world_cup`, `world_cup_2026`, `super_cup` y `playoff` sin modo o `single`). En `champions_league` y en `playoff` con `playoffMode: "two_legged"` no hay "Prob. de éxito" (no hay una única probabilidad de avanzar): esos partidos usan la predicción de victoria / empate / derrota de la sección siguiente, o `null` en la pata 3 y en el play-in de `champions_league`.
-   **Campos:** `p1` y `p2` (0 a 1, 3 decimales, suman 1), `basis`, `teamAdjusted` (`false` si no se aplicó el término de equipo y se calculó como la 1.0), `provisional` (algún jugador con menos de `provisionalMatches` partidos) y `ratingVersion`. `teamAdjusted` y `provisional` quedan solo en la API; el FE no los muestra.
-   **Viva o previa (`basis`):** un partido jugado usa el evento que calculó el motor (`pre_match`, las odds de ese momento). Un partido por jugar con ambos lados cargados usa los ratings actuales (`current`): puede moverse si antes se juega otro partido de esos jugadores. Un jugador sin historial arranca en `initialRating` con 0 partidos.
-   **`null`:** partido simulado o W.O. (`valid: false`), lado vacío (jugador o equipo), mismo jugador en ambos lados, partido jugado que el motor no puede calificar y cualquier falla del cálculo (se registra `match_predictions_unavailable` y la respuesta sigue en 200).
-   **No se guarda nada.** Cambiar `config/ratings.js` o `data/teamRatings.json` cambia también las odds mostradas de partidos ya jugados; por eso se incluye `ratingVersion`. Cada consulta lee todos los partidos, igual que `GET /api/ratings`.

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
-   **Costo:** el fixture suma una lectura liviana (`.lean()`) del historial completo por consulta, igual que las predicciones de playoff.
-   **Cómo reajustar:** `npm run evaluate:draws -- --uri-env MONGO_URI_PROD` (solo lectura) imprime tasa de empate, lo observado por duelo, la validación cronológica y el mejor ajuste. El script no modifica nada: si hace falta cambiar los valores, editar `config/drawModel.js` a mano y subir `version`.

### Cómo se lee el historial (timeline)

Todos los endpoints de rating (`/ratings`, `/ratings/period` y las predicciones de playoff y play-in) pasan por un único punto, el **timeline** (`service/playerRatings/timeline.js`, `buildRatingsTimeline`): corre el motor una vez y expone `events`, `config`, `eventsByMatchId` y `snapshotAt(corte)`. Ningún controller llama al motor directo. Los scripts de evaluación (`scripts/evaluateRatings.js`, `service/playerRatings/evaluation.js`) sí lo usan directo porque prueban parámetros distintos.

El historial se lee con `dao/findRatingMatches`: `.lean()` (objetos planos, sin hidratar documentos Mongoose) y una proyección mínima con lo que usa el motor: `playerP1/2.id` y `.name`, `teamP1/2.id` y `.name`, `scoreP1/2`, `tournament.id` y `.name`, `type` y `playedAt`. No se ordena en la consulta porque el motor ordena por su cuenta (`playedAt` y luego `_id`). Si el motor pasa a usar otro campo del partido, hay que sumarlo a `RATING_PROJECTION`; un test (`test/ratingsTimeline.test.js`) compara los eventos con el documento entero y con la proyección. Para el resto de las estadísticas se sigue usando `dao/findAllMatches`.

### Código

`config/ratings.js` (parámetros), `service/playerRatings/` (motor, `timeline.js` con el punto de entrada único, `teamStrength.js` con el acceso a los datos, `prediction.js` con la Prob. de éxito de los duelos, presentación y evaluación), `service/retrieveRatingsTimeline/` y `dao/findRatingMatches/` (lectura del historial), `data/` (CSV fuente y JSON generado), `scripts/lib/teamRatingsData.js`, `scripts/buildTeamRatings.js`, `scripts/checkTeamRatings.js` y `scripts/evaluateRatings.js`. Capa de empate: `config/drawModel.js` (parámetros), `service/playerRatings/outcomes.js` (reparto en victoria / empate / derrota), `scripts/evaluateDraws.js` y `scripts/lib/drawEvaluation.js` (reajuste, solo lectura).

### Al publicar

Publicar la 2.0 **reescribe todo el historial**: el rating se recalcula de cero en cada consulta, así que los números de la 1.0 dejan de existir (el ranking de arriba guarda la comparación). Después del commit, crear el tag `rating-v2.0` y subirlo, siguiendo el checklist.

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

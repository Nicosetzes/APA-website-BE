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

### Cómo se lee el historial (timeline)

Todos los endpoints de rating (`/ratings`, `/ratings/period` y las predicciones de playoff y play-in) pasan por un único punto, el **timeline** (`service/playerRatings/timeline.js`, `buildRatingsTimeline`): corre el motor una vez y expone `events`, `config`, `eventsByMatchId` y `snapshotAt(corte)`. Ningún controller llama al motor directo. Los scripts de evaluación (`scripts/evaluateRatings.js`, `service/playerRatings/evaluation.js`) sí lo usan directo porque prueban parámetros distintos.

El historial se lee con `dao/findRatingMatches`: `.lean()` (objetos planos, sin hidratar documentos Mongoose) y una proyección mínima con lo que usa el motor: `playerP1/2.id` y `.name`, `teamP1/2.id` y `.name`, `scoreP1/2`, `tournament.id` y `.name`, `type` y `playedAt`. No se ordena en la consulta porque el motor ordena por su cuenta (`playedAt` y luego `_id`). Si el motor pasa a usar otro campo del partido, hay que sumarlo a `RATING_PROJECTION`; un test (`test/ratingsTimeline.test.js`) compara los eventos con el documento entero y con la proyección. Para el resto de las estadísticas (estadísticas globales, equipos históricos y cara a cara) se usa `dao/findAllMatches`, que también lee con `.lean()` pero con una proyección más amplia (incluye `outcome`, `playoff_id` y `playedAtPrecision`).

#### Caché en memoria del historial

`service/retrieveRatingMatches` guarda el historial liviano en memoria (`utils/singleFlightCache.js`) y lo comparten todos los endpoints de rating (`/ratings`, `/ratings/period`, `playoff/matches`, `playin/matches` y el fixture). El motor se vuelve a calcular en cada pedido (unos 5 ms); lo que se evita es la lectura de la base (~0,5 s).

-   **TTL:** 30 s por defecto. Se cambia con la variable de entorno `RATING_MATCHES_CACHE_TTL_MS` (`0` lo desactiva). Ver `config/cache.js`.
-   **Pedidos simultáneos** comparten una sola lectura.
-   **Escrituras:** `middleware/invalidateRatingCache.js` descarta el historial cuando termina cualquier `POST`, `PUT`, `PATCH` o `DELETE` bajo `/api` (también si falló o se cortó la conexión), así que cargar o borrar un resultado se ve al instante en esa instancia. Una lectura que había empezado antes de la escritura no se guarda.
-   **Límite:** el caché es por instancia. En Vercel cada instancia serverless tiene el suyo y se pierde cuando se enfría. Otra instancia puede mostrar datos viejos hasta que venza el TTL, y los cambios hechos fuera de la API (scripts de migración, ediciones directas en la base) se ven recién al vencer el TTL.
-   **Compartido y congelado:** el arreglo que devuelve está congelado y lo comparten todos los llamadores; no hay que modificarlo (el motor lo filtra y ordena en copias).

### Ratings persistidos (etapa 1)

Se guarda la salida del motor en dos colecciones **derivadas**, para que más adelante las pantallas lean de ahí en vez de recalcular todo el historial. `matches` (`face-to-face`) sigue siendo la única fuente de verdad: las dos colecciones se pueden borrar y reconstruir en cualquier momento. Las escriben y verifican dos scripts; desde la etapa 2 tres endpoints las leen (ver [Lectura desde los ratings persistidos (etapa 2)](#lectura-desde-los-ratings-persistidos-etapa-2)). `/ratings`, `/ratings/period`, las estadísticas y `/matches` siguen sin leerlas.

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
-   `p1` y `p2`: `id`, `name`, `before`, `after`, `games`, `team`, `teamOverall`. `after` se deriva igual que en el historial: `p1.after = p1.before + delta` y `p2.after = p2.before - delta`.
-   `fingerprint` y `computedAt`.
-   Índices: único `(ratingVersion, matchId)`; `(ratingVersion, seq)` **no único** (insertar un partido en el medio desplaza el `seq` de muchos eventos y un único fallaría de forma transitoria); `(ratingVersion, p1.id, seq)` y `(ratingVersion, p2.id, seq)` para leer la serie de un jugador.

#### Fingerprint

Es un SHA-256 del JSON canónico (claves ordenadas) de `config/ratings.js` (todos los parámetros, incluida `version`), `data/teamRatings.json`, `RATINGS_STORE_SCHEMA_VERSION` (cambia la forma de los documentos) y `RATINGS_ENGINE_VERSION` (se sube si cambia la lógica del motor sin tocar la configuración). Ambas constantes están en `service/ratingsStore/constants.js`. No depende de `computedAt` ni de `config/drawModel.js` (el modelo de empate es de predicción y no alimenta al motor). Si cambia, lo guardado quedó desactualizado y hay que re-correr `recompute:ratings`.

#### Cómo correrlo

-   `npm run recompute:ratings` es un **dry-run**: lee el historial, recalcula, compara con lo guardado e imprime el resumen del diff. No escribe nada.
-   `npm run recompute:ratings -- --apply` crea los índices de las dos colecciones, aplica el diff (`bulkWrite` en tandas de 500) y vuelve a leer para comprobar que no quedó ninguna diferencia. Solo escribe en `player-ratings` y `rating-events`; `matches` no se toca. En una base que no es de pruebas exige además `--allow-production`.
-   `npm run verify:ratings` es **solo lectura**: no acepta `--apply`, no crea índices y sale con código 1 si hay drift y 0 si coincide.
-   Ambos aceptan `--uri-env MONGO_URI_PROD` (por defecto `MONGO_URI`) y `--sample <n>` (ids de ejemplo del resumen). La URI nunca se imprime, solo el nombre de la base.
-   Una vez creadas, las colecciones no se actualizan solas: cada vez que cambien los partidos hay que re-correr `recompute:ratings -- --apply` (la actualización automática por escritura es la etapa 3).

#### Qué es un drift

Que lo guardado no coincide con lo que calcula hoy el código sobre los partidos: faltan eventos o jugadores, sobran (huérfanos, por ejemplo de un partido borrado), hay valores distintos (un resultado editado, otro `seq`), el `fingerprint` guardado no es el actual, o el `source` de los jugadores falta (documentos de la etapa 1) o no coincide con el de los partidos de hoy. `verify:ratings` lo informa con el motivo. El arreglo siempre es el mismo: volver a correr `npm run recompute:ratings -- --apply`.

Excepción: si en una etapa futura el builder deja de emitir un campo (un rename o un campo eliminado), `recompute:ratings -- --apply` solo hace `$set` y nunca `$unset`, así que los documentos viejos conservarían el campo y el diff no convergería. Un cambio de forma de los documentos requiere vaciar `player-ratings` y `rating-events` antes de recomputar (son derivadas, se reconstruyen desde `matches`). Subir `RATINGS_STORE_SCHEMA_VERSION` cambia el fingerprint pero no separa los documentos viejos de los nuevos.

#### Primera corrida

El camino con la base real (casteo de `matchId` en `bulkWrite`, `$set` anidado, `createIndexes()`, `Date` y números) se probó solo con fakes. Antes de producción conviene hacer el dry-run y luego `--apply` sobre una base de desarrollo (`*-dev`), y recién después `npm run recompute:ratings -- --apply --uri-env MONGO_URI_PROD --allow-production`.

#### Qué pasa al desplegar

Desde la etapa 2 la app carga los modelos (`dao/models/playerRatings.js` y `dao/models/ratingEvents.js`) para leer, pero tienen `autoIndex` y `autoCreate` apagados. Las colecciones y sus índices no se crean al desplegar: solo cuando se corre el script con `--apply`. Mientras no existan (o estén desactualizadas) los endpoints usan el camino en vivo. El camino de escritura (`dao/applyRatingDiff`, `dao/findStoredRatingDocuments`, `service/ratingsStore/` salvo la frescura y el fingerprint) no lo carga la app.

### Lectura desde los ratings persistidos (etapa 2)

Tres endpoints leen las colecciones de la etapa 1 en vez de recalcular el historial completo: `GET /api/tournaments/:tournament/playoff/matches`, `GET /api/tournaments/:tournament/playin/matches` y `GET /api/tournaments/:tournament/fixture`. `/ratings`, `/ratings/period`, las estadísticas y `/matches` no cambian (siguen en vivo).

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
-   **Qué hacer en la práctica.** Hasta la etapa 3 las colecciones no se actualizan solas: cada resultado cargado cambia la cantidad o el `updatedAt`, así que lo guardado queda desactualizado y los endpoints usan el camino en vivo (con el caché de 30 s) sin avisar. Después de cargar resultados o correr migraciones: `npm run recompute:ratings -- --apply --uri-env <VAR>` y luego `npm run verify:ratings -- --uri-env <VAR>`. El beneficio de la etapa 2 aparece entre un recompute y la siguiente carga.
-   **Primera vez tras el deploy.** Los documentos de la etapa 1 no tienen `source`, así que hay que re-correr `recompute:ratings -- --apply` una vez en dev y otra en PROD después del deploy. Hasta entonces la razón es `missing_source` y todo sigue en vivo.
-   **Costo por pedido:** una agregación sobre `matches` (no transfiere documentos), una lectura de los jugadores y una de los eventos pedidos, en lugar de leer el historial completo.

### Código

`config/ratings.js` (parámetros), `service/playerRatings/` (motor, `timeline.js` con el punto de entrada único, `teamStrength.js` con el acceso a los datos, `prediction.js` con la Prob. de éxito de los duelos, presentación y evaluación), `service/retrieveRatingsTimeline/` y `dao/findRatingMatches/` (lectura del historial), `data/` (CSV fuente y JSON generado), `scripts/lib/teamRatingsData.js`, `scripts/buildTeamRatings.js`, `scripts/checkTeamRatings.js` y `scripts/evaluateRatings.js`. Capa de empate: `config/drawModel.js` (parámetros), `service/playerRatings/outcomes.js` (reparto en victoria / empate / derrota), `scripts/evaluateDraws.js` y `scripts/lib/drawEvaluation.js` (reajuste, solo lectura). Ratings persistidos: `service/ratingsStore/` (builder, fingerprint, diff y resumen, puros), `dao/models/playerRatings.js` y `dao/models/ratingEvents.js`, `dao/applyRatingDiff/`, `dao/findStoredRatingDocuments/`, `scripts/lib/ratingsStoreCli.js`, `scripts/recomputeRatings.js` y `scripts/verifyRatings.js`. Lectura persistida (etapa 2): `service/ratingsStore/freshness.js` (frescura, pura), `config/ratingReadModel.js` (interruptor), `service/ratingsReadModel/` (índice guardado con la misma forma que el del motor y su retriever), `service/retrieveStoredPredictionIndex/` (cableado con los DAOs), `dao/findRatingSourceStats/`, `dao/findPlayerRatings/`, `dao/findRatingEventsByMatchIds/` y `decorateMatchesWithPrediction` en `service/playerRatings/prediction.js`.

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

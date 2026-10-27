# Asistente de chat de APA (n8n)

Un agente de n8n responde preguntas de los usuarios del sitio: consulta el backend, procesa los datos y contesta en español, con enlaces a las vistas del sitio. Es **solo lectura**: no puede cargar ni modificar nada.

```
FE (usuario con sesión)
  └─ POST /webhook/apa-assistant   { message, sessionId }   Authorization: Bearer <token de sesión>
       └─ n8n valida el token con GET /api/users/me
            └─ Agente (Claude Haiku 5.5 + memoria corta por sesión)
                 └─ herramientas GET → backend (X-Recap-Secret en los endpoints /api/assistant/*)
       └─ { reply: "<Markdown>" }
```

## Qué hay en esta carpeta

| Archivo                 | Qué es                                                                            |
| ----------------------- | --------------------------------------------------------------------------------- |
| `assistant.json`        | Workflow del asistente para importar en n8n. **Se genera**, no se edita a mano.   |
| `system-prompt.md`      | Reglas de comportamiento del agente y cómo presentar cada tipo de dato.           |
| `knowledge.md`          | Reglas y formatos de los torneos (tabla, desempates, cruces, APA Rating).         |
| `routes.md`             | Mapa de vistas del sitio, para que el agente enlace a donde se ve cada dato.      |
| `EVALUATION.md`         | Batería de preguntas, criterios y plantilla de resultados para evaluar el modelo. |
| `daily-recap.json`      | Respaldo del workflow del resumen diario (export de n8n, no se genera).           |
| `tournament-recap.json` | Respaldo del workflow de la crónica de torneo (export de n8n, no se genera).      |

Se generan y se prueban con:

-   `scripts/buildAssistantWorkflow.js` (`npm run build:assistant-workflow`): arma `assistant.json` a partir de los tres documentos.
-   `test/assistantWorkflow.test.js`: verifica que el JSON esté sincronizado, que las herramientas sean de solo lectura, que el secreto solo viaje a `/api/assistant/*` y que los documentos coincidan con el código.
-   `scripts/measureAssistantTools.js` (`npm run measure:assistant-tools`) y `scripts/evaluateAssistant.js` (`npm run evaluate:assistant`): miden el tamaño de las respuestas y evalúan al agente contra el sitio real. Ver [`EVALUATION.md`](EVALUATION.md).

## Cómo funciona

El workflow `assistant.json` tiene este recorrido:

1.  **Chat Webhook** recibe `{ message, sessionId }`. Solo acepta los orígenes del sitio (`https://sitioapa.com.ar`, `https://apa-website-fe.vercel.app` y `http://localhost:3000`).
2.  **Validate Token** consulta `GET /api/users/me` con el token del usuario. Sin sesión válida responde 401 y **no llega al modelo**, así que no gasta crédito.
3.  **Build Context** valida el pedido (mensaje de hasta 1000 caracteres, `sessionId` bien formado), aplica el tope por persona y arma el contexto (nombre, id y fecha del usuario).
4.  **APA Assistant** (agente) responde usando las herramientas. La identidad ("yo", "mis") sale siempre del token validado, nunca del cuerpo del pedido.
5.  **Respond Reply** devuelve `{ reply }` con Markdown y enlaces relativos. Los errores salen con un código estable (ver más abajo).

Configuración del agente:

| Qué                  | Valor                                                                           |
| -------------------- | ------------------------------------------------------------------------------- |
| Modelo               | `claude-haiku-5-5`                                                              |
| Razonamiento         | **Apagado** (_Thinking Mode_ en _Disabled_). Ver "Si algo falla".               |
| Caché de prompt      | _5 Minutes_: el prompt y las herramientas se repiten en cada llamada al modelo. |
| Vueltas por pregunta | 6 como máximo                                                                   |
| Tokens de salida     | 4096 como máximo                                                                |
| Memoria              | _Simple Memory_ por sesión (`userId:sessionId`), últimos 10 mensajes            |

Del lado del FE, la conversación se guarda en `sessionStorage` y el botón del asistente aparece solo con sesión y con `REACT_APP_ASSISTANT_URL` definida.

## Qué sabe el agente

El prompt es un bloque de contexto (arma el generador) seguido de los tres documentos, en este orden:

1.  `system-prompt.md`: cuándo usar cada herramienta, cómo presentar pendientes, favoritos, posiciones, últimos partidos, palmarés y enlaces.
2.  `knowledge.md`: reglas y formatos de los torneos. Es lo único que usa para contestar "¿cómo funciona…?"; si algo no está acá, dice que no lo sabe. Se redactó a partir del código y **conviene que lo revise quien conoce los torneos**.
3.  `routes.md`: rutas de las vistas del sitio. El agente nunca inventa una ruta que no esté acá o en los datos que devuelven las herramientas.

Esos tres archivos son la **única fuente de verdad** del prompt. Un test contrasta `knowledge.md` con el código (tamaños de cuadro, terceros que clasifican, parámetros del rating) y `routes.md` con las rutas que devuelven los endpoints. No puede verificar lo que está escrito solo en prosa.

## Herramientas

El agente tiene 13 herramientas, todas `GET`. El secreto (`X-Recap-Secret`) solo viaja a los endpoints `/api/assistant/*`.

| Herramienta                         | Endpoint del backend                                 | Secreto |
| ----------------------------------- | ---------------------------------------------------- | ------- |
| `listar_jugadores`                  | `GET /api/users`                                     | no      |
| `listar_torneos`                    | `GET /api/tournaments?legacy=false`                  | no      |
| `pendientes_de_jugadores`           | `GET /api/assistant/pending-matches?scope=involving` | sí      |
| `partidos_jugables_entre_jugadores` | `GET /api/assistant/pending-matches?scope=among`     | sí      |
| `historial_entre_jugadores`         | `GET /api/assistant/head-to-head`                    | sí      |
| `posiciones_de_torneo`              | `GET /api/assistant/standings`                       | sí      |
| `ranking_de_jugadores`              | `GET /api/ratings`                                   | no      |
| `rating_en_periodo`                 | `GET /api/ratings/period`                            | no      |
| `estadisticas_de_jugador_en_torneo` | `GET /api/tournaments/:id/players/info`              | no      |
| `resumen_del_dia`                   | `GET /api/recaps/:date` (o `latest`)                 | no      |
| `cronica_de_torneo`                 | `GET /api/tournaments/:id/recap`                     | no      |
| `ultimos_partidos_de_jugador`       | `GET /api/assistant/recent-matches`                  | sí      |
| `campeones_de_torneos`              | `GET /api/assistant/champions`                       | sí      |

Lo que conviene saber de cada grupo:

-   **Pendientes** (`pendientes_de_jugadores`, `partidos_jugables_entre_jugadores`): devuelven el total real, el desglose por torneo con la ruta para verlos y un detalle de 10 partidos por defecto (máximo 20). Con más de 10 el agente da el total, el desglose y el enlace de cada torneo. Los cruces con rival por definir vienen aparte.
-   **Favorito** (`favorite` en cada partido pendiente): el favorito del duelo según el APA Rating, con su etiqueta ("levemente favorito", "favorito" o "gran favorito") y su porcentaje de ganar (o de avanzar de ronda en eliminación directa). Solo se muestra el favorito: no el empate ni el rival. Etiquetas y umbrales se calculan en el backend. En series de ida y vuelta la cifra es de ese partido, no de la serie. Usa los ratings guardados (`player-ratings` y `rating-events`) y solo recalcula el historial como respaldo.
-   **Historial** (`historial_entre_jugadores`): balance y últimos enfrentamientos de DOS jugadores, con la variación de rating de cada partido. Detalla 5 partidos por defecto (máximo 10).
-   **Últimos partidos** (`ultimos_partidos_de_jugador`): los últimos partidos de UN jugador contra cualquier rival, con la variación de rating de cada uno y el resumen ya calculado (balance, total de puntos, mayor pérdida y mayor ganancia). 10 por defecto (máximo 20).
-   **Palmarés** (`campeones_de_torneos`): campeón y subcampeón de TODOS los torneos terminados, incluidos los históricos de 2016 a 2019, con los títulos y subcampeonatos de cada jugador ya contados. `listar_torneos` no trae los históricos (no tienen partidos ni reglas), por eso el palmarés sale de esta herramienta.
-   **Posiciones** (`posiciones_de_torneo`): reutiliza la tabla real del torneo con filas compactas. Un torneo de eliminación directa no tiene tabla.
-   **Ranking, rating por período, estadísticas, resumen del día y crónicas**: usan los endpoints públicos tal cual. Las crónicas son texto largo y el prompt le pide al agente resumirlas.

Los límites de detalle viven en el backend, no en el prompt, para que el modelo no tenga que obedecer "no listes decenas". Lo que devuelve una herramienta se reenvía al modelo en cada vuelta, así que `npm run measure:assistant-tools` marca como PESADA toda respuesta de más de unos 4.000 tokens.

## Límites, costos y seguridad

| Límite                               | Dónde está                                   | Valor                                       |
| ------------------------------------ | -------------------------------------------- | ------------------------------------------- |
| Gasto mensual en Claude              | Consola de Anthropic (**lo configurás vos**) | A tu elección; es el tope real              |
| Mensajes por persona                 | Nodo _Build Context_                         | 40 por hora (ventana deslizante), luego 429 |
| Tamaño del mensaje                   | _Build Context_ y el FE                      | 1000 caracteres                             |
| Vueltas del agente por pregunta      | Nodo _APA Assistant_                         | 6                                           |
| Duración de una ejecución            | Ajustes del workflow                         | 90 s (el FE espera hasta 60 s)              |
| Duración de cada consulta al backend | Cada herramienta                             | 30 s (la validación del token, 10 s)        |
| Memoria de la charla                 | Nodo _Conversation Memory_                   | Últimos 10 mensajes                         |

-   **Gasto.** El límite de gasto mensual de la consola de Anthropic es lo único que protege el crédito si algo falla (un token filtrado, un bucle, un cambio de modelo). El costo medido con la batería de evaluación ronda 0,003 USD por mensaje con Haiku 5.5; el prompt pesa unos 8.000 tokens y cada consulta hace de 2 a 4 llamadas al modelo, por eso se usa el caché de prompt.
-   **Tope por persona.** Cuenta los pedidos válidos y se guarda en los datos estáticos del workflow, que n8n marca como experimentales: solo persisten con el workflow publicado y pueden fallar con muchos pedidos simultáneos. Es un freno de mejor esfuerzo; no reemplaza al límite de gasto.
-   **Pedidos sin sesión.** Responden 401 sin llegar al modelo, pero igual arrancan una ejecución de n8n. Un freno por IP, si hiciera falta, se pone en el proxy delante de n8n.
-   **Datos que ve el agente.** Solo lectura y solo vía `GET`. No recibe el token del usuario. Lo que devuelven las herramientas se trata como datos, no como instrucciones.
-   **Disco de n8n.** Cada ejecución guarda la pregunta y la respuesta. La poda se configura con variables de entorno de la instancia (afectan a todos los workflows, incluidos los recaps):

    ```
    EXECUTIONS_DATA_PRUNE=true
    EXECUTIONS_DATA_MAX_AGE=168          # horas: 7 días (por defecto son 336)
    EXECUTIONS_DATA_PRUNE_MAX_COUNT=2000 # por defecto 10000
    N8N_CONCURRENCY_PRODUCTION_LIMIT=5   # opcional: lo que exceda espera en cola
    ```

    Ya probado el asistente, en _Settings_ del workflow se puede poner _Save successful production executions_ en _Do not save_ y dejar guardadas solo las que fallan.

Códigos de error del webhook (el FE los traduce a mensajes amables):

| Código | `error.code`        | Cuándo                                              |
| ------ | ------------------- | --------------------------------------------------- |
| 400    | `INVALID_REQUEST`   | Mensaje vacío o largo, o sesión de chat mal formada |
| 401    | `INVALID_SESSION`   | Token vencido o inválido                            |
| 429    | `TOO_MANY_REQUESTS` | Superó el tope por persona                          |
| 500    | `ASSISTANT_ERROR`   | Falló el agente (Claude o una herramienta)          |
| 503    | `AUTH_UNAVAILABLE`  | El backend no respondió al validar el token         |

## Instalar o actualizar en n8n

1.  **Antes:** n8n tiene que ser accesible por HTTPS (el navegador llama al webhook), y hacen falta una credencial de **Anthropic** y la credencial del secreto de los recaps (`APA Backend Recap Secret`, tipo _Custom Auth_ que manda `X-Recap-Secret`). El BE tiene que estar desplegado con los endpoints `/api/assistant/*` y con `RECAP_SECRET` definido.
2.  En n8n: **Workflows → Import from file** → `n8n/assistant.json`. Importar crea un workflow nuevo: antes de publicarlo, desactivá el anterior (comparten la ruta del webhook) y archivalo cuando verifiques que el nuevo funciona. El tope por persona y la memoria vuelven a cero.
3.  En el nodo **Claude Haiku** elegí la credencial de Anthropic y verificá el modelo `claude-haiku-5-5`. Abrí una de las herramientas con secreto para confirmar que tomó la credencial del secreto.
4.  **Publicá.** La URL de producción es `https://<tu-n8n>/webhook/apa-assistant`. Va en `REACT_APP_ASSISTANT_URL` del FE (en Vercel, y volver a desplegar); mientras esté vacía, el botón no se muestra.
5.  Probalo con curl (usuario real del sitio):

    ```bash
    N8N=https://tu-n8n.example.com
    API=https://apa-website-be.vercel.app/api
    TOKEN=$(curl -s -X POST "$API/users/login" -H "content-type: application/json" \
      -d '{"email":"TU_EMAIL","password":"TU_PASSWORD"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).token")

    # Con sesión: 200 con { "reply": "..." }
    curl -s -X POST "$N8N/webhook/apa-assistant" -H "content-type: application/json" \
      -H "authorization: Bearer $TOKEN" \
      -d '{"message":"¿Qué partidos tengo pendientes?","sessionId":"prueba-curl-0001"}'

    # Sin token: 401, sin gastar crédito de Claude
    curl -i -X POST "$N8N/webhook/apa-assistant" -H "content-type: application/json" \
      -d '{"message":"hola","sessionId":"prueba-curl-0001"}'
    ```

### Cambiar el prompt o las herramientas

1.  Editá `system-prompt.md`, `knowledge.md` o `routes.md` (o `scripts/buildAssistantWorkflow.js` para herramientas y nodos).
2.  `npm run build:assistant-workflow`.
3.  `npm test` (avisa si el JSON quedó desactualizado).
4.  Importá de nuevo el JSON en n8n, o copiá el cambio a mano al nodo correspondiente.

Si editás el _System Message_ o un nodo directamente en n8n, pasá el cambio a los archivos de esta carpeta o al generador: si no, la próxima importación lo pisa. El prompt no puede contener llaves dobles (`{{ }}`): n8n las evalúa como expresiones.

## Si algo falla

-   **Error 400 de Anthropic: "thinking block … bound to a different conversation".** Haiku 5.5 razona por defecto y ata cada bloque de razonamiento a todo lo anterior de la charla; cuando la memoria de n8n recorta los mensajes más viejos, Anthropic rechaza lo guardado (pasaba en el 7º mensaje). Por eso _Thinking Mode_ está en _Disabled_ en el nodo **Claude Haiku**. Si vuelve a aparecer, revisá que esa opción siga puesta.
-   **500 (`ASSISTANT_ERROR`).** Abrí la ejecución con error en n8n y mirá qué nodo falló: puede ser Claude (límite de uso, sobrecarga, crédito), una herramienta o el máximo de vueltas.
-   **El navegador bloquea la respuesta por CORS.** La respuesta del webhook tiene que traer `Access-Control-Allow-Origin` con el origen del sitio, también en los errores. Revisá _Allowed Origins_ en el nodo **Chat Webhook**.
-   **Las herramientas no reciben parámetros.** El workflow los arma con `$fromAI(...)` dentro de _Query → Using JSON_. Si una herramienta aparece sin campos en la ejecución, abrila y comprobá que n8n los detecte.
-   **Una herramienta devuelve 404.** El BE desplegado no tiene ese endpoint todavía.
-   **Un usuario recibe "mandaste muchos mensajes".** Es el tope por persona. Se cambia en `RATE_LIMIT_MAX_MESSAGES` de `scripts/buildAssistantWorkflow.js` o en el código del nodo _Build Context_.
-   **La memoria se pierde.** _Simple Memory_ vive en el proceso de n8n: se borra al reiniciarlo.
-   **El import marca un nodo como no soportado.** El agente usa `typeVersion: 3` y las herramientas HTTP `4.2`; hace falta un n8n reciente.

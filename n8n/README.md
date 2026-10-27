# Asistente de chat de APA (n8n)

Workflow de n8n que responde preguntas de los usuarios del sitio. Solo lectura: consulta el backend, procesa y contesta en español, con enlaces a las vistas del sitio cuando existen.

```
FE (usuario logueado)
  └─ POST /webhook/apa-assistant   { message, sessionId }   Authorization: Bearer <token de sesión>
       └─ n8n: valida el token con GET /api/users/me
            └─ Agente (Claude Haiku 5.5 + memoria corta por sesión)
                 └─ herramientas GET → backend (X-Recap-Secret en los endpoints /assistant/*)
       └─ { reply: "<Markdown>" }
```

## Archivos

Los archivos del asistente viven en esta carpeta (`n8n/`) y están versionados. CI los necesita: los tests leen estos archivos.

| Archivo                             | Qué es                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `n8n/assistant.json`                | Workflow para importar en n8n. **Se genera**, no se edita a mano.                        |
| `n8n/system-prompt.md`              | Prompt del agente, en Markdown. Con `knowledge.md` y `routes.md` es la fuente del texto. |
| `scripts/buildAssistantWorkflow.js` | Arma el JSON a partir del prompt (`npm run build:assistant-workflow`).                   |
| `test/assistantWorkflow.test.js`    | Verifica que el JSON esté sincronizado, que las herramientas sean solo lectura y más.    |

Para evaluar si el modelo alcanza (batería de preguntas, criterios y plantilla de resultados) ver [`EVALUATION.md`](EVALUATION.md).

## Lo que sabe el agente además de los datos

El prompt se arma con tres documentos Markdown, en este orden:

1. `system-prompt.md`: reglas de comportamiento, cuándo usar cada herramienta y cómo presentar la información.
2. `knowledge.md`: **reglas y formatos de los torneos** (tabla, desempates, clasificación, cruces, APA Rating). Es lo único que el agente usa para contestar "¿cómo funciona…?"; si algo no está acá, dice que no lo sabe. Se redactó a partir del código (`config/tournamentFormatRules.js`, `config/playoffFormats.js`, `config/ratings.js`, `fixture-generation/`, `service/generatePlayinUpdate`, `docs/APA-RATING.md`) y **conviene que lo revise quien conoce los torneos**.
3. `routes.md`: mapa de vistas del sitio con su ruta, para que el agente enlace a donde se ve cada cosa. Sale de `routesConfig.js` del FE y de las pestañas del torneo.

Un test contrasta `knowledge.md` con el código (tamaños de cuadro, terceros que clasifican, parámetros del rating) y `routes.md` con las rutas que devuelven los endpoints, así que si cambia una regla o una ruta en el código el test avisa. No puede verificar lo que solo está escrito en prosa, como el orden del play-in.

Esos tres archivos son la **única fuente de verdad** del prompt. El texto completo que ve el modelo es un bloque de contexto (nombre, id y fecha del usuario, que arma el generador) seguido de esos tres documentos, y no existe otro archivo con el prompt. Si editás el _System Message_ directamente en n8n (o pegás una copia revisada), pasá los cambios a estos archivos y regenerá el workflow; si no, la próxima importación los pisa.

Al agregar un formato o una vista nueva, actualizá el documento que corresponda y corré `npm run build:assistant-workflow`.

## Qué puede hacer el agente

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

Todas son `GET`: el agente no puede escribir. El secreto solo viaja a los endpoints `/api/assistant/*`.

### Tamaño de las respuestas

Lo que devuelve una herramienta se reenvía al modelo en cada vuelta del agente, así que una respuesta grande cuesta tokens y distrae. Por eso:

-   Pendientes, historial y posiciones tienen endpoints propios (`/api/assistant/*`) con respuesta compacta y tope de detalle: pendientes detalla 10 partidos por defecto (máximo 20), historial 5 (máximo 10) y últimos partidos 10 (máximo 20). Con más de 10 pendientes el agente dice el total, el desglose por torneo, lista los 10 del detalle y da el enlace de cada torneo. La tabla original trae las últimas jornadas completas de cada equipo y es varias veces más grande (un test fija una reducción de al menos 3 veces con datos de ejemplo; con torneos de 48 equipos es mucho más).
-   El ranking, el rating por período y las estadísticas de un jugador ya son chicos y se usan tal cual.
-   Las crónicas son texto largo (típicamente unos pocos miles de caracteres, con un tope de 50.000). El prompt le pide al agente resumirlas.

Con datos reales se puede medir cada herramienta con `npm run measure:assistant-tools` (variables `ASSISTANT_API` y `RECAP_SECRET`; solo hace `GET`). Marca como PESADA toda respuesta de más de ~4.000 tokens estimados. Este documento no trae esa medición porque se preparó sin acceso a la base real.

## Puesta en marcha (la hace una persona con acceso a n8n)

### 1. Antes de importar

-   n8n tiene que ser accesible por **HTTPS** desde Internet: el navegador del usuario llama al webhook (el sitio está en HTTPS y bloquea llamadas a HTTP).
-   Tener una credencial de **Anthropic** (API key) en n8n.
-   Tener la credencial del secreto de los recaps (`APA Backend Recap Secret`, tipo _Custom Auth_ que manda `X-Recap-Secret`). El workflow la referencia por id y nombre; si tu instancia tiene otro id, n8n te pedirá elegirla al abrir cada herramienta.

### 2. Importar

1. En n8n: **Workflows → Import from file** → `n8n/assistant.json`.
2. Abrí el nodo **Claude Haiku** y elegí tu credencial de Anthropic. Verificá que el modelo sea `claude-haiku-5-5`. Si no aparece en la lista, escribilo como ID.
3. Abrí cada herramienta con 🔒 (`pendientes_de_jugadores`, `partidos_jugables_entre_jugadores`, `historial_entre_jugadores`, `posiciones_de_torneo`, `ultimos_partidos_de_jugador`) y confirmá la credencial del secreto.
4. En el nodo **Chat Webhook**, revisá _Allowed Origins (CORS)_: por defecto `https://sitioapa.com.ar`, `https://apa-website-fe.vercel.app` y `http://localhost:3000` (este último solo para desarrollo; sacalo en producción si no lo necesitás).
5. **Publicá** el workflow. La URL de producción queda así:

    ```
    https://<tu-n8n>/webhook/apa-assistant
    ```

Esa URL va en la variable `REACT_APP_ASSISTANT_URL` del FE. Los `.env` del FE no están en git, así que para el deploy hay que definirla en Vercel (_Project Settings → Environment Variables_) y volver a desplegar. Mientras esté vacía, el botón del asistente no se muestra.

### 3. Probarlo con curl

Reemplazá `N8N` por tu dominio y usá un usuario real del sitio.

```bash
N8N=https://tu-n8n.example.com
API=https://apa-website-be.vercel.app/api

# 1) Token de sesión (dura 24 h)
TOKEN=$(curl -s -X POST "$API/users/login" \
  -H "content-type: application/json" \
  -d '{"email":"TU_EMAIL","password":"TU_PASSWORD"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).token")

# 2) Pregunta con sesión válida: debe responder 200 con { "reply": "..." }
curl -s -X POST "$N8N/webhook/apa-assistant" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $TOKEN" \
  -d '{"message":"¿Qué partidos tengo pendientes?","sessionId":"prueba-curl-0001"}'

# 3) Sin token o con token inválido: debe responder 401 y NO gastar crédito de Claude
curl -i -X POST "$N8N/webhook/apa-assistant" \
  -H "content-type: application/json" \
  -d '{"message":"hola","sessionId":"prueba-curl-0001"}'

# 4) Pedido mal formado: 400
curl -i -X POST "$N8N/webhook/apa-assistant" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $TOKEN" \
  -d '{"message":""}'

# 5) Preflight de CORS (lo que hace el navegador antes del POST)
curl -i -X OPTIONS "$N8N/webhook/apa-assistant" \
  -H "origin: https://sitioapa.com.ar" \
  -H "access-control-request-method: POST" \
  -H "access-control-request-headers: authorization,content-type"
```

Preguntas para probar a mano: "¿qué partidos tengo pendientes?", "¿qué podemos jugar Leo, Max y yo?", "¿cómo me fue contra Max?", "¿qué le falta jugar a Santi en la Superliga?".

## Qué revisar si algo falla

Esto no se pudo probar desde el repositorio (no hay acceso a la instancia de n8n); son los puntos a mirar primero:

-   **El import marca un nodo como no soportado.** El agente usa `typeVersion: 3` y las herramientas HTTP `4.2`. Si tu n8n es más viejo, actualizalo o recreá el nodo y copiá sus parámetros.
-   **Error de Anthropic sobre bloques de razonamiento (`thinking`) con herramientas.** Haiku 5.5 razona siempre. Si el agente falla al usar una herramienta, mirá el error de la ejecución en n8n; la alternativa es cambiar el modelo a Sonnet 5.5 (`claude-sonnet-5-5`) y avisar.
-   **El navegador bloquea la respuesta por CORS.** Revisá el resultado del paso 5 de arriba: tiene que traer `Access-Control-Allow-Origin` con el origen del sitio, y también en las respuestas 401/400/500 (nodos _Respond to Webhook_). Si falta en alguna, se agrega como _Response Header_ en ese nodo.
-   **Las herramientas no reciben parámetros.** El workflow arma los parámetros con expresiones `$fromAI(...)` dentro de _Query → Using JSON_. Si la herramienta aparece sin campos en la ejecución, abrila y comprobá que n8n los detecte.
-   **Respuestas cortadas.** `maxTokensToSample` es 4096 e incluye el razonamiento. Subilo si pasa.
-   **La memoria se pierde.** La memoria es _Simple Memory_ (en el proceso de n8n): se borra al reiniciar n8n. Alcanza para una conversación en curso.
-   **Mensajes guardados.** Cada ejecución guarda la pregunta y la respuesta en n8n. Ver "Límites y recursos" más abajo para podarlas.
-   **Un usuario recibe "mandaste muchos mensajes".** Es el tope por persona (ver abajo). Si hace falta más, cambiá `RATE_LIMIT_MAX_MESSAGES` en `scripts/buildAssistantWorkflow.js`.

## Límites y recursos

Qué frena cada cosa, de lo más estricto a lo más suave:

| Límite                               | Dónde está                                   | Valor                                       |
| ------------------------------------ | -------------------------------------------- | ------------------------------------------- |
| Gasto mensual en Claude              | Consola de Anthropic (**lo configurás vos**) | A tu elección; es el tope real              |
| Mensajes por persona                 | Nodo _Build Context_                         | 40 por hora (ventana deslizante), luego 429 |
| Tamaño del mensaje                   | _Build Context_ y el FE                      | 1000 caracteres                             |
| Vueltas del agente por pregunta      | Nodo _APA Assistant_                         | 6                                           |
| Tokens de salida por respuesta       | Nodo _Claude Haiku_                          | 4096                                        |
| Duración de una ejecución            | Ajustes del workflow                         | 90 s (el FE espera hasta 60 s)              |
| Duración de cada consulta al backend | Cada herramienta                             | 30 s (la validación del token, 10 s)        |
| Memoria de la charla                 | Nodo _Conversation Memory_                   | Últimos 10 mensajes                         |

**Límite de gasto en Anthropic.** Es lo único que protege el crédito si algo falla (un token filtrado, un bucle, un cambio de modelo). En la consola de Anthropic entrá a la configuración de la organización y buscá la sección de límites o de facturación para fijar un **límite de gasto mensual** y un aviso por mail antes de llegar. El nombre exacto de la sección puede cambiar; si no la encontrás, buscá "spend limit". Con Haiku 5.5 el costo por consulta es una fracción de centavo, así que un tope de pocos dólares alcanza de sobra para 5 o 6 personas.

**Tope por persona.** Cada pedido válido cuenta contra el tope de quien lo mandó; los pedidos inválidos no. Se guarda en los datos estáticos del workflow, que n8n marca como experimentales: solo persisten con el workflow publicado (no en las pruebas manuales), se guardan cuando la ejecución termina bien y pueden fallar con muchos pedidos simultáneos. Es un freno de mejor esfuerzo contra el uso desmedido de una sola cuenta; no reemplaza al límite de gasto.

**Pedidos sin sesión.** Responden 401 sin llegar al modelo, pero igual arrancan una ejecución de n8n (la que consulta `/api/users/me`). No cuestan crédito de Claude. Si alguna vez ves ráfagas de 401 en las ejecuciones, el freno por IP se pone en el proxy que está delante de n8n en Hostinger, no en n8n.

**Poda de ejecuciones y disco.** n8n guarda cada ejecución con la pregunta y la respuesta. La poda se configura con variables de entorno de la instancia (afectan a todos los workflows, incluidos los recaps):

```
EXECUTIONS_DATA_PRUNE=true
EXECUTIONS_DATA_MAX_AGE=168          # horas: 7 días (por defecto son 336)
EXECUTIONS_DATA_PRUNE_MAX_COUNT=2000 # por defecto 10000
```

Una vez que el asistente esté probado, en _Settings_ de este workflow podés poner _Save successful production executions_ en _Do not save_ y dejar guardadas solo las que fallan. Mientras lo estés probando conviene dejarlo en _Save_, para poder ver qué herramienta usó el agente.

**CPU y memoria (KVM 1: 1 vCPU, 4 GB).** Para este uso (5 o 6 personas) alcanza. Para que una ráfaga no deje sin recursos a los recaps, se puede limitar la concurrencia con `N8N_CONCURRENCY_PRODUCTION_LIMIT=5`: lo que exceda espera en cola. El modelo corre en Anthropic, no en tu servidor; n8n solo espera las respuestas.

**Códigos de error del webhook.** El FE los traduce a mensajes amables.

| Código | `error.code`        | Cuándo                                              |
| ------ | ------------------- | --------------------------------------------------- |
| 400    | `INVALID_REQUEST`   | Mensaje vacío o largo, o sesión de chat mal formada |
| 401    | `INVALID_SESSION`   | Token vencido o inválido                            |
| 429    | `TOO_MANY_REQUESTS` | Superó el tope por persona                          |
| 500    | `ASSISTANT_ERROR`   | Falló el agente (Claude o una herramienta)          |
| 503    | `AUTH_UNAVAILABLE`  | El backend no respondió al validar el token         |

## Cambiar el prompt o las herramientas

1. Editá `n8n/system-prompt.md`, `n8n/knowledge.md` o `n8n/routes.md` (o `scripts/buildAssistantWorkflow.js` para herramientas y nodos).
2. `npm run build:assistant-workflow`
3. `npm test` (el test avisa si el JSON quedó desactualizado).
4. Importá de nuevo el JSON en n8n. Importar crea un workflow nuevo: desactivá y archivá el anterior, o copiá solo el _System Message_ del nodo **APA Assistant**.

El prompt no puede contener llaves dobles (`{{ }}`): n8n las evalúa como expresiones.

## Cómo agregar la herramienta a mano en n8n

Para sumar `ultimos_partidos_de_jugador` a un workflow que ya está importado, sin importar el JSON de nuevo. Los valores salen de `scripts/buildAssistantWorkflow.js` (lo que genera `n8n/assistant.json`); si cambian allá, cambian acá.

1. En el workflow, duplicá el nodo `historial_entre_jugadores` (ya tiene la credencial del secreto y las opciones) y renombralo a `ultimos_partidos_de_jugador`. Tiene que quedar conectado al nodo **APA Assistant** por la entrada _Tool_.
2. Configurá el nodo así:
    - **Method**: `GET` (en la herramienta HTTP no se cambia: es el valor por defecto).
    - **URL**: `https://apa-website-be.vercel.app/api/assistant/recent-matches`
    - **Authentication**: _Generic Credential Type_ → _Custom Auth_, con la misma credencial del secreto de los recaps (`X-Recap-Secret`) que usan las demás herramientas con 🔒.
    - **Send Query Parameters**: activado, _Specify Query Parameters_ en _Using JSON_.
    - **Options**: _Timeout_ 30000 y _Never Error_ activado (igual que las otras).
3. En **Description** (_Set Manually_) pegá exactamente:

    ```
    Últimos partidos jugados de UN jugador contra cualquier rival, del más nuevo al más viejo. Por partido: fecha, torneo, etapa, rival con los equipos de ambos, marcador desde el punto de vista del jugador, resultado (win, draw o loss) y ratingChange, los puntos de APA Rating que ganó o perdió en ese partido (null si no hay dato). Devuelve ya calculados el récord, el total de puntos de rating y la mayor pérdida y la mayor ganancia de rating entre esos partidos. Se puede acotar a una etapa o a un torneo. Para el cara a cara con un rival puntual usá historial_entre_jugadores.
    ```

4. En **JSON** (la consulta) pegá esta expresión. Cada parámetro lo define el modelo con `$fromAI(nombre, descripción, tipo, valor por defecto)`; los vacíos no se envían, porque el backend rechaza `stage=` o `tournamentId=` con 400:

    ```
    ={{ JSON.stringify(Object.fromEntries(Object.entries({ player: $fromAI('player', 'Id del jugador. Para la persona que escribe, el id del contexto.', 'string'), stage: $fromAI('stage', 'Etapa si el usuario pidió una: regular, playin o playoff. Vacío si no.', 'string', ''), tournamentId: $fromAI('tournamentId', 'Id del torneo si el usuario pidió uno puntual. Vacío si no.', 'string', ''), limit: $fromAI('limit', 'Cantidad de últimos partidos a considerar, entre 1 y 20', 'number', 10) }).filter(([, value]) => Array.isArray(value) ? value.length > 0 : value !== '' && value !== undefined && value !== null))) }}
    ```

    | Parámetro      | Tipo     | Requerido | Qué es                                                                 |
    | -------------- | -------- | --------- | ---------------------------------------------------------------------- |
    | `player`       | `string` | sí        | Id del jugador (el del CONTEXTO para "yo")                             |
    | `stage`        | `string` | no        | `regular`, `playin` o `playoff`                                        |
    | `tournamentId` | `string` | no        | Id del torneo                                                          |
    | `limit`        | `number` | no        | Por defecto 10; el backend lo recorta a 1 como mínimo y 20 como máximo |

5. En el nodo **APA Assistant**, en el _System Message_, agregá esta línea en `# HERRAMIENTAS`, justo después de la de `historial_entre_jugadores`:

    ```
    -   `ultimos_partidos_de_jugador`: los últimos partidos jugados de UN jugador contra cualquier rival, con el resultado y los puntos de rating que ganó o perdió en cada uno ("¿cuáles fueron mis últimos 5 partidos?", "¿en cuál perdí más ELO de mis últimos 5?", "¿cómo vengo en los últimos 10?"). Pasá en `limit` la cantidad que pidan (máximo 20; sin cantidad, 10) y la etapa o el torneo si los nombran. El "ELO" de la gente es el APA Rating. Para comparar a DOS jugadores nombrados, o si nombran un rival ("contra Max"), usá `historial_entre_jugadores`.
    ```

    Y copiá también al _System Message_ la sección `# CÓMO PRESENTAR LOS ÚLTIMOS PARTIDOS DE UN JUGADOR` de `n8n/system-prompt.md` (va antes de `# CÓMO RESPONDER SOBRE REGLAS Y FORMATOS`) y la frase final que `system-prompt.md` agrega a la línea de `historial_entre_jugadores` ("Sin un rival nombrado no sirve: …"). Sin esas reglas el agente usa la herramienta pero no sabe presentar la mayor pérdida o ganancia de rating.

6. Probalo con "¿cuáles fueron mis últimos 5 partidos?" y mirá en la ejecución que la herramienta haya recibido `player` y `limit: 5`. El repositorio ya tiene todo esto (`n8n/assistant.json` y `system-prompt.md`), así que no hay nada que copiar de vuelta; solo que importar el JSON de nuevo reemplaza lo que hayas hecho a mano por lo mismo.

## Seguridad

-   La identidad ("yo", "mis") sale del token validado en n8n con `GET /api/users/me`, nunca del cuerpo del pedido.
-   Un pedido sin sesión válida termina en 401 antes de llegar al modelo: no gasta crédito.
-   El agente no recibe el token del usuario. Solo usa `GET`.
-   Tope de 40 mensajes por persona y hora, mensaje de hasta 1000 caracteres, 6 vueltas del agente como máximo y 90 s por ejecución (ver "Límites y recursos").
-   Poné un **límite de gasto mensual** en la consola de Anthropic: es lo único que protege el crédito de verdad.

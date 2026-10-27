/*
 * Arma `n8n/assistant.json`, el workflow del agente del chat, a partir del
 * prompt versionado en `n8n/`. El JSON se genera y se commitea: así el
 * prompt se edita como Markdown y no dentro de un string de JSON, y un test
 * verifica que el archivo exportado no se desincronice del prompt.
 *
 *   node scripts/buildAssistantWorkflow.js
 *
 * El workflow NO contiene secretos. Las credenciales se eligen en n8n al
 * importarlo (ver `n8n/README.md`).
 */

const fs = require("node:fs")
const path = require("node:path")

const ROOT = path.join(__dirname, "..")
const N8N_DIR = path.join(ROOT, "n8n")
const OUTPUT_PATH = path.join(N8N_DIR, "assistant.json")

// Orden en el que se concatenan las partes del prompt del sistema.
const PROMPT_PARTS = ["system-prompt.md", "knowledge.md", "routes.md"]

const API = "https://apa-website-be.vercel.app/api"
const WEBHOOK_PATH = "apa-assistant"
const ALLOWED_ORIGINS =
    "https://sitioapa.com.ar,https://apa-website-fe.vercel.app,http://localhost:3000"
const MODEL_ID = "claude-haiku-5-5"
const MAX_MESSAGE_LENGTH = 1000
const MAX_AGENT_ITERATIONS = 6
const MEMORY_WINDOW = 10
// Tope de mensajes por persona (ventana deslizante). Es un freno razonable para
// una charla normal; el límite de gasto en la consola de Anthropic es el tope
// real.
const RATE_LIMIT_MAX_MESSAGES = 40
const RATE_LIMIT_WINDOW_MINUTES = 60
// Una ejecución que pasa de esto se corta: protege al servidor de 1 vCPU de un
// agente colgado. Una consulta normal tarda menos de 30 segundos.
const EXECUTION_TIMEOUT_SECONDS = 90

// Credencial "Simplified Custom Auth" que ya usan los workflows de recaps:
// manda el secreto compartido en el header `X-Recap-Secret`.
const RECAP_SECRET_CREDENTIAL = {
    id: "2PPJRWOjZtlCihC6",
    name: "APA Backend Recap Secret (Nicolás S)",
}

const readPrompt = () =>
    PROMPT_PARTS.map((file) =>
        // Con core.autocrlf (Windows) los .md se bajan con CRLF: se normaliza
        // para que el JSON sea el mismo en cualquier máquina y en el CI.
        fs
            .readFileSync(path.join(N8N_DIR, file), "utf8")
            .replace(/\r\n/g, "\n")
            .trim()
    ).join("\n\n")

const buildSystemMessage = (prompt) =>
    [
        "=# CONTEXTO",
        "- Quien te escribe es {{ $json.nickname }} (id de jugador: {{ $json.userId }}).",
        "- Hoy es {{ $json.todayLabel }} ({{ $json.today }}), hora de Argentina.",
        "",
        prompt,
    ].join("\n")

const connection = (node, type = "main", index = 0) => ({
    node,
    type,
    index,
})

// Arma el objeto query a partir de campos `clave: expresión`, sin enviar los
// vacíos: el BE rechaza `scope=` o `tournamentId=` con 400.
const compactQuery = (fields) =>
    `={{ JSON.stringify(Object.fromEntries(Object.entries({ ${fields} }).filter(([, value]) => Array.isArray(value) ? value.length > 0 : value !== '' && value !== undefined && value !== null))) }}`

// Comillas simples siempre: n8n lee los argumentos de `$fromAI` para armar el
// esquema de la herramienta y así no depende de cómo interprete las dobles.
const quote = (text) => `'${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`

const idList = (description, hasDefault) =>
    `String($fromAI('players', ${quote(description)}, 'string'${
        hasDefault ? ", ''" : ""
    })).split(',').map((id) => id.trim()).filter(Boolean)`

// Parte variable de una ruta (`/tournaments/<id>/recap`). Va codificada con
// `encodeURIComponent` para que lo que escriba el modelo no pueda salirse de ese
// segmento (por ejemplo con `../`) y llegar a otro endpoint.
const pathArgument = (key, description, defaultValue) =>
    `{{ encodeURIComponent($fromAI('${key}', ${quote(description)}, 'string'${
        defaultValue === undefined ? "" : `, ${quote(defaultValue)}`
    })) }}`

// Herramienta de lectura: siempre GET, con el secreto solo si el endpoint lo
// pide (los públicos no reciben el secreto).
const readTool = ({
    name,
    description,
    endpoint,
    query,
    secret,
    position,
}) => ({
    parameters: {
        toolDescription: description,
        // Un endpoint con `{{ }}` lleva parámetros de ruta y es una expresión.
        url: `${endpoint.includes("{{") ? "=" : ""}${API}${endpoint}`,
        ...(secret
            ? {
                  authentication: "genericCredentialType",
                  genericAuthType: "httpTemplatedCustomAuth",
              }
            : {}),
        sendQuery: true,
        specifyQuery: "json",
        jsonQuery: query,
        options: {
            queryParameterArrays: "repeat",
            timeout: 30000,
            // Los errores del BE (JSON con `error.message`) le llegan al modelo
            // como dato en lugar de cortar la ejecución.
            response: { response: { neverError: true } },
        },
    },
    type: "n8n-nodes-base.httpRequestTool",
    typeVersion: 4.2,
    position,
    name,
    ...(secret
        ? { credentials: { httpTemplatedCustomAuth: RECAP_SECRET_CREDENTIAL } }
        : {}),
})

const respond = ({ id, name, position, code, body }) => ({
    parameters: {
        respondWith: "json",
        responseBody: body,
        options: { responseCode: code },
    },
    id,
    name,
    type: "n8n-nodes-base.respondToWebhook",
    typeVersion: 1.4,
    position,
})

const BUILD_CONTEXT_CODE = `// Valida el pedido y arma el contexto del agente. La identidad sale SOLO del
// token validado, nunca del cuerpo del pedido.
const body = $('Chat Webhook').first().json.body || {};
const user = $('Validate Token').first().json.body.user;

const message = typeof body.message === 'string' ? body.message.trim() : '';
const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';

const errors = [];
let status = 400;
if (!message) errors.push('Falta el mensaje');
if (message.length > ${MAX_MESSAGE_LENGTH}) errors.push('El mensaje es demasiado largo (máximo ${MAX_MESSAGE_LENGTH} caracteres)');
if (!/^[A-Za-z0-9_-]{8,64}$/.test(sessionId)) errors.push('Falta la sesión o no es válida');

// Tope por persona. Cada pedido válido cuenta; los inválidos no. Se guarda en
// los datos estáticos del workflow (solo persisten con el workflow publicado) y
// es de mejor esfuerzo: no reemplaza al límite de gasto de Anthropic.
const userId = String(user.id);
const nowMs = Date.now();
const windowMs = ${RATE_LIMIT_WINDOW_MINUTES} * 60 * 1000;
const store = $getWorkflowStaticData('global');
const hits = store.rateLimit || (store.rateLimit = {});
for (const id of Object.keys(hits)) {
  hits[id] = hits[id].filter((time) => nowMs - time < windowMs);
  if (hits[id].length === 0) delete hits[id];
}
if (errors.length === 0) {
  const used = hits[userId] || [];
  if (used.length >= ${RATE_LIMIT_MAX_MESSAGES}) {
    errors.push('Mandaste muchos mensajes seguidos. Probá de nuevo en unos minutos.');
    status = 429;
  } else {
    used.push(nowMs);
    hits[userId] = used;
  }
}

const today = $now.setZone('America/Argentina/Buenos_Aires').setLocale('es');

return [{
  json: {
    valid: errors.length === 0,
    errors,
    status,
    message,
    userId,
    nickname: user.nickname,
    memoryKey: user.id + ':' + sessionId,
    today: today.toFormat('yyyy-MM-dd'),
    todayLabel: today.toFormat("cccc d 'de' LLLL 'de' yyyy"),
  },
}];`

const booleanCondition = ({ id, expression }) => ({
    conditions: {
        options: {
            caseSensitive: true,
            leftValue: "",
            typeValidation: "strict",
            version: 2,
        },
        conditions: [
            {
                id,
                leftValue: expression,
                rightValue: "",
                operator: {
                    type: "boolean",
                    operation: "true",
                    singleValue: true,
                },
            },
        ],
        combinator: "and",
    },
    options: {},
})

const buildWorkflow = () => {
    const nodes = [
        {
            parameters: {
                httpMethod: "POST",
                path: WEBHOOK_PATH,
                responseMode: "responseNode",
                options: { allowedOrigins: ALLOWED_ORIGINS },
            },
            id: "5d3f1a52-0b57-4d0e-9c0e-3a8d7d0f2a01",
            name: "Chat Webhook",
            type: "n8n-nodes-base.webhook",
            typeVersion: 2.1,
            position: [0, 240],
            webhookId: "8c1f0a77-5b8e-4a55-b0a4-2f4c7d6e9b10",
        },
        {
            parameters: {
                url: `${API}/users/me`,
                sendHeaders: true,
                headerParameters: {
                    parameters: [
                        {
                            name: "Authorization",
                            value: "={{ $json.headers.authorization }}",
                        },
                    ],
                },
                options: {
                    timeout: 10000,
                    response: {
                        response: {
                            fullResponse: true,
                            neverError: true,
                            responseFormat: "json",
                        },
                    },
                },
            },
            id: "0f6c1d0e-6a2b-4c63-8b0f-1d9b0c2e4a02",
            name: "Validate Token",
            type: "n8n-nodes-base.httpRequest",
            typeVersion: 4.5,
            position: [224, 240],
            onError: "continueRegularOutput",
        },
        {
            parameters: booleanCondition({
                id: "token-valid",
                expression:
                    "={{ $json.statusCode === 200 && Boolean($json.body && $json.body.user && $json.body.user.id) }}",
            }),
            id: "2b7e9f31-3c1a-4e8d-a1d4-6f0b5c7a3d03",
            name: "Token Valid?",
            type: "n8n-nodes-base.if",
            typeVersion: 2.2,
            position: [448, 240],
        },
        respond({
            id: "7a4d2c18-9e3b-4f60-8c2a-5b1e0d9f6a04",
            name: "Respond Auth Error",
            position: [672, 400],
            code: "={{ $json.statusCode === 401 ? 401 : 503 }}",
            body: "={{ JSON.stringify($json.statusCode === 401 ? { error: { code: 'INVALID_SESSION', message: 'Tu sesión venció o no es válida. Volvé a iniciar sesión.' } } : { error: { code: 'AUTH_UNAVAILABLE', message: 'No pude verificar tu sesión en este momento. Probá de nuevo en un rato.' } }) }}",
        }),
        {
            parameters: { jsCode: BUILD_CONTEXT_CODE },
            id: "c3e8a6b4-1f2d-4b79-9a05-0d7c4e1b8f05",
            name: "Build Context",
            type: "n8n-nodes-base.code",
            typeVersion: 2,
            position: [672, 160],
        },
        {
            parameters: booleanCondition({
                id: "input-valid",
                expression: "={{ $json.valid }}",
            }),
            id: "e1d5b7a9-4c3f-4a21-8b6e-9f0a2c4d6e06",
            name: "Input Valid?",
            type: "n8n-nodes-base.if",
            typeVersion: 2.2,
            position: [896, 160],
        },
        respond({
            id: "4f9a0c2e-7b1d-4d58-a3e6-2c8b5d1f7a07",
            name: "Respond Rejected Request",
            position: [1120, 320],
            code: "={{ $json.status }}",
            body: "={{ JSON.stringify({ error: { code: $json.status === 429 ? 'TOO_MANY_REQUESTS' : 'INVALID_REQUEST', message: $json.errors.join('. ') } }) }}",
        }),
        {
            parameters: {
                promptType: "define",
                text: "={{ $json.message }}",
                options: {
                    systemMessage: buildSystemMessage(readPrompt()),
                    maxIterations: MAX_AGENT_ITERATIONS,
                    enableStreaming: false,
                },
            },
            id: "9b2e6d4c-8a1f-4c37-b5d0-3e7a1f9c5b08",
            name: "APA Assistant",
            type: "@n8n/n8n-nodes-langchain.agent",
            typeVersion: 3,
            position: [1120, 80],
            onError: "continueErrorOutput",
        },
        respond({
            id: "6d8c3b1a-2e4f-4a96-8d7b-1c5e9a0f3b09",
            name: "Respond Reply",
            position: [1472, 0],
            code: 200,
            body: "={{ JSON.stringify({ reply: $json.output }) }}",
        }),
        respond({
            id: "1a7f5e3d-9c2b-4b84-a6c1-8e0d4f2b6a10",
            name: "Respond Agent Error",
            position: [1472, 192],
            code: 500,
            body: "={{ JSON.stringify({ error: { code: 'ASSISTANT_ERROR', message: 'No pude responder en este momento. Probá de nuevo en un rato.' } }) }}",
        }),
        {
            parameters: {
                model: {
                    __rl: true,
                    mode: "id",
                    value: MODEL_ID,
                },
                options: {
                    maxTokensToSample: 4096,
                    thinkingMode: "disabled",
                },
            },
            id: "3c6b8e2d-5a9f-4d10-9e4b-7a1d0c8f2e11",
            name: "Claude Haiku",
            type: "@n8n/n8n-nodes-langchain.lmChatAnthropic",
            typeVersion: 1.6,
            position: [992, 400],
        },
        {
            parameters: {
                sessionIdType: "customKey",
                sessionKey: "={{ $('Build Context').first().json.memoryKey }}",
                contextWindowLength: MEMORY_WINDOW,
            },
            id: "8e1a4c7f-6b3d-4e92-b0a5-2d9f7c1e4b12",
            name: "Conversation Memory",
            type: "@n8n/n8n-nodes-langchain.memoryBufferWindow",
            typeVersion: 1.3,
            position: [1120, 400],
        },
        readTool({
            name: "listar_jugadores",
            description:
                "Devuelve todos los jugadores del sitio como lista de {id, name}. Usala para convertir el nombre de un jugador en su id antes de consultar partidos o historiales. No hace falta para la persona que escribe: su id ya está en el contexto.",
            endpoint: "/users",
            query: "={{ JSON.stringify({}) }}",
            position: [1248, 400],
        }),
        readTool({
            name: "listar_torneos",
            description:
                "Lista los torneos con partidos del sitio (NO incluye los torneos históricos de 2016 a 2019 del Salón de la Fama) con su id, nombre, formato, si está en curso (ongoing true) o terminado (ongoing false), fechas y quién ganó. Usala para convertir el nombre de un torneo en su id, para saber qué torneos están activos y para saber con qué formato se juega cada uno. Para campeones, subcampeones, títulos o palmarés (incluidos los torneos históricos) usá campeones_de_torneos.",
            endpoint: "/tournaments",
            query: "={{ JSON.stringify({ legacy: false }) }}",
            position: [1376, 400],
        }),
        readTool({
            name: "pendientes_de_jugadores",
            description:
                "Partidos sin jugar de los torneos activos en los que participa al menos uno de los jugadores indicados. Sin jugadores devuelve los pendientes de todos. Devuelve el total real de pendientes (totalPending), el desglose por torneo con la ruta del sitio para verlos y un detalle acotado de partidos (truncated indica si hay más). Los cruces de playoff con rival por definir vienen aparte en awaitingOpponent.",
            endpoint: "/assistant/pending-matches",
            query: compactQuery(
                [
                    "scope: 'involving'",
                    `players: ${idList(
                        "Ids de los jugadores, separados por coma. Vacío para los pendientes de todos.",
                        true
                    )}`,
                    "tournamentId: $fromAI('tournamentId', 'Id del torneo si el usuario pidió uno puntual. Vacío si no.', 'string', '')",
                    "stage: $fromAI('stage', 'Etapa si el usuario pidió una: regular, playin o playoff. Vacío si no.', 'string', '')",
                ].join(", ")
            ),
            secret: true,
            position: [1504, 400],
        }),
        readTool({
            name: "partidos_jugables_entre_jugadores",
            description:
                "Partidos sin jugar que se pueden jugar ahora entre un grupo de al menos 2 jugadores: solo los partidos en los que ambos lados son jugadores del grupo. Sirve para 'nos juntamos Leo, Max y yo, ¿qué podemos jugar?'. Mismo formato de respuesta que pendientes_de_jugadores.",
            endpoint: "/assistant/pending-matches",
            query: compactQuery(
                [
                    "scope: 'among'",
                    `players: ${idList(
                        "Ids de todos los jugadores del grupo (mínimo 2), separados por coma. Incluí al usuario si es parte del grupo."
                    )}`,
                    "tournamentId: $fromAI('tournamentId', 'Id del torneo si el usuario pidió uno puntual. Vacío si no.', 'string', '')",
                    "stage: $fromAI('stage', 'Etapa si el usuario pidió una: regular, playin o playoff. Vacío si no.', 'string', '')",
                ].join(", ")
            ),
            secret: true,
            position: [1632, 400],
        }),
        readTool({
            name: "historial_entre_jugadores",
            description:
                "Historial entre dos jugadores: balance de victorias, empates y goles de siempre, racha actual, mayor victoria de cada uno y los últimos enfrentamientos (más nuevo primero) con fecha, torneo, etapa y resultado. El empate en goles cuenta como empate aunque se haya definido por penales. Se puede acotar a una etapa (por ejemplo solo playoffs) o a un torneo, y entonces el balance y los últimos partidos cuentan solo eso.",
            endpoint: "/assistant/head-to-head",
            query: compactQuery(
                [
                    "playerA: $fromAI('playerA', 'Id del primer jugador', 'string')",
                    "playerB: $fromAI('playerB', 'Id del segundo jugador, distinto del primero', 'string')",
                    "stage: $fromAI('stage', 'Etapa si el usuario pidió una: regular, playin o playoff. Vacío si no.', 'string', '')",
                    "tournamentId: $fromAI('tournamentId', 'Id del torneo si el usuario pidió uno puntual. Vacío si no.', 'string', '')",
                    "limit: $fromAI('limit', 'Cantidad de últimos partidos a mostrar, entre 1 y 10', 'number', 5)",
                ].join(", ")
            ),
            secret: true,
            position: [1760, 400],
        }),
        readTool({
            name: "posiciones_de_torneo",
            description:
                "Tabla de posiciones de un torneo con grupos o de liga: posición, jugador, equipo, partidos, victorias, empates, derrotas, goles, puntos, últimos 5 resultados (W victoria, D empate, L derrota, de más viejo a más nuevo) y, en la Liga y la Superliga, si ya está clasificado o eliminado. Con un jugador devuelve solo sus equipos, con su posición real. Con un grupo, solo ese grupo. Un torneo de eliminación directa no tiene tabla.",
            endpoint: "/assistant/standings",
            query: compactQuery(
                [
                    "tournamentId: $fromAI('tournamentId', 'Id del torneo', 'string')",
                    "group: $fromAI('group', 'Letra del grupo si el usuario pidió uno puntual. Vacío si no.', 'string', '')",
                    "playerId: $fromAI('playerId', 'Id del jugador si el usuario pregunta por uno puntual. Vacío si no.', 'string', '')",
                ].join(", ")
            ),
            secret: true,
            position: [1888, 400],
        }),
        readTool({
            name: "ranking_de_jugadores",
            description:
                "Ranking actual del APA Rating de todos los jugadores: posición, rating, partidos, victorias, empates, derrotas, rating máximo que alcanzó, si es provisorio (menos de 10 partidos) y cuántos puntos cambió en su último partido.",
            endpoint: "/ratings",
            query: "={{ JSON.stringify({}) }}",
            position: [2016, 400],
        }),
        readTool({
            name: "rating_en_periodo",
            description:
                "Cómo cambió el APA Rating entre dos fechas: por jugador, rating y posición al inicio y al final, puntos ganados o perdidos, partidos y récord del período; y el mayor batacazo del período. Sirve para 'quién subió más este mes' o 'cómo vengo esta semana'. Ambas fechas incluidas.",
            endpoint: "/ratings/period",
            query: "={{ JSON.stringify({ dateFrom: $fromAI('dateFrom', 'Primer día del período, formato YYYY-MM-DD', 'string'), dateTo: $fromAI('dateTo', 'Último día del período, formato YYYY-MM-DD, no anterior al primero', 'string') }) }}",
            position: [2144, 400],
        }),
        readTool({
            name: "estadisticas_de_jugador_en_torneo",
            description:
                "Estadísticas de un jugador en un torneo: partidos, victorias, empates, derrotas, goles a favor y en contra, vallas invictas, efectividad, últimos resultados, racha actual y su mejor y peor equipo en ese torneo.",
            endpoint: `/tournaments/${pathArgument(
                "tournamentId",
                "Id del torneo"
            )}/players/info`,
            query: "={{ JSON.stringify({ player: $fromAI('playerId', 'Id del jugador', 'string'), matches: false }) }}",
            position: [1248, 560],
        }),
        readTool({
            name: "resumen_del_dia",
            description:
                "Crónica escrita de los partidos de un día (la que se ve en el Inicio del sitio), con la cantidad de partidos. Sin fecha trae la más reciente. Es un texto largo: usalo para contar lo que pasó, no lo copies entero salvo que lo pidan.",
            endpoint: `/recaps/${pathArgument(
                "date",
                "Fecha en formato YYYY-MM-DD, o latest para la más reciente",
                "latest"
            )}`,
            query: "={{ JSON.stringify({}) }}",
            position: [1376, 560],
        }),
        readTool({
            name: "cronica_de_torneo",
            description:
                "Crónica escrita de un torneo terminado (titular, bajada y texto), la que se ve en el Resumen del torneo. Solo existe para torneos terminados. Es un texto largo: usalo para contar cómo fue el torneo, no lo copies entero salvo que lo pidan.",
            endpoint: `/tournaments/${pathArgument(
                "tournamentId",
                "Id del torneo"
            )}/recap`,
            query: "={{ JSON.stringify({}) }}",
            position: [1504, 560],
        }),
        // Al final de la lista: los ids de las herramientas sin id salen del
        // índice, y así los nodos ya importados en n8n no cambian de id.
        readTool({
            name: "ultimos_partidos_de_jugador",
            description:
                "Últimos partidos jugados de UN jugador contra cualquier rival, del más nuevo al más viejo. Por partido: fecha, torneo, etapa, rival con los equipos de ambos, marcador desde el punto de vista del jugador, resultado (win, draw o loss) y ratingChange, los puntos de APA Rating que ganó o perdió en ese partido (null si no hay dato). Devuelve ya calculados el récord, el total de puntos de rating y la mayor pérdida y la mayor ganancia de rating entre esos partidos. Se puede acotar a una etapa o a un torneo. Para el cara a cara con un rival puntual usá historial_entre_jugadores.",
            endpoint: "/assistant/recent-matches",
            query: compactQuery(
                [
                    "player: $fromAI('player', 'Id del jugador. Para la persona que escribe, el id del contexto.', 'string')",
                    "stage: $fromAI('stage', 'Etapa si el usuario pidió una: regular, playin o playoff. Vacío si no.', 'string', '')",
                    "tournamentId: $fromAI('tournamentId', 'Id del torneo si el usuario pidió uno puntual. Vacío si no.', 'string', '')",
                    "limit: $fromAI('limit', 'Cantidad de últimos partidos a considerar, entre 1 y 20', 'number', 10)",
                ].join(", ")
            ),
            secret: true,
            position: [1632, 560],
        }),
        readTool({
            name: "campeones_de_torneos",
            description:
                "Palmarés de TODOS los torneos terminados y válidos, incluidos los históricos de 2016 a 2019 que no tienen partidos cargados. Por torneo (del más nuevo al más viejo): campeón y subcampeón con su equipo, fecha de cierre, formato y si es histórico. Por jugador, ya contados: títulos y subcampeonatos, con el nombre de los torneos de cada uno. Sirve para 'cuántos títulos ganó X', 'quién ganó tal torneo' y 'quiénes fueron campeones'. Si campeón y subcampeón son la misma persona, el torneo cuenta como título y no como subcampeonato. No necesita parámetros.",
            endpoint: "/assistant/champions",
            query: "={{ JSON.stringify({}) }}",
            secret: true,
            position: [1760, 560],
        }),
    ]

    // Las herramientas no declaran id: se les da uno fijo para que el export
    // sea estable entre corridas.
    const withIds = nodes.map((node, index) =>
        node.id
            ? node
            : {
                  id: `a0b1c2d3-e4f5-4a6b-8c7d-${String(index).padStart(
                      12,
                      "0"
                  )}`,
                  ...node,
              }
    )

    const tools = [
        "listar_jugadores",
        "listar_torneos",
        "pendientes_de_jugadores",
        "partidos_jugables_entre_jugadores",
        "historial_entre_jugadores",
        "posiciones_de_torneo",
        "ranking_de_jugadores",
        "rating_en_periodo",
        "estadisticas_de_jugador_en_torneo",
        "resumen_del_dia",
        "cronica_de_torneo",
        "ultimos_partidos_de_jugador",
        "campeones_de_torneos",
    ]

    return {
        name: "APA Assistant",
        nodes: withIds,
        pinData: {},
        connections: {
            "Chat Webhook": { main: [[connection("Validate Token")]] },
            "Validate Token": { main: [[connection("Token Valid?")]] },
            "Token Valid?": {
                main: [
                    [connection("Build Context")],
                    [connection("Respond Auth Error")],
                ],
            },
            "Build Context": { main: [[connection("Input Valid?")]] },
            "Input Valid?": {
                main: [
                    [connection("APA Assistant")],
                    [connection("Respond Rejected Request")],
                ],
            },
            "APA Assistant": {
                main: [
                    [connection("Respond Reply")],
                    [connection("Respond Agent Error")],
                ],
            },
            "Claude Haiku": {
                ai_languageModel: [
                    [connection("APA Assistant", "ai_languageModel")],
                ],
            },
            "Conversation Memory": {
                ai_memory: [[connection("APA Assistant", "ai_memory")]],
            },
            ...Object.fromEntries(
                tools.map((tool) => [
                    tool,
                    { ai_tool: [[connection("APA Assistant", "ai_tool")]] },
                ])
            ),
        },
        active: false,
        settings: {
            executionOrder: "v1",
            timezone: "America/Argentina/Buenos_Aires",
            executionTimeout: EXECUTION_TIMEOUT_SECONDS,
            saveExecutionProgress: false,
        },
    }
}

const run = async () => {
    // Prettier es dependencia de desarrollo: se usa para que el export quede
    // con el mismo formato que verifica `npm run format:check`.
    const prettier = require("prettier")
    const options = (await prettier.resolveConfig(OUTPUT_PATH)) || {}
    const text = prettier.format(JSON.stringify(buildWorkflow()), {
        ...options,
        parser: "json",
    })

    fs.writeFileSync(OUTPUT_PATH, text)
    console.log(`Workflow escrito en ${path.relative(ROOT, OUTPUT_PATH)}`)
}

if (require.main === module) {
    run().catch((error) => {
        console.error("No se pudo armar el workflow:", error.message)
        process.exitCode = 1
    })
}

module.exports = {
    ALLOWED_ORIGINS,
    API,
    EXECUTION_TIMEOUT_SECONDS,
    MAX_MESSAGE_LENGTH,
    MODEL_ID,
    OUTPUT_PATH,
    PROMPT_PARTS,
    RATE_LIMIT_MAX_MESSAGES,
    RATE_LIMIT_WINDOW_MINUTES,
    buildWorkflow,
    readPrompt,
}

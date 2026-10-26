const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const { DEFAULT_PENDING_LIMIT, buildViewPath } = require("../config/assistant")
const { getPlayoffStartSize } = require("../config/playoffFormats")
const { RATING_CONFIG } = require("../config/ratings")
const GROUP_FORMATS = require("../service/calculateGroupStagePlayoff/formats")

const {
    ALLOWED_ORIGINS,
    API,
    MAX_MESSAGE_LENGTH,
    EXECUTION_TIMEOUT_SECONDS,
    MODEL_ID,
    OUTPUT_PATH,
    RATE_LIMIT_MAX_MESSAGES,
    RATE_LIMIT_WINDOW_MINUTES,
    buildWorkflow,
    readPrompt,
} = require("../scripts/buildAssistantWorkflow")

const exported = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf8"))
const nodeNamed = (name) => exported.nodes.find((node) => node.name === name)
const tools = exported.nodes.filter(
    (node) => node.type === "n8n-nodes-base.httpRequestTool"
)

test("the exported workflow is in sync with the prompt and the build script", () => {
    assert.deepEqual(
        exported,
        buildWorkflow(),
        "Corré `node scripts/buildAssistantWorkflow.js` y commiteá el resultado"
    )
})

test("every connection points to nodes that exist", () => {
    const names = new Set(exported.nodes.map((node) => node.name))

    for (const [source, byType] of Object.entries(exported.connections)) {
        assert.ok(names.has(source), `origen inexistente: ${source}`)

        for (const outputs of Object.values(byType)) {
            for (const output of outputs) {
                for (const { node } of output) {
                    assert.ok(names.has(node), `destino inexistente: ${node}`)
                }
            }
        }
    }

    const targets = new Set(
        Object.values(exported.connections).flatMap((byType) =>
            Object.values(byType).flatMap((outputs) =>
                outputs.flatMap((output) => output.map(({ node }) => node))
            )
        )
    )

    // Los nodos de IA (modelo, memoria, herramientas) se conectan hacia el
    // agente: son origen de la conexión, no destino.
    for (const node of exported.nodes) {
        if (node.type === "n8n-nodes-base.webhook") continue
        assert.ok(
            targets.has(node.name) || node.name in exported.connections,
            `nodo huérfano: ${node.name}`
        )
    }
})

test("node ids and names are unique", () => {
    const ids = exported.nodes.map(({ id }) => id)
    const names = exported.nodes.map(({ name }) => name)

    assert.equal(new Set(ids).size, ids.length)
    assert.equal(new Set(names).size, names.length)
})

test("the agent tools are read-only: GET requests to the backend only", () => {
    assert.equal(tools.length, 11)

    for (const tool of tools) {
        const method = tool.parameters.method ?? "GET"

        assert.equal(method, "GET", tool.name)
        assert.ok(
            tool.parameters.url.replace(/^=/, "").startsWith(`${API}/`),
            tool.name
        )
        assert.equal(tool.parameters.sendBody, undefined, tool.name)
    }
})

test("only the assistant endpoints receive the shared secret", () => {
    for (const tool of tools) {
        const isAssistantEndpoint = tool.parameters.url.includes("/assistant/")

        assert.equal(
            Boolean(tool.credentials),
            isAssistantEndpoint,
            `${tool.name}: el secreto va solo a los endpoints del asistente`
        )

        if (isAssistantEndpoint) {
            assert.deepEqual(Object.keys(tool.credentials), [
                "httpTemplatedCustomAuth",
            ])
        }
    }
})

test("the workflow carries no secrets and is exported inactive", () => {
    const text = JSON.stringify(exported)

    assert.equal(exported.active, false)
    assert.doesNotMatch(text, /sk-ant/)
    assert.doesNotMatch(text, /x-recap-secret/i)
    assert.doesNotMatch(text, /Bearer /)
    assert.equal(nodeNamed("Claude Haiku").credentials, undefined)
})

test("the webhook only accepts POST from the site origins", () => {
    const { parameters } = nodeNamed("Chat Webhook")

    assert.equal(parameters.httpMethod, "POST")
    assert.equal(parameters.responseMode, "responseNode")
    assert.equal(parameters.options.allowedOrigins, ALLOWED_ORIGINS)
    assert.doesNotMatch(parameters.options.allowedOrigins, /\*/)
    assert.equal(parameters.authentication, undefined)
})

test("the token is validated against the backend before anything reaches the model", () => {
    const validate = nodeNamed("Validate Token")

    assert.equal(validate.parameters.url, `${API}/users/me`)
    assert.equal(
        validate.parameters.headerParameters.parameters[0].value,
        "={{ $json.headers.authorization }}"
    )

    // La única salida del webhook va a la validación, y el agente solo se
    // alcanza por la rama "token válido" y "pedido válido".
    assert.deepEqual(
        exported.connections["Chat Webhook"].main[0].map(({ node }) => node),
        ["Validate Token"]
    )
    assert.deepEqual(
        exported.connections["Token Valid?"].main[0].map(({ node }) => node),
        ["Build Context"]
    )
    assert.deepEqual(
        exported.connections["Input Valid?"].main[0].map(({ node }) => node),
        ["APA Assistant"]
    )

    const feedingAgent = Object.entries(exported.connections)
        .filter(([, byType]) =>
            (byType.main ?? []).some((output) =>
                output.some(({ node }) => node === "APA Assistant")
            )
        )
        .map(([source]) => source)

    assert.deepEqual(feedingAgent, ["Input Valid?"])
})

test("the agent uses Haiku 5.5, a short memory and a bounded loop", () => {
    const agent = nodeNamed("APA Assistant")
    const model = nodeNamed("Claude Haiku")
    const memory = nodeNamed("Conversation Memory")

    assert.equal(model.parameters.model.value, MODEL_ID)
    assert.equal(MODEL_ID, "claude-haiku-5-5")
    assert.ok(agent.parameters.options.maxIterations <= 10)
    assert.equal(agent.parameters.options.enableStreaming, false)
    assert.equal(agent.onError, "continueErrorOutput")
    assert.ok(memory.parameters.contextWindowLength <= 20)
    assert.match(memory.parameters.sessionKey, /memoryKey/)
})

test("the system message starts with the verified identity and holds the whole prompt", () => {
    const prompt = readPrompt()
    const { systemMessage } = nodeNamed("APA Assistant").parameters.options

    assert.ok(systemMessage.startsWith("=# CONTEXTO"))
    assert.match(systemMessage, /\{\{ \$json\.nickname \}\}/)
    assert.match(systemMessage, /\{\{ \$json\.userId \}\}/)
    assert.ok(systemMessage.endsWith(prompt))
    // Cualquier llave doble del prompt se evaluaría como expresión de n8n.
    assert.doesNotMatch(prompt, /\{\{|\}\}/)
})

test("the prompt names exactly the tools that exist", () => {
    const prompt = readPrompt()
    const toolNames = tools.map(({ name }) => name)

    for (const name of toolNames) {
        assert.ok(
            prompt.includes(`\`${name}\``),
            `el prompt no menciona ${name}`
        )
    }

    const mentioned = [...prompt.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map(
        ([, name]) => name
    )

    for (const name of mentioned) {
        assert.ok(toolNames.includes(name), `el prompt menciona ${name}`)
    }
})

test("the prompt keeps the pending-matches policy: the list is capped and links come from the data", () => {
    const prompt = readPrompt()

    // El prompt lista tantos partidos como detalla el backend por defecto.
    assert.match(
        prompt,
        new RegExp(`${DEFAULT_PENDING_LIMIT} pendientes o menos`)
    )
    assert.match(
        prompt,
        new RegExp(`listá los ${DEFAULT_PENDING_LIMIT} y dá el enlace`)
    )
    assert.doesNotMatch(prompt, /primeros 5/)
    assert.match(prompt, /nunca inventes una/i)
    assert.match(prompt, /no podés cargar/i)
})

// Evalúa las expresiones de `jsonQuery` como lo haría n8n, con `$fromAI`
// resuelto con los valores que "eligió el modelo".
const evaluateQuery = (toolName, chosen) => {
    const expression = nodeNamed(toolName).parameters.jsonQuery
    const body = expression.slice(3, -2)
    const $fromAI = (key, _description, _type, fallback) =>
        key in chosen ? chosen[key] : fallback

    return JSON.parse(new Function("$fromAI", `return ${body}`)($fromAI))
}

test("the tool queries drop empty values and split the player ids", () => {
    assert.deepEqual(
        evaluateQuery("pendientes_de_jugadores", { players: "u1, u2" }),
        { scope: "involving", players: ["u1", "u2"] }
    )
    assert.deepEqual(evaluateQuery("pendientes_de_jugadores", {}), {
        scope: "involving",
    })
    assert.deepEqual(
        evaluateQuery("pendientes_de_jugadores", {
            players: "",
            tournamentId: "abc",
            stage: "playoff",
        }),
        { scope: "involving", tournamentId: "abc", stage: "playoff" }
    )
    assert.deepEqual(
        evaluateQuery("partidos_jugables_entre_jugadores", {
            players: "u1,u2,u3",
        }),
        { scope: "among", players: ["u1", "u2", "u3"] }
    )
    assert.deepEqual(
        evaluateQuery("historial_entre_jugadores", {
            playerA: "a",
            playerB: "b",
        }),
        { playerA: "a", playerB: "b", limit: 5 }
    )
    assert.deepEqual(evaluateQuery("listar_torneos", {}), { legacy: false })
    assert.deepEqual(evaluateQuery("listar_jugadores", {}), {})
})

test("players are sent as repeated query params, as the backend expects", () => {
    for (const tool of tools) {
        assert.equal(tool.parameters.options.queryParameterArrays, "repeat")
    }
})

// Ejecuta el nodo Code con los datos que n8n le daría.
const runBuildContext = ({ body, user, store = {} }) => {
    const code = nodeNamed("Build Context").parameters.jsCode
    const $ = (name) => ({
        first: () => ({
            json:
                name === "Chat Webhook"
                    ? { body }
                    : { body: { user }, statusCode: 200 },
        }),
    })
    const today = {
        setZone: () => today,
        setLocale: () => today,
        toFormat: (format) =>
            format === "yyyy-MM-dd"
                ? "2026-10-26"
                : "lunes 26 de octubre de 2026",
    }

    return new Function("$", "$now", "$getWorkflowStaticData", code)(
        $,
        today,
        () => store
    )[0].json
}

test("Build Context takes the identity from the validated token, never from the body", () => {
    const context = runBuildContext({
        body: {
            message: "  ¿Qué tengo pendiente?  ",
            sessionId: "abcdefgh-1234",
            userId: "intruso",
            nickname: "Intruso",
        },
        user: { id: "u-nico", nickname: "Nico" },
    })

    assert.equal(context.valid, true)
    assert.equal(context.userId, "u-nico")
    assert.equal(context.nickname, "Nico")
    assert.equal(context.message, "¿Qué tengo pendiente?")
    assert.equal(context.memoryKey, "u-nico:abcdefgh-1234")
    assert.equal(context.today, "2026-10-26")
})

test("Build Context rejects empty, oversized and badly identified requests", () => {
    const user = { id: "u-nico", nickname: "Nico" }
    const valid = { message: "hola", sessionId: "abcdefgh-1234" }
    const invalid = [
        {},
        { ...valid, message: "   " },
        { ...valid, message: "x".repeat(MAX_MESSAGE_LENGTH + 1) },
        { ...valid, sessionId: "corto" },
        { ...valid, sessionId: "tiene espacios y símbolos!" },
        { message: "hola" },
        { ...valid, message: 42 },
    ]

    for (const body of invalid) {
        const context = runBuildContext({ body, user })

        assert.equal(context.valid, false, JSON.stringify(body).slice(0, 60))
        assert.ok(context.errors.length > 0)
    }

    assert.equal(
        runBuildContext({
            body: { ...valid, message: "x".repeat(MAX_MESSAGE_LENGTH) },
            user,
        }).valid,
        true
    )
})

test("error responses never expose internal details", () => {
    const responses = exported.nodes.filter(
        (node) => node.type === "n8n-nodes-base.respondToWebhook"
    )

    assert.equal(responses.length, 4)

    for (const response of responses) {
        assert.doesNotMatch(
            response.parameters.responseBody,
            /\$json\.(error|message|stack)\b(?!s)/,
            response.name
        )
    }
})

// ---------------------------------------------------------------------------
// Conocimiento y mapa del sitio: se contrastan con el código para que el
// documento no se desactualice sin que nadie se entere.
// ---------------------------------------------------------------------------

const readPart = (file) =>
    fs.readFileSync(path.join(__dirname, "..", "n8n", file), "utf8")
const knowledge = readPart("knowledge.md")
const siteMap = readPart("routes.md")

const FORMATS = [
    "league",
    "league_playin_playoff",
    "playoff",
    "world_cup",
    "world_cup_2026",
    "super_cup",
    "champions_league",
    "american_cup",
    "club_world_cup",
]

const joinWithY = (items) =>
    items.length > 1
        ? `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`
        : items[0]

test("the system message carries the prompt, the rules and formats, and the site map", () => {
    const { systemMessage } = nodeNamed("APA Assistant").parameters.options

    assert.ok(systemMessage.includes("# REGLAS Y FORMATOS"))
    assert.ok(systemMessage.includes("# MAPA DEL SITIO"))
    assert.ok(
        systemMessage.indexOf("# REGLAS DE ORO") <
            systemMessage.indexOf("# REGLAS Y FORMATOS")
    )
    assert.doesNotMatch(knowledge + siteMap, /\{\{|\}\}/)
})

test("the knowledge does not assume every player has the same number of teams", () => {
    assert.match(
        knowledge,
        /No siempre los jugadores tienen la misma cantidad de equipos/
    )
    assert.doesNotMatch(
        knowledge,
        /Cada jugador tiene la misma cantidad de equipos/
    )
})

test("the knowledge names every tournament format with its site name", () => {
    for (const format of FORMATS) {
        assert.ok(knowledge.includes(`${format} =`), `falta ${format}`)
    }

    for (const name of [
        "Liga",
        "Superliga",
        "Eliminatoria",
        "Mundial",
        "Supercopa",
        "Champions",
    ]) {
        assert.ok(knowledge.includes(`### ${name}`), `falta la sección ${name}`)
    }
})

test("the knowledge matches the bracket sizes and the third-place rules in the code", () => {
    assert.match(
        knowledge,
        new RegExp(
            `Eliminación directa de ${getPlayoffStartSize("playoff")} equipos`
        )
    )
    assert.match(
        knowledge,
        new RegExp(
            `playoff de ${getPlayoffStartSize("league_playin_playoff")} equipos`
        )
    )

    const worldCup = knowledge.split("### Mundial\n")[1].split("###")[0]
    assert.match(
        worldCup,
        new RegExp(`${getPlayoffStartSize("world_cup")} equipos`)
    )

    for (const [format, section] of [
        ["world_cup_2026", "### Mundial 2026"],
        ["super_cup", "### Supercopa"],
    ]) {
        const { numQualifyingThirds, hostsForThirdsGroups } =
            GROUP_FORMATS[format]
        const text = knowledge.split(`${section}\n`)[1].split("###")[0]

        assert.match(
            text,
            new RegExp(`${numQualifyingThirds} mejores terceros`)
        )
        assert.ok(
            text.includes(joinWithY(hostsForThirdsGroups)) ||
                text.includes(joinWithY(hostsForThirdsGroups.slice().sort())),
            `${format}: los grupos que enfrentan a un tercero no coinciden`
        )
        assert.match(
            text,
            new RegExp(`${getPlayoffStartSize(format)} equipos`),
            format
        )
    }
})

test("the knowledge describes the rating with the parameters of the code", () => {
    assert.match(
        knowledge,
        new RegExp(`empiezan en ${RATING_CONFIG.initialRating}`)
    )
    assert.match(
        knowledge,
        new RegExp(`máximo ${RATING_CONFIG.kFactor} puntos`)
    )
    assert.match(
        knowledge,
        new RegExp(`Hasta los ${RATING_CONFIG.provisionalMatches} partidos`)
    )
    assert.equal(
        RATING_CONFIG.marginWeight,
        0,
        "el doc dice que no cuenta el margen"
    )
    assert.match(knowledge, /Desde la versión 2\.0/)
    assert.match(RATING_CONFIG.version, /^2\./)
})

test("the site map lists the view that each pending-matches link points to", () => {
    for (const stage of ["regular", "playin", "playoff"]) {
        const pattern = buildViewPath(":id", stage)

        assert.ok(siteMap.includes(`\`${pattern}\``), `falta ${pattern}`)
    }

    assert.ok(siteMap.includes("`/matches?player1="))
})

test("the site map covers the main views of the site", () => {
    for (const route of [
        "/",
        "/tournaments",
        "/tournaments/create-tournament",
        "/matches",
        "/statistics",
        "/hall-of-fame",
        "/edits",
        "/asistente",
        "/users/login",
        "/tournaments/:id",
        "/tournaments/:id/fixture",
        "/tournaments/:id/standings",
        "/tournaments/:id/simulator",
        "/tournaments/:id/playin",
        "/tournaments/:id/playoff-preview",
        "/tournaments/:id/playoffs",
        "/tournaments/:id/stats",
    ]) {
        assert.ok(siteMap.includes(`\`${route}\``), `falta ${route}`)
    }
})

test("the prompt forbids inventing routes and sends rule questions to the knowledge", () => {
    const prompt = readPrompt()

    assert.match(prompt, /Nunca inventes una ruta/)
    assert.match(prompt, /SOLO la sección REGLAS Y FORMATOS/)
    assert.match(prompt, /MAPA DEL SITIO/)
})

// ---------------------------------------------------------------------------
// Herramientas de consulta ampliadas
// ---------------------------------------------------------------------------

// Resuelve la URL de una herramienta como n8n: lo que va entre `{{ }}` se
// evalúa con `$fromAI` devolviendo lo que "eligió el modelo".
const evaluateUrl = (toolName, chosen) => {
    const { url } = nodeNamed(toolName).parameters
    const $fromAI = (key, _description, _type, fallback) =>
        key in chosen ? chosen[key] : fallback

    return url
        .replace(/^=/, "")
        .replace(/\{\{(.+?)\}\}/g, (_, expression) =>
            new Function("$fromAI", `return ${expression}`)($fromAI)
        )
}

test("the new query tools build their query from what the model chooses", () => {
    assert.deepEqual(
        evaluateQuery("historial_entre_jugadores", {
            playerA: "a",
            playerB: "b",
            stage: "playoff",
            tournamentId: "t1",
        }),
        {
            playerA: "a",
            playerB: "b",
            stage: "playoff",
            tournamentId: "t1",
            limit: 5,
        }
    )
    assert.deepEqual(
        evaluateQuery("posiciones_de_torneo", { tournamentId: "t1" }),
        { tournamentId: "t1" }
    )
    assert.deepEqual(
        evaluateQuery("posiciones_de_torneo", {
            tournamentId: "t1",
            group: "C",
            playerId: "u1",
        }),
        { tournamentId: "t1", group: "C", playerId: "u1" }
    )
    assert.deepEqual(evaluateQuery("ranking_de_jugadores", {}), {})
    assert.deepEqual(
        evaluateQuery("rating_en_periodo", {
            dateFrom: "2026-10-01",
            dateTo: "2026-10-26",
        }),
        { dateFrom: "2026-10-01", dateTo: "2026-10-26" }
    )
    assert.deepEqual(
        evaluateQuery("estadisticas_de_jugador_en_torneo", { playerId: "u1" }),
        { player: "u1", matches: false }
    )
})

test("the tools with a route parameter keep the model inside its path segment", () => {
    assert.equal(
        evaluateUrl("cronica_de_torneo", { tournamentId: "abc123" }),
        `${API}/tournaments/abc123/recap`
    )
    assert.equal(
        evaluateUrl("estadisticas_de_jugador_en_torneo", {
            tournamentId: "abc123",
        }),
        `${API}/tournaments/abc123/players/info`
    )
    assert.equal(evaluateUrl("resumen_del_dia", {}), `${API}/recaps/latest`)
    assert.equal(
        evaluateUrl("resumen_del_dia", { date: "2026-10-25" }),
        `${API}/recaps/2026-10-25`
    )

    // Lo que escriba el modelo no puede cambiar de endpoint.
    for (const hostile of ["../users", "x/../../users", "a?b=c", "a#b"]) {
        const url = evaluateUrl("cronica_de_torneo", { tournamentId: hostile })

        assert.match(url, /^.+\/tournaments\/[^/?#]+\/recap$/, hostile)
    }
    assert.doesNotMatch(
        evaluateUrl("resumen_del_dia", { date: "../users" }),
        /\/users/
    )
})

test("the prompt covers every tool and the standings, ranking and recap presentation", () => {
    const prompt = readPrompt()

    for (const name of [
        "posiciones_de_torneo",
        "ranking_de_jugadores",
        "rating_en_periodo",
        "estadisticas_de_jugador_en_torneo",
        "resumen_del_dia",
        "cronica_de_torneo",
    ]) {
        assert.ok(prompt.includes(`\`${name}\``), name)
    }

    assert.match(prompt, /CÓMO PRESENTAR POSICIONES, RANKING Y CRÓNICAS/)
    assert.match(prompt, /Hasta 10 filas por grupo/)
    assert.match(prompt, /G \(ganó\), E \(empató\) y P \(perdió\)/)
})

test("the size-measuring script only reads and covers the assistant tools", () => {
    const { buildRequests } = require("../scripts/measureAssistantTools")
    const requests = buildRequests({
        players: [{ id: "u1" }, { id: "u2" }],
        tournaments: [
            { _id: "t1", ongoing: false },
            { _id: "t2", ongoing: true },
        ],
    })

    // Elige el torneo en curso y no manda el secreto a los endpoints públicos.
    assert.ok(requests.some(({ path }) => path.includes("tournamentId=t2")))
    for (const request of requests) {
        assert.ok(request.path.startsWith("/"), request.path)
        assert.equal(
            Boolean(request.secret),
            request.path.startsWith("/assistant/"),
            request.path
        )
    }

    const covered = requests.map(({ tool }) => tool.split(" (")[0])
    for (const tool of tools.map(({ name }) => name)) {
        assert.ok(covered.includes(tool), `no mide ${tool}`)
    }
})

// ---------------------------------------------------------------------------
// Endurecimiento: tope por persona, tiempo máximo y respuestas de rechazo
// ---------------------------------------------------------------------------

const NICO_USER = { id: "u-nico", nickname: "Nico" }
const MAX_USER = { id: "u-max", nickname: "Max" }
const VALID_BODY = { message: "hola", sessionId: "abcdefgh-1234" }

test("a person can send up to the limit per window and the next one is a 429", () => {
    const store = {}

    for (let sent = 0; sent < RATE_LIMIT_MAX_MESSAGES; sent++) {
        const context = runBuildContext({
            body: VALID_BODY,
            user: NICO_USER,
            store,
        })

        assert.equal(context.valid, true, `mensaje ${sent + 1}`)
    }

    const blocked = runBuildContext({
        body: VALID_BODY,
        user: NICO_USER,
        store,
    })

    assert.equal(blocked.valid, false)
    assert.equal(blocked.status, 429)
    assert.match(blocked.errors.join(" "), /muchos mensajes/)
})

test("the limit is per person: somebody else is not affected", () => {
    const store = {}

    for (let sent = 0; sent < RATE_LIMIT_MAX_MESSAGES; sent++) {
        runBuildContext({ body: VALID_BODY, user: NICO_USER, store })
    }

    const other = runBuildContext({ body: VALID_BODY, user: MAX_USER, store })

    assert.equal(other.valid, true)
})

test("invalid requests do not use up the quota", () => {
    const store = {}

    for (let sent = 0; sent < RATE_LIMIT_MAX_MESSAGES * 2; sent++) {
        const rejected = runBuildContext({
            body: { message: "", sessionId: "x" },
            user: NICO_USER,
            store,
        })

        assert.equal(rejected.status, 400)
    }

    assert.equal(
        runBuildContext({ body: VALID_BODY, user: NICO_USER, store }).valid,
        true
    )
})

test("a blocked person gets the quota back when the window passes", (t) => {
    const store = {}
    let now = Date.parse("2026-10-26T12:00:00Z")
    t.mock.method(Date, "now", () => now)

    for (let sent = 0; sent < RATE_LIMIT_MAX_MESSAGES; sent++) {
        runBuildContext({ body: VALID_BODY, user: NICO_USER, store })
    }
    assert.equal(
        runBuildContext({ body: VALID_BODY, user: NICO_USER, store }).status,
        429
    )

    now += (RATE_LIMIT_WINDOW_MINUTES * 60 + 1) * 1000

    assert.equal(
        runBuildContext({ body: VALID_BODY, user: NICO_USER, store }).valid,
        true
    )
})

test("the rate-limit store forgets people who stopped writing", (t) => {
    const store = {}
    let now = Date.parse("2026-10-26T12:00:00Z")
    t.mock.method(Date, "now", () => now)

    runBuildContext({ body: VALID_BODY, user: MAX_USER, store })
    now += (RATE_LIMIT_WINDOW_MINUTES * 60 + 1) * 1000
    runBuildContext({ body: VALID_BODY, user: NICO_USER, store })

    assert.deepEqual(Object.keys(store.rateLimit), [NICO_USER.id])
})

test("the rejection node answers with the status Build Context chose, without internals", () => {
    const rejection = nodeNamed("Respond Rejected Request")

    assert.equal(
        rejection.parameters.options.responseCode,
        "={{ $json.status }}"
    )
    assert.match(rejection.parameters.responseBody, /TOO_MANY_REQUESTS/)
    assert.match(rejection.parameters.responseBody, /INVALID_REQUEST/)
    assert.deepEqual(
        exported.connections["Input Valid?"].main[1].map(({ node }) => node),
        ["Respond Rejected Request"]
    )
})

test("the workflow has an execution timeout and does not keep per-node progress", () => {
    assert.equal(exported.settings.executionTimeout, EXECUTION_TIMEOUT_SECONDS)
    assert.ok(
        EXECUTION_TIMEOUT_SECONDS >= 60 && EXECUTION_TIMEOUT_SECONDS <= 300
    )
    assert.equal(exported.settings.saveExecutionProgress, false)
    assert.ok(
        tools.every((tool) => tool.parameters.options.timeout <= 30000),
        "cada herramienta corta sola a los 30 s"
    )
})

test("every external call has its own timeout", () => {
    const validate = nodeNamed("Validate Token")

    assert.ok(validate.parameters.options.timeout <= 10000)
    for (const tool of tools) {
        assert.ok(tool.parameters.options.timeout > 0, tool.name)
    }
})

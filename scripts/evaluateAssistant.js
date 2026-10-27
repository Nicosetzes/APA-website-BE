/*
 * Evalúa al asistente de punta a punta: le hace la batería de preguntas de
 * scripts/assistantEvaluation/questions.js a través del webhook real de n8n, con
 * una sesión de un usuario real, y compara cada respuesta con lo que calcula el
 * propio backend. Solo hace lecturas y mensajes de chat (nada se escribe en la
 * base). Cada mensaje consume crédito de Claude: son unas 29 consultas.
 *
 *   ASSISTANT_API=https://apa-website-be.vercel.app/api \
 *   ASSISTANT_WEBHOOK=https://<tu-n8n>/webhook/apa-assistant \
 *   RECAP_SECRET=<secreto de los recaps> \
 *   EVAL_EMAIL=<email del usuario> EVAL_PASSWORD=<contraseña> \
 *   node scripts/evaluateAssistant.js
 *
 * Opcionales:
 *   EVAL_ONLY=pend-propios,h2h-balance   solo esas preguntas
 *   EVAL_OUTPUT=ruta.json                dónde guardar el detalle
 *   EVAL_PAUSE_MS=1500                   pausa entre preguntas
 *
 * Ver n8n/EVALUATION.md para cómo leer el resultado.
 */

const fs = require("node:fs")
const path = require("node:path")
const { randomBytes } = require("node:crypto")

const { QUESTIONS } = require("./assistantEvaluation/questions")
const {
    buildTruthRequest,
    buildWorld,
    evaluateReply,
    resolveQuestion,
    summarize,
} = require("./assistantEvaluation/plan")

const REQUIRED_ENV = [
    "ASSISTANT_API",
    "ASSISTANT_WEBHOOK",
    "RECAP_SECRET",
    "EVAL_EMAIL",
    "EVAL_PASSWORD",
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const request = async (url, options = {}) => {
    let response

    try {
        response = await fetch(url, options)
    } catch (error) {
        // fetch solo dice "fetch failed"; la causa real (DNS, conexión, TLS)
        // viene en error.cause. Se muestra el host, nunca la URL completa.
        const cause = error.cause?.code ?? error.cause?.message ?? error.message
        throw new Error(
            `No se pudo conectar con ${new URL(url).host}: ${cause}`
        )
    }

    const text = await response.text()
    let json = null

    try {
        json = JSON.parse(text)
    } catch {
        // La respuesta no era JSON: se informa con el estado.
    }

    return { status: response.status, json, text }
}

const login = async (api, email, password) => {
    const response = await request(`${api}/users/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
    })

    if (response.status !== 200 || !response.json?.token)
        throw new Error(`No se pudo iniciar sesión (HTTP ${response.status})`)

    return response.json
}

const fetchTruth = async (api, secret, spec) => {
    const response = await request(`${api}${spec.path}`, {
        headers: spec.secret ? { "x-recap-secret": secret } : {},
    })

    if (response.status === 404 && spec.allowNotFound) return null
    if (response.status !== 200)
        throw new Error(
            `El backend respondió ${response.status} en ${
                spec.path.split("?")[0]
            }`
        )

    return spec.pick(response.json)
}

// Manda los mensajes de una pregunta en una sesión nueva y devuelve la última
// respuesta.
const ask = async ({ webhook, token, turns }) => {
    const sessionId = `eval-${randomBytes(12).toString("hex")}`
    const startedAt = Date.now()
    let reply = null

    for (const message of turns) {
        const response = await request(webhook, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ message, sessionId }),
        })

        if (response.status !== 200 || typeof response.json?.reply !== "string")
            throw new Error(
                `El asistente respondió ${response.status}: ${
                    response.json?.error?.message ?? response.text.slice(0, 120)
                }`
            )

        reply = response.json.reply
    }

    return { reply, latencyMs: Date.now() - startedAt }
}

const run = async () => {
    const missing = REQUIRED_ENV.filter((name) => !process.env[name])

    if (missing.length > 0) {
        console.error(`Faltan variables de entorno: ${missing.join(", ")}`)
        process.exitCode = 1
        return
    }

    const api = process.env.ASSISTANT_API.replace(/\/$/, "")
    const webhook = process.env.ASSISTANT_WEBHOOK
    const secret = process.env.RECAP_SECRET
    const only = process.env.EVAL_ONLY?.split(",").map((id) => id.trim())
    const pauseMs = Number(process.env.EVAL_PAUSE_MS ?? 1500)

    const session = await login(
        api,
        process.env.EVAL_EMAIL,
        process.env.EVAL_PASSWORD
    )
    const [users, tournaments] = await Promise.all([
        request(`${api}/users`).then((response) => response.json),
        request(`${api}/tournaments?legacy=false`).then(
            (response) => response.json
        ),
    ])
    const world = buildWorld({ me: session.user, users, tournaments })

    console.log(
        `Evaluando como ${world.me.name}. Otros jugadores: ${Object.values(
            world.players
        )
            .filter(Boolean)
            .map((player) => player.name)
            .join(", ")}. Torneo en curso: ${
            world.tournaments.active?.name ?? "ninguno"
        }.`
    )

    const selected = QUESTIONS.filter((q) => !only || only.includes(q.id))
    const results = []

    for (const question of selected) {
        const resolved = resolveQuestion(question, world)

        if (resolved.skipped) {
            results.push({
                id: resolved.id,
                category: resolved.category,
                skipped: resolved.skipped,
            })
            console.log(`- ${resolved.id}: omitida (${resolved.skipped})`)
            continue
        }

        const result = {
            id: resolved.id,
            category: resolved.category,
            turns: resolved.turns,
        }

        try {
            const truthSpec = buildTruthRequest(question.truth, world)
            const truth = truthSpec
                ? await fetchTruth(api, secret, truthSpec)
                : null
            const { reply, latencyMs } = await ask({
                webhook,
                token: session.token,
                turns: resolved.turns,
            })

            Object.assign(
                result,
                { reply, latencyMs },
                evaluateReply({ resolved, reply, truth, world })
            )
        } catch (error) {
            Object.assign(result, {
                error: error.message,
                passed: false,
                criticalFailed: Boolean(question.critical),
                checks: [],
            })
        }

        results.push(result)

        const failed = (result.checks ?? [])
            .filter((check) => !check.ok)
            .map((check) => check.name)

        console.log(
            `${result.passed ? "✔" : "✖"} ${result.id}${
                result.latencyMs ? ` (${result.latencyMs} ms)` : ""
            }${result.error ? ` ERROR: ${result.error}` : ""}${
                failed.length ? ` falla: ${failed.join(", ")}` : ""
            }`
        )

        await sleep(pauseMs)
    }

    const summary = summarize(results)
    const output =
        process.env.EVAL_OUTPUT ??
        path.join(
            ".agents",
            "tmp",
            `assistant-eval-${new Date()
                .toISOString()
                .replace(/[:.]/g, "-")}.json`
        )

    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(
        output,
        JSON.stringify(
            { ranAt: new Date().toISOString(), summary, results },
            null,
            2
        )
    )

    console.log("\n=== Resumen ===")
    console.table(
        Object.entries(summary.byCategory).map(([categoria, data]) => ({
            categoria,
            ok: `${data.passed}/${data.total}`,
        }))
    )
    console.log(
        `Aprobadas ${summary.passed}/${summary.evaluated} (${Math.round(
            summary.passRate * 100
        )} %, objetivo ${Math.round(summary.target * 100)} %). Omitidas: ${
            summary.skipped
        }.`
    )
    console.log(
        `Latencia: promedio ${summary.latencyMs.average} ms, p95 ${summary.latencyMs.p95} ms.`
    )
    console.log(
        `Costo: el webhook no informa tokens. Restá el gasto de la consola de Anthropic (después − antes) y dividilo por ${summary.messages} mensajes.`
    )
    if (summary.criticalFailures.length)
        console.log(`FALLAS CRÍTICAS: ${summary.criticalFailures.join(", ")}`)
    if (summary.errored.length)
        console.log(`Sin respuesta: ${summary.errored.join(", ")}`)
    console.log(`Veredicto: ${summary.verdict}`)
    console.log(`Detalle guardado en ${output}`)

    if (summary.criticalFailures.length || summary.errored.length)
        process.exitCode = 1
}

if (require.main === module) {
    run().catch((error) => {
        console.error("No se pudo evaluar:", error.message)
        process.exitCode = 1
    })
}

module.exports = { REQUIRED_ENV }

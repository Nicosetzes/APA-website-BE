/*
 * Arma la evaluación a partir del estado real del sitio: quiénes son los
 * jugadores y qué torneos hay, reemplaza los placeholders de las preguntas y
 * dice qué pedirle al backend para conocer la respuesta correcta.
 *
 * Todo acá es puro (no hace pedidos): lo ejecuta scripts/evaluateAssistant.js.
 */

const { runChecks } = require("./checks")

const PASS_RATE_TARGET = 0.9

// Formatos que no tienen tabla de posiciones.
const FORMATS_WITHOUT_TABLE = ["playoff", "american_cup", "club_world_cup"]

const byName = (a, b) => a.name.localeCompare(b.name, "es")

const DAY_MS = 24 * 60 * 60 * 1000
const isoDay = (date) => date.toISOString().slice(0, 10)

// `me` es quien evalúa (el usuario con el que se inicia sesión). Los otros
// jugadores se eligen por orden alfabético para que dos corridas usen siempre
// las mismas personas.
const buildWorld = ({ me, users, tournaments, today = new Date() }) => {
    const allPlayers = users.map((user) => ({
        id: String(user.id),
        name: user.name ?? user.nickname,
    }))
    const self = allPlayers.find((player) => player.id === String(me.id))
    const others = allPlayers.filter((player) => player.id !== String(me.id))
    const [x, y, z] = [...others].sort(byName)
    const active = tournaments.filter((t) => t.ongoing)
    const idOf = (t) => (t ? String(t._id ?? t.id) : null)

    const pick = (t) =>
        t ? { id: idOf(t), name: t.name, format: t.format } : null

    return {
        me: self ?? { id: String(me.id), name: me.nickname ?? me.name },
        players: { x: x ?? null, y: y ?? null, z: z ?? null },
        allPlayers,
        allTournaments: tournaments,
        tournaments: {
            active: pick(active[0]),
            table: pick(
                active.find((t) => !FORMATS_WITHOUT_TABLE.includes(t.format))
            ),
        },
        today,
    }
}

const NEED_RESOLVERS = {
    x: (world) => world.players.x?.name,
    y: (world) => world.players.y?.name,
    z: (world) => world.players.z?.name,
    active: (world) => world.tournaments.active?.name,
    table: (world) => world.tournaments.table?.name,
}

const fill = (text, world) =>
    text.replace(/\{(x|y|z|active|table)\}/g, (_, key) =>
        NEED_RESOLVERS[key](world)
    )

// Devuelve la pregunta lista para enviar o, si el sitio no tiene lo que hace
// falta, el motivo por el que se omite.
const resolveQuestion = (question, world) => {
    const missing = (question.needs ?? []).filter(
        (key) => !NEED_RESOLVERS[key](world)
    )

    if (missing.length > 0) {
        return {
            id: question.id,
            category: question.category,
            skipped: `falta ${missing.join(", ")} en el sitio`,
        }
    }

    const turns = (question.turns ?? [question.text]).map((text) =>
        fill(text, world)
    )

    return {
        id: question.id,
        category: question.category,
        turns,
        question,
    }
}

const playerId = (world, key) =>
    key === "me" ? world.me.id : world.players[key]?.id

const tournamentId = (world, key) => world.tournaments[key]?.id

// Qué pedirle al backend para saber la respuesta correcta. `secret` indica si el
// endpoint exige el secreto de los recaps; `pick` saca la parte útil.
const buildTruthRequest = (truth, world) => {
    const params = (entries) =>
        entries
            .filter(([, value]) => value !== undefined && value !== null)
            .map(
                ([key, value]) => `${key}=${encodeURIComponent(String(value))}`
            )
            .join("&")

    switch (truth.kind) {
        case "pending":
            return {
                path: `/assistant/pending-matches?${params([
                    ["scope", truth.scope],
                    ...truth.players.map((key) => [
                        "players",
                        playerId(world, key),
                    ]),
                    [
                        "tournamentId",
                        truth.tournament
                            ? tournamentId(world, truth.tournament)
                            : undefined,
                    ],
                ])}`,
                secret: true,
                pick: (json) => json.data,
            }
        case "headToHead":
            return {
                path: `/assistant/head-to-head?${params([
                    ["playerA", playerId(world, truth.a)],
                    ["playerB", playerId(world, truth.b)],
                    ["stage", truth.stage],
                    ["limit", 5],
                ])}`,
                secret: true,
                pick: (json) => json.data,
            }
        case "recentMatches":
            return {
                path: `/assistant/recent-matches?${params([
                    ["player", playerId(world, truth.player)],
                    ["limit", truth.limit],
                ])}`,
                secret: true,
                pick: (json) => json.data,
            }
        case "champions":
            return {
                path: "/assistant/champions",
                secret: true,
                pick: (json) => json.data,
            }
        case "standings":
            return {
                path: `/assistant/standings?${params([
                    ["tournamentId", tournamentId(world, truth.tournament)],
                    [
                        "playerId",
                        truth.player
                            ? playerId(world, truth.player)
                            : undefined,
                    ],
                ])}`,
                secret: true,
                pick: (json) => json.data,
            }
        case "ratings":
            return { path: "/ratings", secret: false, pick: (json) => json }
        case "period": {
            const dateTo = isoDay(world.today)
            const dateFrom = isoDay(
                new Date(world.today.getTime() - truth.days * DAY_MS)
            )

            return {
                path: `/ratings/period?${params([
                    ["dateFrom", dateFrom],
                    ["dateTo", dateTo],
                ])}`,
                secret: false,
                pick: (json) => json.data,
            }
        }
        case "recap":
            return {
                path: "/recaps/latest",
                secret: false,
                // Sin crónica el backend responde 404: no es un error de la prueba.
                pick: (json) => json?.data ?? null,
                allowNotFound: true,
            }
        default:
            return null
    }
}

// Corre las comprobaciones de una pregunta ya respondida.
const evaluateReply = ({ resolved, reply, truth, world }) => {
    const checks = runChecks(resolved.question.checks, {
        reply,
        truth,
        world,
    })

    return {
        checks,
        passed: checks.every((check) => check.ok),
        // Una pregunta marcada como crítica lo es entera.
        criticalFailed: checks.some(
            (check) =>
                !check.ok && (check.critical || resolved.question.critical)
        ),
    }
}

const percentile = (values, fraction) => {
    if (values.length === 0) return null

    const sorted = [...values].sort((a, b) => a - b)
    const index = Math.min(
        sorted.length - 1,
        Math.ceil(sorted.length * fraction) - 1
    )

    return sorted[index]
}

// Resumen y veredicto sobre una lista de resultados. Los errores de ejecución
// (el asistente no respondió) cuentan como preguntas fallidas.
const summarize = (results) => {
    const evaluated = results.filter((result) => !result.skipped)
    const passed = evaluated.filter((result) => result.passed)
    const criticalFailures = evaluated.filter((result) => result.criticalFailed)
    const errored = evaluated.filter((result) => result.error)
    const latencies = evaluated
        .map((result) => result.latencyMs)
        .filter((value) => Number.isFinite(value))

    const byCategory = {}
    for (const result of evaluated) {
        const entry = (byCategory[result.category] ??= { total: 0, passed: 0 })
        entry.total += 1
        if (result.passed) entry.passed += 1
    }

    const messages = evaluated.reduce(
        (sum, result) => sum + (result.turns?.length ?? 1),
        0
    )
    const passRate = evaluated.length ? passed.length / evaluated.length : 0

    let verdict = "Sin preguntas para evaluar."
    if (evaluated.length > 0) {
        if (criticalFailures.length > 0 || errored.length > 0)
            verdict =
                "No alcanza todavía: hay fallas críticas o preguntas sin respuesta. Corregir antes de cambiar de modelo."
        else if (passRate >= PASS_RATE_TARGET)
            verdict = "Haiku 5.5 alcanza: se mantiene."
        else
            verdict =
                "Ajustar prompt y descripciones de herramientas y repetir; si sigue bajo el objetivo, probar Sonnet 5.5."
    }

    return {
        total: results.length,
        skipped: results.length - evaluated.length,
        evaluated: evaluated.length,
        passed: passed.length,
        passRate,
        target: PASS_RATE_TARGET,
        criticalFailures: criticalFailures.map((result) => result.id),
        errored: errored.map((result) => result.id),
        byCategory,
        messages,
        latencyMs: {
            average: latencies.length
                ? Math.round(
                      latencies.reduce((sum, value) => sum + value, 0) /
                          latencies.length
                  )
                : null,
            p95: percentile(latencies, 0.95),
        },
        verdict,
    }
}

module.exports = {
    PASS_RATE_TARGET,
    buildTruthRequest,
    buildWorld,
    evaluateReply,
    resolveQuestion,
    summarize,
}

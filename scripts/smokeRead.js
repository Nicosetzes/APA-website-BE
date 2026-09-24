/*
 * Smoke test SOLO DE LECTURA contra la base configurada en MONGO_URI.
 *
 * Candados deliberados, porque esto se corre contra la base productiva:
 *   - `mongoose.set("autoIndex", false)` y `autoCreate: false` evitan que
 *     Mongoose intente crear índices o colecciones al conectar.
 *   - El helper `get()` es el único que hace requests y fija `method: "GET"`.
 *   - Cualquier ruta cuyo método no sea GET se rechaza antes de salir a la red.
 *   - No se importa ningún service ni DAO de escritura.
 */

require("dotenv").config()

const mongoose = require("mongoose")

mongoose.set("autoIndex", false)
mongoose.set("autoCreate", false)

const { once } = require("node:events")

const { validateEnvironment } = require("../config/environment")
const { createApp } = require("../app")
const {
    connectMongo,
    disconnectMongo,
    getDatabaseStatus,
} = require("../database")

const results = []

const createReader =
    (baseUrl) =>
    async (label, path, expectedStatus = 200) => {
        if (/\s/.test(path) || !path.startsWith("/")) {
            throw new Error(`Ruta inválida para smoke de lectura: ${path}`)
        }

        const started = Date.now()

        const response = await globalThis.fetch(`${baseUrl}${path}`, {
            method: "GET",
        })

        const elapsed = Date.now() - started
        const contentType = response.headers.get("content-type") || ""
        const body = contentType.includes("application/json")
            ? await response.json()
            : await response.text()

        const expected = Array.isArray(expectedStatus)
            ? expectedStatus
            : [expectedStatus]
        const ok = expected.includes(response.status)

        results.push({
            label,
            path,
            status: response.status,
            expected: expected.join("/"),
            ms: elapsed,
            ok,
            detail: describe(body),
        })

        return { status: response.status, body, ok }
    }

const describe = (body) => {
    if (body === null || body === undefined) return "sin body"
    if (typeof body === "string") return `texto(${body.length})`
    if (Array.isArray(body)) return `array(${body.length})`
    if (body.error?.code) return `error ${body.error.code}`

    const keys = Object.keys(body)
    const summary = []

    if (Array.isArray(body.matches))
        summary.push(`matches=${body.matches.length}`)
    if (Array.isArray(body.standings))
        summary.push(`standings=${body.standings.length}`)
    if (Array.isArray(body.players))
        summary.push(`players=${body.players.length}`)
    if (Array.isArray(body.data)) summary.push(`data=${body.data.length}`)
    if (typeof body.totalMatches === "number")
        summary.push(`total=${body.totalMatches}`)
    if (Array.isArray(body.bracketPreview))
        summary.push(`bracket=${body.bracketPreview.length}`)

    return summary.length ? summary.join(" ") : `claves: ${keys.join(",")}`
}

const run = async () => {
    // Con SMOKE_BASE_URL apunta a un deployment ya corriendo; sin esa variable
    // levanta la app en proceso contra MONGO_URI.
    const remoteBaseUrl = process.env.SMOKE_BASE_URL?.trim()
    let server
    let baseUrl = remoteBaseUrl

    if (!remoteBaseUrl) {
        validateEnvironment()

        const app = createApp({
            ensureDatabase: connectMongo,
            getDatabaseStatus,
        })

        server = app.listen(0)
        await once(server, "listening")
        baseUrl = `http://127.0.0.1:${server.address().port}`
    }

    console.log(`Smoke de lectura contra ${baseUrl}`)

    const get = createReader(baseUrl)

    try {
        await get("health live", "/health/live")
        await get("health ready", "/health/ready")

        // Rutas autenticadas: sin token deben rechazar, no explotar.
        await get("users/me sin token", "/api/users/me", 401)
        await get("edits sin token", "/api/edits", 401)

        await get("users listing", "/api/users")
        const tournaments = await get("tournaments listing", "/api/tournaments")
        await get("tournaments legacy=false", "/api/tournaments?legacy=false")
        await get("tournaments status=active", "/api/tournaments?status=active")
        await get("tournament images", "/api/tournaments/images")

        await get("matches primera página", "/api/matches?page=1")
        await get(
            "matches filtrados",
            "/api/matches?page=1&type=regular&played=true"
        )
        await get(
            "matches por fecha",
            "/api/matches?dateFrom=2020-01-01&dateTo=2030-01-01"
        )
        await get("matches query inválida", "/api/matches?unexpected=1", 400)
        // La paginación es base 1: page=0 tiene que fallar, no devolver la primera página.
        await get("matches page=0 rechazado", "/api/matches?page=0", 400)

        await get("statistics global", "/api/statistics")
        await get("statistics all-time teams", "/api/statistics/all-time/teams")
        await get(
            "statistics all-time face-to-face",
            "/api/statistics/all-time/face-to-face"
        )

        const list = Array.isArray(tournaments.body) ? tournaments.body : []
        const byFormat = new Map()
        const detailCache = new Map()

        // El listado no proyecta `format` a propósito, así que el formato se
        // descubre desde el detalle de cada torneo.
        for (const tournament of list) {
            const id = String(tournament._id || tournament.id || "")
            if (!id) continue

            const response = await globalThis.fetch(
                `${baseUrl}/api/tournaments/${id}`,
                { method: "GET" }
            )

            if (response.status !== 200) {
                results.push({
                    label: `descubrimiento de formato`,
                    path: `/api/tournaments/${id}`,
                    status: response.status,
                    expected: "200",
                    ms: 0,
                    ok: false,
                    detail: "no se pudo leer el detalle",
                })
                continue
            }

            const detail = await response.json()
            detailCache.set(id, detail)

            if (!byFormat.has(detail.format)) byFormat.set(detail.format, id)
        }

        console.log(
            `\nTorneos en el listado: ${list.length}. Formatos distintos: ${[
                ...byFormat.keys(),
            ].join(", ")}\n`
        )

        for (const [format, id] of byFormat) {
            await get(`detalle [${format}]`, `/api/tournaments/${id}`)
            await get(`summary [${format}]`, `/api/tournaments/${id}/summary`)
            await get(`fixture [${format}]`, `/api/tournaments/${id}/fixture`)
            await get(
                `standings table [${format}]`,
                `/api/tournaments/${id}/standings/table`
            )
            await get(
                `players/info all [${format}]`,
                `/api/tournaments/${id}/players/info?matches=false`
            )
            await get(
                `statistics por torneo [${format}]`,
                `/api/statistics?tournament=${id}`
            )
            await get(
                `playin matches [${format}]`,
                `/api/tournaments/${id}/playin/matches`
            )
            await get(
                `playoff matches [${format}]`,
                `/api/tournaments/${id}/playoff/matches`
            )
            await get(
                `playoffs table [${format}]`,
                `/api/tournaments/${id}/playoffs/table`
            )

            const previewFormats = ["super_cup", "world_cup_2026"]
            await get(
                `playoffs preview [${format}]`,
                `/api/tournaments/${id}/playoffs/preview`,
                previewFormats.includes(format) ? 200 : 422
            )

            const detail = detailCache.get(id)
            const teams = (detail?.teams || [])
                .map(({ team }) => team?.id)
                .filter(Boolean)
                .slice(0, 4)
            const firstPlayer = detail?.players?.[0]?.id

            if (firstPlayer) {
                await get(
                    `players/info jugador [${format}]`,
                    `/api/tournaments/${id}/players/info?player=${firstPlayer}`
                )
            }

            const fixturePlayers = (detail?.players || [])
                .map(({ id: playerId }) => playerId)
                .filter(Boolean)
                .slice(0, 2)

            if (fixturePlayers.length) {
                const repeatedPlayers = fixturePlayers
                    .map((player) => `players=${encodeURIComponent(player)}`)
                    .join("&")

                await get(
                    `fixture filtrado por jugadores [${format}]`,
                    `/api/tournaments/${id}/fixture?${repeatedPlayers}`
                )
            }

            if (teams.length) {
                const repeatedTeams = teams
                    .map((team) => `teams=${encodeURIComponent(team)}`)
                    .join("&")

                await get(
                    `calculator [${format}]`,
                    `/api/tournaments/${id}/calculator?${repeatedTeams}`
                )

                // Formato deprecado que todavía mandan los bundles viejos.
                await get(
                    `calculator JSON legacy [${format}]`,
                    `/api/tournaments/${id}/calculator?teams=${encodeURIComponent(
                        JSON.stringify(teams)
                    )}`
                )
            }
        }

        const anyTournamentId = [...byFormat.values()][0]

        if (anyTournamentId) {
            await get(
                "calculator sin teams",
                `/api/tournaments/${anyTournamentId}/calculator`,
                400
            )
        }

        await get(
            "torneo inexistente",
            "/api/tournaments/aaaaaaaaaaaaaaaaaaaaaaaa",
            404
        )
        await get("ID inválido", "/api/tournaments/no-es-un-id", 400)
        await get("ruta inexistente", "/api/no-existe", 404)
    } finally {
        if (server) {
            server.close()
            await once(server, "close")
            await disconnectMongo()
        }
    }

    const failures = results.filter((r) => !r.ok)

    console.log("=".repeat(110))
    for (const r of results) {
        const flag = r.ok ? "ok  " : "FALLA"
        console.log(
            `${flag} ${String(r.status).padEnd(3)} esperado:${r.expected.padEnd(
                7
            )} ${String(r.ms).padStart(5)}ms  ${r.label.padEnd(38)} ${r.detail}`
        )
    }
    console.log("=".repeat(110))
    console.log(
        `total: ${results.length}   ok: ${
            results.length - failures.length
        }   fallas: ${failures.length}`
    )

    if (failures.length) {
        console.log("\nFallas:")
        failures.forEach((f) =>
            console.log(
                `  ${f.label} -> ${f.path} (status ${f.status}, esperado ${f.expected})`
            )
        )
        process.exitCode = 1
    }
}

run().catch((error) => {
    console.error("El smoke test no pudo completarse:", error.message)
    process.exitCode = 1
})

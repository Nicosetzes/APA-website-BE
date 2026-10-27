/*
 * Mide cuánto pesa lo que le devuelve cada herramienta del asistente al modelo.
 * Solo hace GET de lectura. Sirve para detectar respuestas que conviene recortar
 * antes de que cuesten tokens o confundan al modelo.
 *
 *   ASSISTANT_API=https://apa-website-be.vercel.app/api \
 *   RECAP_SECRET=<secreto> \
 *   node scripts/measureAssistantTools.js
 *
 * Usa el primer torneo activo (o el último) y los dos primeros jugadores para
 * armar las consultas. Los tokens son una estimación (≈ 3,2 caracteres por
 * token en español con JSON); el número real lo da la consola de Anthropic.
 */

const CHARS_PER_TOKEN = 3.2
// A partir de acá la respuesta de una herramienta empieza a pesar en cada
// vuelta del agente (el historial se reenvía completo en cada llamada).
const WARN_TOKENS = 4000

const DAY_MS = 24 * 60 * 60 * 1000
const isoDay = (date) => date.toISOString().slice(0, 10)

const buildRequests = ({ players, tournaments, today = new Date() }) => {
    const [playerA, playerB] = players
    const dateFrom = isoDay(new Date(today.getTime() - 30 * DAY_MS))
    const dateTo = isoDay(today)
    const tournament =
        tournaments.find((item) => item.ongoing) ?? tournaments.at(0)

    const requests = [
        { tool: "listar_jugadores", path: "/users" },
        { tool: "listar_torneos", path: "/tournaments?legacy=false" },
        { tool: "ranking_de_jugadores", path: "/ratings" },
        {
            tool: "rating_en_periodo (últimos 30 días)",
            path: `/ratings/period?dateFrom=${dateFrom}&dateTo=${dateTo}`,
        },
        {
            tool: "pendientes_de_jugadores (todos)",
            path: "/assistant/pending-matches?scope=involving",
            secret: true,
        },
        {
            tool: "pendientes_de_jugadores (uno)",
            path: `/assistant/pending-matches?scope=involving&players=${playerA?.id}`,
            secret: true,
        },
        {
            tool: "partidos_jugables_entre_jugadores",
            path: `/assistant/pending-matches?scope=among&players=${playerA?.id}&players=${playerB?.id}`,
            secret: true,
        },
        {
            tool: "historial_entre_jugadores",
            path: `/assistant/head-to-head?playerA=${playerA?.id}&playerB=${playerB?.id}`,
            secret: true,
        },
        {
            // Peor caso: el límite máximo de partidos.
            tool: "ultimos_partidos_de_jugador",
            path: `/assistant/recent-matches?player=${playerA?.id}&limit=20`,
            secret: true,
        },
        { tool: "resumen_del_dia", path: "/recaps/latest" },
        {
            tool: "campeones_de_torneos",
            path: "/assistant/champions",
            secret: true,
        },
    ]

    if (tournament) {
        const id = tournament._id ?? tournament.id

        requests.push(
            {
                tool: "posiciones_de_torneo (completa)",
                path: `/assistant/standings?tournamentId=${id}`,
                secret: true,
            },
            {
                tool: "posiciones_de_torneo (un jugador)",
                path: `/assistant/standings?tournamentId=${id}&playerId=${playerA?.id}`,
                secret: true,
            },
            {
                tool: "(referencia) tabla original sin recortar",
                path: `/tournaments/${id}/standings/table`,
            },
            {
                tool: "estadisticas_de_jugador_en_torneo",
                path: `/tournaments/${id}/players/info?player=${playerA?.id}&matches=false`,
            },
            { tool: "cronica_de_torneo", path: `/tournaments/${id}/recap` }
        )
    }

    return requests
}

const estimateTokens = (text) => Math.round(text.length / CHARS_PER_TOKEN)

const run = async () => {
    const api = process.env.ASSISTANT_API?.replace(/\/$/, "")
    const secret = process.env.RECAP_SECRET

    if (!api) {
        console.error(
            "Falta ASSISTANT_API (por ejemplo http://localhost:5000/api)"
        )
        process.exitCode = 1
        return
    }

    const get = async (path, { secret: useSecret } = {}) => {
        const response = await fetch(`${api}${path}`, {
            headers: useSecret && secret ? { "x-recap-secret": secret } : {},
        })
        const text = await response.text()

        return { status: response.status, text }
    }

    const parse = async (path) => JSON.parse((await get(path)).text)
    const [players, tournaments] = await Promise.all([
        parse("/users"),
        parse("/tournaments?legacy=false"),
    ])

    if (players.length < 2) {
        console.error("Hacen falta al menos dos jugadores")
        process.exitCode = 1
        return
    }

    const rows = []

    for (const request of buildRequests({ players, tournaments })) {
        const { status, text } = await get(request.path, request)

        rows.push({
            herramienta: request.tool,
            estado: status,
            caracteres: text.length,
            "tokens aprox.": estimateTokens(text),
            aviso: estimateTokens(text) > WARN_TOKENS ? "PESADA" : "",
        })
    }

    console.table(rows)

    if (!secret)
        console.log(
            "Sin RECAP_SECRET: las herramientas con secreto responden 401/503."
        )
}

if (require.main === module) {
    run().catch((error) => {
        console.error("No se pudo medir:", error.message)
        process.exitCode = 1
    })
}

module.exports = { WARN_TOKENS, buildRequests, estimateTokens }

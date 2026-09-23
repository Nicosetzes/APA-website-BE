/*
 * Smoke test de ESCRITURA contra un deployment de pruebas.
 *
 * Guarda principal: antes de escribir nada consulta `/health/ready` del target
 * y aborta si `checks.database` no pasa el allowlist de bases de prueba. Es
 * decir que apuntarlo al dominio de producción no escribe, falla.
 *
 * Uso:
 *   $env:SMOKE_BASE_URL="https://apa-website-be-dev.vercel.app"; npm run smoke:write
 *   $env:SMOKE_WRITE_STEPS="login,createTournament"; npm run smoke:write
 *
 * Los pasos de edits no corren por defecto: suben a Cloudinary, que es una
 * cuenta compartida con producción. Pedilos explícitamente y asegurate de tener
 * CLOUDINARY_EDITS_FOLDER apuntando a otra carpeta en ese entorno.
 */

const {
    TEST_TEAMS,
    TEST_USERS,
    isTestDatabaseName,
} = require("./testEnvironment")

const baseUrl = (
    process.env.SMOKE_BASE_URL || "https://apa-website-be-dev.vercel.app"
).replace(/\/$/, "")

const DEFAULT_STEPS = [
    "login",
    "loginInvalido",
    "createTournament",
    "readCreatedTournament",
    "generateFixture",
    "readFixture",
    "updateResult",
    "readStandingsAfterResult",
    "deleteResult",
    "reloadResult",
    "completeTournament",
    "completeAgainConflict",
    "createPlayoffTournament",
    "readPlayoffBracket",
]

const state = {
    token: null,
    players: [],
    tournamentId: null,
    match: null,
    playoffTournamentId: null,
    editId: null,
}

const results = []

const request = async (method, path, { body, token, raw } = {}) => {
    const headers = {}
    if (body && !raw) headers["content-type"] = "application/json"
    if (token) headers.authorization = `Bearer ${token}`

    const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: raw ? body : body ? JSON.stringify(body) : undefined,
    })

    const text = await response.text()
    let parsed = text

    try {
        parsed = JSON.parse(text)
    } catch {
        /* respuesta no JSON */
    }

    return { status: response.status, body: parsed }
}

const record = (label, expected, actual, detail) => {
    const ok = expected.includes(actual)
    results.push({ label, expected: expected.join("/"), actual, ok, detail })
    return ok
}

const errorCode = (body) =>
    body?.error?.code || JSON.stringify(body).slice(0, 90)

const matchResultBody = (match, scoreP1, scoreP2) => ({
    playerP1: { id: match.playerP1.id, name: match.playerP1.name },
    teamP1: { id: match.teamP1.id, name: match.teamP1.name },
    scoreP1,
    playerP2: { id: match.playerP2.id, name: match.playerP2.name },
    teamP2: { id: match.teamP2.id, name: match.teamP2.name },
    scoreP2,
})

const steps = {
    login: async () => {
        const superadmin = TEST_USERS.find((u) => u.role === "superadmin")
        const { status, body } = await request("POST", "/api/users/login", {
            body: { email: superadmin.email, password: superadmin.password },
        })

        state.token = body?.token || null

        return record(
            "login del superadmin",
            [200],
            status,
            state.token ? `rol ${body?.user?.role}` : errorCode(body)
        )
    },

    loginInvalido: async () => {
        const { status, body } = await request("POST", "/api/users/login", {
            body: { email: "no-existe@apa-dev.dev", password: "incorrecta" },
        })

        return record(
            "login con credenciales inválidas",
            [401],
            status,
            errorCode(body)
        )
    },

    createTournament: async () => {
        const { body: users } = await request("GET", "/api/users")
        const seeded = TEST_USERS.filter((u) => u.role === "user").map(
            (user) => {
                const match = (users || []).find(
                    (u) => u.name === user.nickname
                )
                return match ? { id: match.id, name: match.name } : null
            }
        )

        if (seeded.some((player) => !player)) {
            return record(
                "POST /api/tournaments",
                [200],
                0,
                "faltan usuarios sembrados: corré npm run seed:test"
            )
        }

        state.players = seeded

        const teams = TEST_TEAMS.slice(0, seeded.length).map((team, index) => ({
            team,
            player: seeded[index],
        }))

        const { status, body } = await request("POST", "/api/tournaments", {
            token: state.token,
            body: {
                format: "league",
                name: `Smoke liga ${new Date().toISOString().slice(0, 19)}`,
                players: seeded,
                teams,
            },
        })

        state.tournamentId = body?._id || body?.id || null

        return record(
            "POST /api/tournaments (league)",
            [200, 201],
            status,
            state.tournamentId
                ? `id=${state.tournamentId} jugadores=${seeded.length}`
                : errorCode(body)
        )
    },

    readCreatedTournament: async () => {
        const { status, body } = await request(
            "GET",
            `/api/tournaments/${state.tournamentId}`
        )

        return record(
            "GET del torneo creado",
            [200],
            status,
            `formato=${body?.format} ongoing=${body?.ongoing} equipos=${body?.teams?.length}`
        )
    },

    generateFixture: async () => {
        const { status, body } = await request(
            "POST",
            `/api/tournaments/${state.tournamentId}/fixture`,
            { token: state.token, body: { group: null } }
        )

        return record(
            "POST fixture",
            [200, 201],
            status,
            typeof body === "object"
                ? "fixture generado"
                : String(body).slice(0, 60)
        )
    },

    readFixture: async () => {
        const { status, body } = await request(
            "GET",
            `/api/tournaments/${state.tournamentId}/fixture`
        )

        const matches = body?.matches || []
        state.match = matches.find((m) => m.playerP1 && m.playerP2) || null

        return record(
            "GET fixture",
            [200],
            status,
            state.match
                ? `${matches.length} partidos, tomo ${state.match._id}`
                : `sin partidos utilizables (${matches.length})`
        )
    },

    updateResult: async () => {
        const { status, body } = await request(
            "PUT",
            `/api/tournaments/${state.tournamentId}/matches/update-game/${state.match._id}`,
            { token: state.token, body: matchResultBody(state.match, 3, 1) }
        )

        return record(
            "PUT update-game 3-1",
            [200],
            status,
            typeof body === "object" ? "resultado cargado" : errorCode(body)
        )
    },

    readStandingsAfterResult: async () => {
        const { status, body } = await request(
            "GET",
            `/api/tournaments/${state.tournamentId}/standings/table`
        )

        const rows = body?.standings?.[0]?.teams || []
        const winner = rows.find((row) => row.team.id === state.match.teamP1.id)

        const ok = record(
            "GET standings refleja el resultado",
            [200],
            status,
            winner
                ? `${winner.team.name}: ${winner.points} pts, DG ${winner.scoringDifference}, PJ ${winner.played}`
                : "no encontré al ganador en la tabla"
        )

        if (winner && (winner.points !== 3 || winner.scoringDifference !== 2)) {
            results[results.length - 1].ok = false
            results[results.length - 1].detail += " <- esperaba 3 pts y DG 2"
            return false
        }

        return ok
    },

    deleteResult: async () => {
        const { status, body } = await request(
            "PUT",
            `/api/tournaments/${state.tournamentId}/matches/delete-game/${state.match._id}`,
            { token: state.token }
        )

        const cleared =
            body?.played === false &&
            body?.scoreP1 === undefined &&
            body?.outcome === undefined

        const ok = record(
            "PUT delete-game",
            [200],
            status,
            cleared
                ? "played=false y scores/outcome limpiados"
                : `estado inesperado: ${JSON.stringify(body).slice(0, 90)}`
        )

        if (status === 200 && !cleared) {
            results[results.length - 1].ok = false
            return false
        }

        return ok
    },

    reloadResult: async () => {
        const { status } = await request(
            "PUT",
            `/api/tournaments/${state.tournamentId}/matches/update-game/${state.match._id}`,
            { token: state.token, body: matchResultBody(state.match, 2, 0) }
        )

        return record(
            "PUT update-game otra vez 2-0",
            [200],
            status,
            "recargado"
        )
    },

    completeTournament: async () => {
        const { status, body } = await request(
            "PUT",
            `/api/tournaments/${state.tournamentId}/complete`,
            { token: state.token }
        )

        const champion = body?.outcome?.champion?.team?.name
        const finalist = body?.outcome?.finalist?.team?.name

        const ok = record(
            "PUT complete",
            [200],
            status,
            champion
                ? `campeón ${champion}, finalista ${finalist}`
                : errorCode(body)
        )

        if (status === 200 && (!champion || !finalist)) {
            results[results.length - 1].ok = false
            results[results.length - 1].detail += " <- outcome incompleto"
            return false
        }

        return ok
    },

    completeAgainConflict: async () => {
        const { status, body } = await request(
            "PUT",
            `/api/tournaments/${state.tournamentId}/complete`,
            { token: state.token }
        )

        return record("PUT complete de nuevo", [409], status, errorCode(body))
    },

    createPlayoffTournament: async () => {
        // 16 llaves de primera ronda, dos equipos por llave, como manda el FE.
        const teams = Array.from({ length: 32 }, (_, index) => ({
            team: { id: `smoke-${index + 1}`, name: `Equipo ${index + 1}` },
            player: state.players[index % state.players.length],
            playoff_id: Math.floor(index / 2) + 1,
        }))

        const { status, body } = await request("POST", "/api/tournaments", {
            token: state.token,
            body: {
                format: "playoff",
                name: `Smoke playoff ${new Date().toISOString().slice(0, 19)}`,
                players: state.players,
                teams,
            },
        })

        state.playoffTournamentId = body?._id || body?.id || null

        return record(
            "POST /api/tournaments (playoff, transaccional)",
            [200, 201],
            status,
            state.playoffTournamentId
                ? `id=${state.playoffTournamentId}`
                : errorCode(body)
        )
    },

    readPlayoffBracket: async () => {
        if (!state.playoffTournamentId) {
            return record("GET playoff/matches", [200], 0, "sin torneo previo")
        }

        const { status, body } = await request(
            "GET",
            `/api/tournaments/${state.playoffTournamentId}/playoff/matches`
        )

        const matches = body?.matches || []
        const ok = record(
            "GET playoff/matches del bracket creado",
            [200],
            status,
            `${matches.length} partidos generados`
        )

        if (status === 200 && matches.length === 0) {
            results[results.length - 1].ok = false
            results[results.length - 1].detail += " <- esperaba un bracket"
            return false
        }

        return ok
    },
}

const run = async () => {
    console.log(`Smoke de escritura contra ${baseUrl}`)

    const health = await request("GET", "/health/ready")
    const database = health.body?.checks?.database

    console.log(`  environment: ${health.body?.environment}`)
    console.log(`  base:        ${database}`)

    if (health.status !== 200) {
        console.error("abortado: el target no está listo")
        process.exitCode = 1
        return
    }

    if (!isTestDatabaseName(database)) {
        console.error(
            `abortado: "${database}" no pasa el allowlist de bases de prueba. No se escribió nada.`
        )
        process.exitCode = 1
        return
    }

    const requested = process.env.SMOKE_WRITE_STEPS?.trim()
    const selected = requested
        ? requested.split(",").map((step) => step.trim())
        : DEFAULT_STEPS

    for (const name of selected) {
        if (!steps[name]) {
            console.error(`paso desconocido: ${name}`)
            process.exitCode = 1
            return
        }

        const continued = await steps[name]()

        if (!continued) {
            console.error(`\nse corta la cadena en "${name}"`)
            break
        }
    }

    console.log("=".repeat(104))
    for (const r of results) {
        console.log(
            `${r.ok ? "ok  " : "FALLA"} ${String(r.actual).padEnd(
                3
            )} esperado:${r.expected.padEnd(7)} ${r.label.padEnd(44)} ${
                r.detail
            }`
        )
    }
    console.log("=".repeat(104))

    const failures = results.filter((r) => !r.ok)
    console.log(
        `pasos: ${results.length}   ok: ${
            results.length - failures.length
        }   fallas: ${failures.length}`
    )

    if (failures.length) process.exitCode = 1
}

run().catch((error) => {
    console.error("el smoke de escritura no pudo completarse:", error.message)
    process.exitCode = 1
})

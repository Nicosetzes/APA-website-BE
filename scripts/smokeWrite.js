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
 * CLOUDINARY_EDITS_FOLDER apuntando a otra carpeta en ese entorno:
 *
 *   $env:SMOKE_WRITE_STEPS="login,uploadEdit,readEdits,deleteEdit,confirmEditDeleted"
 *
 * Además de pedirlos, `uploadEdit` mira la carpeta real del `public_id` que
 * devuelve el deployment: si subió a la carpeta por defecto de producción borra
 * el asset y falla. Y si la cadena se corta con un edit ya subido, el runner
 * intenta borrarlo antes de terminar.
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
    "createPlayinTournament",
    "generatePlayinGroupA",
    "generatePlayinGroupB",
    "readPlayinFirstRound",
    "playPlayinFirstRound",
    "playinUpdateSecondRound",
    "playinUpdateAlreadyGenerated",
    "playPlayinSecondRound",
    "playoffUpdateNotReady",
    "generatePlayoffFromPlayin",
    "playoffUpdateWithoutResults",
    "playPlayinPlayoffFirstPair",
    "readPlayinPlayoffProgression",
    "playoffUpdateIdempotent",
]

// Diez equipos por grupo: el play-in cruza las posiciones 7 a 10 de cada zona.
const PLAYIN_GROUP_SIZE = 10

// PNG 1x1 mínimo, suficiente para el filtro de MIME y el upload real.
const TINY_PNG_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

// Carpeta por defecto de Cloudinary: si el deployment sube ahí, está mezclando
// los edits del smoke con los de producción.
const PRODUCTION_EDITS_FOLDER = "edits"

const state = {
    token: null,
    players: [],
    tournamentId: null,
    match: null,
    playoffTournamentId: null,
    playinTournamentId: null,
    playinMatches: [],
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

// Los usuarios sembrados alcanzan para cualquier torneo del smoke. Se resuelven
// una sola vez para que los pasos de play-in puedan correr aislados.
const resolveSeededPlayers = async () => {
    if (state.players.length) return state.players

    const { body: users } = await request("GET", "/api/users")
    const seeded = TEST_USERS.filter((u) => u.role === "user").map((user) => {
        const match = (users || []).find((u) => u.name === user.nickname)
        return match ? { id: match.id, name: match.name } : null
    })

    if (seeded.some((player) => !player)) return null

    state.players = seeded
    return state.players
}

const buildGroupTeams = (group) =>
    Array.from({ length: PLAYIN_GROUP_SIZE }, (_, index) => ({
        team: {
            id: `smoke-playin-${group.toLowerCase()}-${index + 1}`,
            name: `Equipo ${group}${index + 1}`,
        },
        player: state.players[index % state.players.length],
        group,
    }))

const readPlayinMatches = async () => {
    const { status, body } = await request(
        "GET",
        `/api/tournaments/${state.playinTournamentId}/playin/matches`
    )

    return { status, matches: body?.matches || [] }
}

// Carga 2-0 en cada llave: sin empate no hace falta definir penales.
const playKnockoutMatches = async (tournamentId, matches) => {
    const statuses = []

    for (const match of matches) {
        const { status } = await request(
            "PUT",
            `/api/tournaments/${tournamentId}/matches/update-game/${match._id}`,
            { token: state.token, body: matchResultBody(match, 2, 0) }
        )
        statuses.push(status)
    }

    return statuses
}

const deleteEditById = (id) =>
    request("DELETE", `/api/edits/${id}`, { token: state.token })

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

    createPlayinTournament: async () => {
        const players = await resolveSeededPlayers()

        if (!players) {
            return record(
                "POST /api/tournaments (league_playin_playoff)",
                [200],
                0,
                "faltan usuarios sembrados: corré npm run seed:test"
            )
        }

        const teams = [...buildGroupTeams("A"), ...buildGroupTeams("B")]

        const { status, body } = await request("POST", "/api/tournaments", {
            token: state.token,
            body: {
                format: "league_playin_playoff",
                name: `Smoke playin ${new Date().toISOString().slice(0, 19)}`,
                players,
                teams,
            },
        })

        state.playinTournamentId = body?._id || body?.id || null
        const groups = body?.groups || []

        const ok = record(
            "POST /api/tournaments (league_playin_playoff)",
            [200, 201],
            status,
            state.playinTournamentId
                ? `id=${state.playinTournamentId} zonas=${
                      groups.join("") || "?"
                  } equipos=${body?.teams?.length}`
                : errorCode(body)
        )

        // El backend deriva las zonas de teams[].group: sin A y B no hay play-in.
        if (state.playinTournamentId && groups.join("") !== "AB") {
            results[results.length - 1].ok = false
            results[results.length - 1].detail += " <- esperaba zonas A y B"
            return false
        }

        return ok
    },

    generatePlayinGroupA: async () => {
        const { status, body } = await request(
            "POST",
            `/api/tournaments/${state.playinTournamentId}/playin`,
            { token: state.token, body: { group: "A" } }
        )

        return record(
            "POST playin zona A",
            [200],
            status,
            Array.isArray(body)
                ? `${body.length} partidos creados`
                : errorCode(body)
        )
    },

    generatePlayinGroupB: async () => {
        const { status, body } = await request(
            "POST",
            `/api/tournaments/${state.playinTournamentId}/playin`,
            { token: state.token, body: { group: "B" } }
        )

        return record(
            "POST playin zona B",
            [200],
            status,
            Array.isArray(body)
                ? `${body.length} partidos creados`
                : errorCode(body)
        )
    },

    readPlayinFirstRound: async () => {
        const { status, matches } = await readPlayinMatches()
        const firstRound = matches
            .filter((match) => [1, 2, 3, 4].includes(Number(match.playoff_id)))
            .sort((left, right) => left.playoff_id - right.playoff_id)

        state.playinMatches = firstRound

        const seeds = firstRound
            .map((match) => `${match.seedP1}v${match.seedP2}`)
            .join(" ")

        const ok = record(
            "GET playin/matches primera ronda",
            [200],
            status,
            firstRound.length === 4
                ? `4 llaves: ${seeds}`
                : `esperaba 4 llaves y hay ${firstRound.length}`
        )

        if (status === 200 && firstRound.length !== 4) {
            results[results.length - 1].ok = false
            return false
        }

        return ok
    },

    playPlayinFirstRound: async () => {
        const statuses = await playKnockoutMatches(
            state.playinTournamentId,
            state.playinMatches
        )
        const loaded = statuses.filter((status) => status === 200).length

        const ok = record(
            "PUT resultados play-in ronda 1",
            [200],
            statuses.every((status) => status === 200) ? 200 : statuses[0] || 0,
            `${loaded}/${statuses.length} llaves cargadas 2-0`
        )

        if (loaded !== statuses.length) {
            results[results.length - 1].ok = false
            return false
        }

        return ok
    },

    playinUpdateSecondRound: async () => {
        const { status, body } = await request(
            "POST",
            `/api/tournaments/${state.playinTournamentId}/playin/update`,
            { token: state.token, body: { round: 2 } }
        )

        const created = Array.isArray(body) ? body : []
        const ids = created
            .map((match) => Number(match.playoff_id))
            .sort((left, right) => left - right)

        const ok = record(
            "POST playin/update ronda 2",
            [200],
            status,
            created.length
                ? `generó ${created.length} llaves (${ids.join(",")})`
                : errorCode(body)
        )

        if (status === 200 && ids.join(",") !== "5,6") {
            results[results.length - 1].ok = false
            results[results.length - 1].detail +=
                " <- esperaba las llaves 5 y 6"
            return false
        }

        return ok
    },

    playinUpdateAlreadyGenerated: async () => {
        const { status, body } = await request(
            "POST",
            `/api/tournaments/${state.playinTournamentId}/playin/update`,
            { token: state.token, body: { round: 2 } }
        )

        return record(
            "POST playin/update de nuevo",
            [409],
            status,
            errorCode(body)
        )
    },

    playPlayinSecondRound: async () => {
        const { matches } = await readPlayinMatches()
        const secondRound = matches
            .filter((match) => [5, 6].includes(Number(match.playoff_id)))
            .sort((left, right) => left.playoff_id - right.playoff_id)

        if (secondRound.length !== 2) {
            return record(
                "PUT resultados play-in ronda 2",
                [200],
                0,
                `esperaba 2 llaves y hay ${secondRound.length}`
            )
        }

        const statuses = await playKnockoutMatches(
            state.playinTournamentId,
            secondRound
        )
        const loaded = statuses.filter((status) => status === 200).length

        const ok = record(
            "PUT resultados play-in ronda 2",
            [200],
            statuses.every((status) => status === 200) ? 200 : statuses[0] || 0,
            `${loaded}/2 llaves cargadas 2-0`
        )

        if (loaded !== 2) {
            results[results.length - 1].ok = false
            return false
        }

        return ok
    },

    playoffUpdateNotReady: async () => {
        // Todavía no existe bracket: el update manual tiene que rechazarlo.
        const { status, body } = await request(
            "POST",
            `/api/tournaments/${state.playinTournamentId}/playoff/update`,
            { token: state.token, body: {} }
        )

        return record(
            "POST playoff/update sin bracket",
            [409],
            status,
            errorCode(body)
        )
    },

    generatePlayoffFromPlayin: async () => {
        const { status, body } = await request(
            "POST",
            `/api/tournaments/${state.playinTournamentId}/playoff`,
            { token: state.token, body: {} }
        )

        const created = Array.isArray(body) ? body : []

        const ok = record(
            "POST playoff con play-in resuelto",
            [200],
            status,
            created.length
                ? `${created.length} llaves de playoff`
                : errorCode(body)
        )

        if (status === 200 && created.length !== 8) {
            results[results.length - 1].ok = false
            results[results.length - 1].detail += " <- esperaba 8 llaves"
            return false
        }

        return ok
    },

    playoffUpdateWithoutResults: async () => {
        const { status, body } = await request(
            "POST",
            `/api/tournaments/${state.playinTournamentId}/playoff/update`,
            { token: state.token, body: {} }
        )

        const matches = body?.matches || []

        const ok = record(
            "POST playoff/update sin resultados",
            [200],
            status,
            `${matches.length} partidos nuevos`
        )

        if (status === 200 && matches.length !== 0) {
            results[results.length - 1].ok = false
            results[results.length - 1].detail +=
                " <- no debería generar nada todavía"
            return false
        }

        return ok
    },

    playPlayinPlayoffFirstPair: async () => {
        const { status, body } = await request(
            "GET",
            `/api/tournaments/${state.playinTournamentId}/playoff/matches`
        )
        const pair = (body?.matches || [])
            .filter((match) => [1, 2].includes(Number(match.playoff_id)))
            .sort((left, right) => left.playoff_id - right.playoff_id)

        if (status !== 200 || pair.length !== 2) {
            return record(
                "PUT resultados playoff llaves 1 y 2",
                [200],
                status,
                `esperaba 2 llaves y hay ${pair.length}`
            )
        }

        const statuses = await playKnockoutMatches(
            state.playinTournamentId,
            pair
        )
        const loaded = statuses.filter((code) => code === 200).length

        const ok = record(
            "PUT resultados playoff llaves 1 y 2",
            [200],
            statuses.every((code) => code === 200) ? 200 : statuses[0] || 0,
            `${loaded}/2 llaves cargadas 2-0`
        )

        if (loaded !== 2) {
            results[results.length - 1].ok = false
            return false
        }

        return ok
    },

    readPlayinPlayoffProgression: async () => {
        // Cargar un resultado de playoff ya avanza el bracket dentro de la
        // misma transacción: acá se verifica ese efecto, no el update manual.
        const { status, body } = await request(
            "GET",
            `/api/tournaments/${state.playinTournamentId}/playoff/matches`
        )
        const next = (body?.matches || []).find(
            (match) => Number(match.playoff_id) === 9
        )
        const filled = Boolean(next?.teamP1?.id && next?.teamP2?.id)

        const ok = record(
            "GET playoff/matches tras los resultados",
            [200],
            status,
            filled
                ? `llave 9 con ${next.teamP1.name} y ${next.teamP2.name}`
                : "la llave 9 no quedó completa"
        )

        if (status === 200 && !filled) {
            results[results.length - 1].ok = false
            return false
        }

        return ok
    },

    playoffUpdateIdempotent: async () => {
        const { status, body } = await request(
            "POST",
            `/api/tournaments/${state.playinTournamentId}/playoff/update`,
            { token: state.token, body: {} }
        )

        const matches = body?.matches || []

        const ok = record(
            "POST playoff/update idempotente",
            [200],
            status,
            `${matches.length} partidos nuevos`
        )

        if (status === 200 && matches.length !== 0) {
            results[results.length - 1].ok = false
            results[results.length - 1].detail +=
                " <- el avance automático ya había creado la llave"
            return false
        }

        return ok
    },

    uploadEdit: async () => {
        const form = new globalThis.FormData()
        form.append(
            "image",
            new globalThis.Blob([Buffer.from(TINY_PNG_BASE64, "base64")], {
                type: "image/png",
            }),
            "smoke-edit.png"
        )

        const { status, body } = await request("POST", "/api/edits", {
            token: state.token,
            body: form,
            raw: true,
        })

        const edit = body?.data?.[0] || null
        state.editId = edit?._id || edit?.id || null
        const publicId = edit?.public_id || ""
        const folder = publicId.includes("/") ? publicId.split("/")[0] : ""

        const ok = record(
            "POST /api/edits",
            [200],
            status,
            state.editId
                ? `id=${state.editId} carpeta=${folder || "(raíz)"}`
                : errorCode(body)
        )

        // Cloudinary es una cuenta compartida: si el deployment no tiene
        // CLOUDINARY_EDITS_FOLDER propio, limpio y corto acá.
        if (state.editId && folder === PRODUCTION_EDITS_FOLDER) {
            const cleanup = await deleteEditById(state.editId)
            state.editId = cleanup.status === 200 ? null : state.editId
            results[results.length - 1].ok = false
            results[
                results.length - 1
            ].detail += ` <- subió a la carpeta de producción; ${
                cleanup.status === 200 ? "borrado" : "NO se pudo borrar"
            }`
            return false
        }

        if (status === 200 && !state.editId) {
            results[results.length - 1].ok = false
            return false
        }

        return ok
    },

    readEdits: async () => {
        const { status, body } = await request("GET", "/api/edits?page=1", {
            token: state.token,
        })

        const found = (body?.data || []).some(
            (edit) => String(edit?._id) === String(state.editId)
        )

        const ok = record(
            "GET /api/edits",
            [200],
            status,
            found
                ? `el edit aparece entre ${body?.pagination?.totalEdits} registros`
                : "el edit subido no aparece en la primera página"
        )

        if (status === 200 && !found) {
            results[results.length - 1].ok = false
            return false
        }

        return ok
    },

    deleteEdit: async () => {
        const { status, body } = await deleteEditById(state.editId)

        const ok = record(
            "DELETE /api/edits/:id",
            [200],
            status,
            body?.success ? `borrado ${body?.deletedId}` : errorCode(body)
        )

        if (status === 200) state.editId = null

        return ok
    },

    confirmEditDeleted: async () => {
        const { status, body } = await request("GET", "/api/edits?page=1", {
            token: state.token,
        })

        const stillThere = (body?.data || []).some(
            (edit) => String(edit?._id) === String(state.editId)
        )

        return record(
            "GET /api/edits sin el edit borrado",
            [200],
            status,
            stillThere
                ? "el edit sigue apareciendo"
                : `quedan ${body?.pagination?.totalEdits} registros`
        )
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

    // Si quedó un edit subido, se borra igual: el asset vive en una cuenta de
    // Cloudinary compartida con producción.
    if (state.editId) {
        const cleanup = await deleteEditById(state.editId)
        console.error(
            cleanup.status === 200
                ? `limpieza: se borró el edit ${state.editId}`
                : `limpieza fallida: borrá a mano el edit ${state.editId}`
        )
        if (cleanup.status !== 200) process.exitCode = 1
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

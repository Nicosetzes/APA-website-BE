process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const { once } = require("node:events")
const test = require("node:test")

const { createApp } = require("../app")
const {
    DEFAULT_PENDING_LIMIT,
    MAX_PENDING_LIMIT,
    buildViewPath,
} = require("../config/assistant")
const { buildPendingFilter } = require("../dao/findPendingMatchesForAssistant")
const matchesModel = require("../dao/models/matches")
const tournamentsModel = require("../dao/models/tournaments")
const usersModel = require("../dao/models/users")
const { RECAP_SECRET_HEADER } = require("../middleware/requireRecapSecret")
const retrieveAssistantPendingMatches = require("../service/retrieveAssistantPendingMatches")
const {
    buildPendingMatchesResponse,
    clampLimit,
} = require("../service/retrieveAssistantPendingMatches")
const requestSchemas = require("../validation/requestSchemas")

const SECRET = "test-recap-secret"
const NOW = new Date("2026-10-26T12:00:00.000Z")
const LEAGUE_ID = "aaaaaaaaaaaaaaaaaaaaaaaa"
const CUP_ID = "bbbbbbbbbbbbbbbbbbbbbbbb"
const CLOSED_ID = "cccccccccccccccccccccccc"

const NICO = { id: "u-nico", name: "Nico" }
const MAX = { id: "u-max", name: "Max" }
const LEO = { id: "u-leo", name: "Leo" }
const SANTI = { id: "u-santi", name: "Santi" }

const users = [NICO, MAX, LEO, SANTI].map(({ id, name }) => ({
    id,
    nickname: name,
}))

const league = {
    _id: LEAGUE_ID,
    name: "Liga APA",
    format: "league_playin_playoff",
    ongoing: true,
}
const cup = {
    _id: CUP_ID,
    name: "Copa APA",
    format: "playoff",
    playoffMode: "single",
    ongoing: true,
}
const closed = {
    _id: CLOSED_ID,
    name: "Torneo viejo",
    format: "league",
    ongoing: false,
}

let sequence = 0

const mkMatch = ({
    tournament = league,
    type = "regular",
    p1,
    p2,
    group,
    playoff_id: playoffId,
    leg,
    id,
    team1,
    team2,
} = {}) => {
    sequence += 1
    const matchId = id ?? `${String(sequence).padStart(24, "0")}`.slice(-24)

    return {
        _id: matchId,
        tournament: { id: String(tournament._id), name: tournament.name },
        type,
        ...(group === undefined ? {} : { group }),
        ...(playoffId === undefined ? {} : { playoff_id: playoffId }),
        ...(leg === undefined ? {} : { leg }),
        playerP1: p1 ? { id: p1.id, name: p1.name } : null,
        teamP1: p1 ? { id: 1, name: team1 ?? `Equipo de ${p1.name}` } : null,
        playerP2: p2 ? { id: p2.id, name: p2.name } : null,
        teamP2: p2 ? { id: 2, name: team2 ?? `Equipo de ${p2.name}` } : null,
    }
}

const build = (overrides = {}) =>
    buildPendingMatchesResponse({
        tournaments: [league, cup],
        matches: [],
        scope: "involving",
        playerIds: [],
        limit: DEFAULT_PENDING_LIMIT,
        now: NOW,
        ...overrides,
    })

// ---------------------------------------------------------------------------
// Armado de la respuesta
// ---------------------------------------------------------------------------

test("involving counts every playable match of the player across tournaments", () => {
    const matches = [
        mkMatch({ p1: NICO, p2: MAX, group: "A" }),
        mkMatch({ p1: LEO, p2: NICO, group: "A" }),
        mkMatch({ p1: MAX, p2: LEO, group: "A" }),
        mkMatch({
            tournament: cup,
            type: "playoff",
            playoff_id: 17,
            p1: NICO,
            p2: SANTI,
        }),
    ]

    const response = build({ matches, playerIds: [NICO.id] })

    assert.equal(response.totalPending, 3)
    assert.deepEqual(response.byStage, { regular: 2, playin: 0, playoff: 1 })
    assert.deepEqual(
        response.byTournament.map(({ name, pending }) => [name, pending]),
        [
            ["Liga APA", 2],
            ["Copa APA", 1],
        ]
    )
    assert.equal(response.truncated, false)
    assert.equal(response.remaining, 0)
    assert.equal(response.asOf, NOW.toISOString())
})

test("players with a different number of teams in a tournament are counted by match, not by team", () => {
    // Nico juega con 2 equipos; Max y Leo con 1 cada uno.
    const matches = [
        mkMatch({ p1: NICO, p2: MAX, team1: "Nico 1", team2: "Max 1" }),
        mkMatch({ p1: NICO, p2: MAX, team1: "Nico 2", team2: "Max 1" }),
        mkMatch({ p1: NICO, p2: LEO, team1: "Nico 1", team2: "Leo 1" }),
        mkMatch({ p1: LEO, p2: NICO, team1: "Leo 1", team2: "Nico 2" }),
        mkMatch({ p1: MAX, p2: LEO, team1: "Max 1", team2: "Leo 1" }),
    ]

    const involving = build({ matches, playerIds: [NICO.id] })
    const amongMaxLeo = build({
        matches,
        scope: "among",
        playerIds: [MAX.id, LEO.id],
    })
    const amongNicoMax = build({
        matches,
        scope: "among",
        playerIds: [NICO.id, MAX.id],
    })

    assert.equal(involving.totalPending, 4)
    assert.equal(involving.excluded.sameOwnerTies, 0)
    assert.equal(amongMaxLeo.totalPending, 1)
    assert.equal(amongNicoMax.totalPending, 2)
})

test("involving without players lists the pending matches of everybody", () => {
    const matches = [
        mkMatch({ p1: NICO, p2: MAX }),
        mkMatch({ p1: LEO, p2: SANTI }),
    ]

    assert.equal(build({ matches }).totalPending, 2)
})

test("among keeps only the matches played between the given players", () => {
    const matches = [
        mkMatch({ p1: NICO, p2: MAX }),
        mkMatch({ p1: NICO, p2: LEO }),
        mkMatch({ p1: MAX, p2: LEO }),
        mkMatch({ p1: NICO, p2: SANTI }),
        mkMatch({ p1: SANTI, p2: LEO }),
    ]

    const response = build({
        matches,
        scope: "among",
        playerIds: [NICO.id, MAX.id, LEO.id],
    })

    const pairs = response.matches
        .map(({ p1, p2 }) => [p1.name, p2.name].sort().join("-"))
        .sort()

    assert.equal(response.totalPending, 3)
    assert.deepEqual(pairs, ["Leo-Max", "Leo-Nico", "Max-Nico"])
})

test("among never reports awaiting-opponent ties", () => {
    const matches = [
        mkMatch({
            tournament: cup,
            type: "playoff",
            playoff_id: 25,
            p1: NICO,
            p2: null,
        }),
    ]

    const response = build({
        matches,
        scope: "among",
        playerIds: [NICO.id, MAX.id],
    })

    assert.equal(response.totalPending, 0)
    assert.equal(response.awaitingOpponent.count, 0)
})

test("playoff ties with one side assigned are reported apart and are not playable", () => {
    const matches = [
        mkMatch({
            tournament: cup,
            type: "playoff",
            playoff_id: 25,
            p1: NICO,
            p2: null,
        }),
        mkMatch({
            tournament: cup,
            type: "playoff",
            playoff_id: 26,
            p1: null,
            p2: MAX,
        }),
        // Ninguno asignado: no es de nadie, no se informa.
        mkMatch({
            tournament: cup,
            type: "playoff",
            playoff_id: 29,
            p1: null,
            p2: null,
        }),
    ]

    const response = build({ matches, playerIds: [NICO.id] })

    assert.equal(response.totalPending, 0)
    assert.equal(response.awaitingOpponent.count, 1)
    assert.deepEqual(response.awaitingOpponent.matches[0].player, {
        id: NICO.id,
        name: "Nico",
        team: "Equipo de Nico",
    })
    assert.equal(response.awaitingOpponent.matches[0].round, "quarterfinal")
    assert.equal(response.byTournament[0].awaitingOpponent, 1)
    assert.equal(response.byTournament[0].pending, 0)
})

test("awaiting-opponent details are capped but the count is complete", () => {
    const matches = Array.from({ length: 8 }, (_, index) =>
        mkMatch({
            tournament: cup,
            type: "playoff",
            playoff_id: index + 1,
            p1: NICO,
            p2: null,
        })
    )

    const { awaitingOpponent } = build({ matches, playerIds: [NICO.id] })

    assert.equal(awaitingOpponent.count, 8)
    assert.equal(awaitingOpponent.matches.length, 5)
})

test("a tie between two teams of the same player is excluded and counted", () => {
    const matches = [
        mkMatch({
            tournament: cup,
            type: "playoff",
            playoff_id: 31,
            p1: NICO,
            p2: NICO,
        }),
        mkMatch({ p1: NICO, p2: MAX }),
    ]

    const response = build({ matches, playerIds: [NICO.id] })

    assert.equal(response.totalPending, 1)
    assert.equal(response.excluded.sameOwnerTies, 1)
})

test("a same-player tie does not count for among with one player", () => {
    const matches = [mkMatch({ p1: NICO, p2: NICO })]

    const response = build({
        matches,
        scope: "among",
        playerIds: [NICO.id],
    })

    assert.equal(response.totalPending, 0)
})

test("matches of tournaments that are not in the list are ignored", () => {
    const stray = mkMatch({ tournament: closed, p1: NICO, p2: MAX })

    assert.equal(build({ matches: [stray] }).totalPending, 0)
})

test("more pending matches than the limit are counted but only `limit` are detailed", () => {
    const matches = Array.from({ length: 25 }, () =>
        mkMatch({ p1: NICO, p2: MAX, group: "A" })
    )

    const response = build({
        matches,
        playerIds: [NICO.id],
        limit: DEFAULT_PENDING_LIMIT,
    })

    assert.equal(response.totalPending, 25)
    assert.equal(response.returned, 10)
    assert.equal(response.matches.length, 10)
    assert.equal(response.remaining, 15)
    assert.equal(response.truncated, true)
    assert.equal(response.byTournament[0].pending, 25)
})

test("matches are ordered by tournament, stage and the fixture order of the FE", () => {
    const matches = [
        mkMatch({
            tournament: cup,
            type: "playoff",
            playoff_id: 18,
            p1: NICO,
            p2: MAX,
        }),
        mkMatch({
            tournament: cup,
            type: "playoff",
            playoff_id: 17,
            leg: 2,
            p1: NICO,
            p2: LEO,
        }),
        mkMatch({
            tournament: cup,
            type: "playoff",
            playoff_id: 17,
            leg: 1,
            p1: LEO,
            p2: NICO,
        }),
        mkMatch({
            type: "playoff",
            playoff_id: 5,
            p1: NICO,
            p2: SANTI,
        }),
        mkMatch({ type: "playin", playoff_id: 1, p1: NICO, p2: MAX }),
        mkMatch({
            id: "000000000000000000000001",
            group: "B",
            p1: NICO,
            p2: MAX,
        }),
        mkMatch({
            id: "000000000000000000000002",
            group: "A",
            p1: NICO,
            p2: LEO,
        }),
        mkMatch({
            id: "000000000000000000000003",
            group: "A",
            p1: NICO,
            p2: SANTI,
        }),
    ]

    const response = build({
        matches,
        playerIds: [NICO.id],
        limit: MAX_PENDING_LIMIT,
    })

    assert.deepEqual(
        response.matches.map(({ tournament, stage, group, playoffId, leg }) =>
            [tournament, stage, group, playoffId, leg].join("|")
        ),
        [
            // Liga: regular (zona A, _id descendente), play-in, playoff.
            // Los campos ausentes se unen como vacío.
            "Liga APA|regular|A||",
            "Liga APA|regular|A||",
            "Liga APA|regular|B||",
            "Liga APA|playin||1|",
            "Liga APA|playoff||5|",
            // Copa: por llave y pata.
            "Copa APA|playoff||17|1",
            "Copa APA|playoff||17|2",
            "Copa APA|playoff||18|",
        ]
    )
    assert.deepEqual(
        response.matches.slice(0, 2).map(({ p2 }) => p2.name),
        ["Santi", "Leo"]
    )
})

test("each match and tournament carries the view path of its stage", () => {
    const matches = [
        mkMatch({ p1: NICO, p2: MAX }),
        mkMatch({ type: "playin", playoff_id: 1, p1: NICO, p2: LEO }),
        mkMatch({ type: "playoff", playoff_id: 5, p1: NICO, p2: SANTI }),
    ]

    const response = build({ matches, playerIds: [NICO.id] })

    assert.deepEqual(
        response.matches.map(({ viewPath }) => viewPath),
        [
            `/tournaments/${LEAGUE_ID}/fixture`,
            `/tournaments/${LEAGUE_ID}/playin`,
            `/tournaments/${LEAGUE_ID}/playoffs`,
        ]
    )
    assert.deepEqual(response.byTournament[0].viewPaths, {
        regular: `/tournaments/${LEAGUE_ID}/fixture`,
        playin: `/tournaments/${LEAGUE_ID}/playin`,
        playoff: `/tournaments/${LEAGUE_ID}/playoffs`,
    })
})

test("the view paths match the routes of the frontend", () => {
    assert.equal(buildViewPath("abc", "regular"), "/tournaments/abc/fixture")
    assert.equal(buildViewPath("abc", "playin"), "/tournaments/abc/playin")
    assert.equal(buildViewPath("abc", "playoff"), "/tournaments/abc/playoffs")
    assert.equal(buildViewPath("abc", "otra"), "/tournaments/abc")
})

test("playoff matches report their round from the tournament format", () => {
    const matches = [
        mkMatch({
            tournament: cup,
            type: "playoff",
            playoff_id: 17,
            p1: NICO,
            p2: MAX,
        }),
        mkMatch({
            type: "playoff",
            playoff_id: 9,
            p1: NICO,
            p2: LEO,
        }),
    ]

    const response = build({ matches, playerIds: [NICO.id] })
    const rounds = Object.fromEntries(
        response.matches.map(({ tournament, round }) => [tournament, round])
    )

    assert.equal(rounds["Copa APA"], "round_of_16")
    assert.equal(rounds["Liga APA"], "quarterfinal")
})

test("the detailed matches are compact: no null fields", () => {
    const [item] = build({
        matches: [mkMatch({ p1: NICO, p2: MAX })],
        playerIds: [NICO.id],
    }).matches

    assert.deepEqual(Object.keys(item).sort(), [
        "matchId",
        "p1",
        "p2",
        "stage",
        "tournament",
        "tournamentId",
        "viewPath",
    ])
})

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------

const runService = (filters, overrides = {}) => {
    const reads = { tournaments: [], matches: [] }
    const dependencies = {
        findAllUsers: async () => users,
        findTournamentsForAssistant: async (query) => {
            reads.tournaments.push(query)
            return overrides.tournaments ?? [league, cup]
        },
        findPendingMatchesForAssistant: async (query) => {
            reads.matches.push(query)
            return overrides.matches ?? []
        },
        now: () => NOW,
    }

    return retrieveAssistantPendingMatches(filters, dependencies).then(
        (result) => ({ result, reads })
    )
}

test("the service resolves the player names and queries only known players", async () => {
    const { result, reads } = await runService({
        players: [NICO.id, "u-fantasma"],
        scope: "involving",
    })

    assert.deepEqual(result.filters.players, [{ id: NICO.id, name: "Nico" }])
    assert.deepEqual(result.filters.unknownPlayers, ["u-fantasma"])
    assert.deepEqual(reads.matches[0].playerIds, [NICO.id])
    assert.ok(result.notes.some((note) => note.includes("u-fantasma")))
})

test("the service answers empty, without reading matches, when no requested player exists", async () => {
    const { result, reads } = await runService({
        players: ["u-fantasma"],
        scope: "involving",
    })

    assert.equal(result.totalPending, 0)
    assert.equal(reads.matches.length, 0)
    assert.deepEqual(result.matches, [])
})

test("among with fewer than two existing players answers empty with a note", async () => {
    const { result, reads } = await runService({
        players: [NICO.id],
        scope: "among",
    })

    assert.equal(result.totalPending, 0)
    assert.equal(reads.matches.length, 0)
    assert.ok(result.notes.some((note) => note.includes("scope=among")))
})

test("a player without pending matches gets an empty, successful answer", async () => {
    const { result } = await runService({
        players: [NICO.id],
        scope: "involving",
    })

    assert.equal(result.totalPending, 0)
    assert.equal(result.truncated, false)
    assert.deepEqual(result.byTournament, [])
    assert.deepEqual(result.notes, [])
})

test("the service says so when there are no active tournaments", async () => {
    const { result, reads } = await runService(
        { players: [NICO.id] },
        { tournaments: [] }
    )

    assert.equal(result.totalPending, 0)
    assert.equal(reads.matches.length, 0)
    assert.deepEqual(result.notes, ["No hay torneos activos."])
})

test("a closed tournament answers empty and flagged as inactive, without reading matches", async () => {
    const { result, reads } = await runService(
        { tournamentId: CLOSED_ID, players: [NICO.id] },
        { tournaments: [closed] }
    )

    assert.equal(result.totalPending, 0)
    assert.deepEqual(result.filters.tournament, {
        id: CLOSED_ID,
        name: "Torneo viejo",
        active: false,
    })
    assert.equal(reads.matches.length, 0)
    assert.ok(result.notes[0].includes("ya no está activo"))
})

test("an unknown tournament id is a 404", async () => {
    await assert.rejects(
        runService({ tournamentId: CUP_ID }, { tournaments: [] }),
        (error) => error.status === 404 && error.code === "TOURNAMENT_NOT_FOUND"
    )
})

test("an active tournament filter reads only that tournament", async () => {
    const { result, reads } = await runService(
        { tournamentId: CUP_ID, stage: "playoff" },
        { tournaments: [cup] }
    )

    assert.deepEqual(reads.matches[0].tournamentIds, [CUP_ID])
    assert.equal(reads.matches[0].stage, "playoff")
    assert.deepEqual(result.filters.tournament, {
        id: CUP_ID,
        name: "Copa APA",
        active: true,
    })
    assert.equal(result.filters.stage, "playoff")
})

test("the limit defaults to 10 and is capped at 20", async () => {
    assert.equal(clampLimit(undefined), DEFAULT_PENDING_LIMIT)
    assert.equal(clampLimit("abc"), DEFAULT_PENDING_LIMIT)
    assert.equal(clampLimit(5), 5)
    assert.equal(clampLimit(500), MAX_PENDING_LIMIT)
    assert.equal(clampLimit(0), 1)

    const matches = Array.from({ length: 30 }, () =>
        mkMatch({ p1: NICO, p2: MAX })
    )
    const { result } = await runService({ limit: 500 }, { matches })

    assert.equal(result.filters.limit, MAX_PENDING_LIMIT)
    assert.equal(result.returned, MAX_PENDING_LIMIT)
    assert.equal(result.totalPending, 30)
    assert.equal(result.truncated, true)
    assert.ok(result.notes.some((note) => note.includes("10 partidos más")))
})

// ---------------------------------------------------------------------------
// Consulta a Mongo
// ---------------------------------------------------------------------------

test("involving builds an OR over both sides and among requires both", () => {
    const base = { tournamentIds: [LEAGUE_ID], stage: undefined }

    const involving = buildPendingFilter({
        ...base,
        scope: "involving",
        playerIds: ["a", "b"],
    })
    const among = buildPendingFilter({
        ...base,
        scope: "among",
        playerIds: ["a", "b"],
    })

    assert.deepEqual(involving.$and.slice(0, 3), [
        { "tournament.id": { $in: [LEAGUE_ID] } },
        { played: false },
        { valid: { $ne: false } },
    ])
    assert.deepEqual(involving.$and[3], {
        $or: [
            { "playerP1.id": { $in: ["a", "b"] } },
            { "playerP2.id": { $in: ["a", "b"] } },
        ],
    })
    assert.deepEqual(among.$and[3], {
        "playerP1.id": { $in: ["a", "b"] },
        "playerP2.id": { $in: ["a", "b"] },
    })
})

test("the Mongo filter adds the stage and skips the player condition without players", () => {
    const filter = buildPendingFilter({
        tournamentIds: [LEAGUE_ID],
        stage: "playin",
        playerIds: [],
        scope: "involving",
    })

    assert.deepEqual(filter.$and, [
        { "tournament.id": { $in: [LEAGUE_ID] } },
        { played: false },
        { valid: { $ne: false } },
        { type: "playin" },
    ])
})

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const validateQuery = (query) =>
    requestSchemas.getAssistantPendingMatches.query.validate(query)

test("the schema applies defaults and wraps a single player id", () => {
    const { value, error } = validateQuery({ players: "u-nico" })

    assert.equal(error, undefined)
    assert.deepEqual(value, {
        players: ["u-nico"],
        scope: "involving",
        limit: DEFAULT_PENDING_LIMIT,
    })
})

test("the schema accepts a limit above the maximum (the service caps it)", () => {
    assert.equal(validateQuery({ limit: "500" }).error, undefined)
})

test("the schema rejects bad input", () => {
    const invalid = [
        { scope: "among" },
        { scope: "among", players: [] },
        { scope: "todos" },
        { stage: "final" },
        { tournamentId: "abc" },
        { limit: "0" },
        { limit: "diez" },
        { players: ["a", "a"] },
        { players: ["a", "b", "c", "d", "e", "f", "g"] },
        { players: "" },
        { page: "1" },
    ]

    for (const query of invalid) {
        assert.ok(validateQuery(query).error, JSON.stringify(query))
    }
})

// ---------------------------------------------------------------------------
// Ruta
// ---------------------------------------------------------------------------

const withApp = async (t, callback, options = {}) => {
    const previousSecret = process.env.RECAP_SECRET
    const previousReadModel = process.env.RATING_READ_MODEL
    process.env.RECAP_SECRET = SECRET
    // Sin lectura de ratings persistidos: el test no toca esas colecciones.
    process.env.RATING_READ_MODEL = "off"
    t.after(() => {
        if (previousSecret === undefined) delete process.env.RECAP_SECRET
        else process.env.RECAP_SECRET = previousSecret
        if (previousReadModel === undefined)
            delete process.env.RATING_READ_MODEL
        else process.env.RATING_READ_MODEL = previousReadModel
    })

    const state = {
        tournaments: [league, cup, closed],
        matches: [],
        reads: { tournaments: [], matches: [], users: 0 },
        ...options,
    }

    t.mock.method(tournamentsModel, "find", (filter, projection) => {
        state.reads.tournaments.push([filter, projection])
        const found = state.tournaments.filter((tournament) =>
            filter._id
                ? String(tournament._id) === filter._id
                : tournament.ongoing === true
        )
        return { lean: async () => found }
    })
    t.mock.method(matchesModel, "find", (filter, projection) => {
        state.reads.matches.push([filter, projection])
        return { lean: async () => state.matches }
    })
    t.mock.method(usersModel, "find", async () => {
        state.reads.users += 1
        return users
    })

    const app = createApp({
        ensureDatabase: async () => {},
        getDatabaseStatus: () => ({ state: "connected", name: "apa_test" }),
    })
    const server = app.listen(0)
    await once(server, "listening")

    try {
        const baseUrl = `http://127.0.0.1:${server.address().port}`
        await callback({ baseUrl, state })
    } finally {
        server.close()
        await once(server, "close")
    }
}

const get = (
    baseUrl,
    query = "",
    headers = { [RECAP_SECRET_HEADER]: SECRET }
) =>
    globalThis.fetch(`${baseUrl}/api/assistant/pending-matches${query}`, {
        headers,
    })

test("the route rejects a missing or wrong secret without touching Mongo", async (t) => {
    await withApp(t, async ({ baseUrl, state }) => {
        const missing = await get(baseUrl, "", {})
        const wrong = await get(baseUrl, "", { [RECAP_SECRET_HEADER]: "nope" })

        for (const response of [missing, wrong]) {
            assert.equal(response.status, 401)
            assert.equal(
                (await response.json()).error.code,
                "INVALID_RECAP_SECRET"
            )
        }

        assert.equal(state.reads.tournaments.length, 0)
        assert.equal(state.reads.matches.length, 0)
        assert.equal(state.reads.users, 0)
    })
})

test("the route is closed when the secret is not configured", async (t) => {
    await withApp(t, async ({ baseUrl }) => {
        delete process.env.RECAP_SECRET

        const response = await get(baseUrl)

        assert.equal(response.status, 503)
        assert.equal(
            (await response.json()).error.code,
            "RECAP_SECRET_NOT_CONFIGURED"
        )
    })
})

test("the route validates the query before reading", async (t) => {
    await withApp(t, async ({ baseUrl, state }) => {
        const queries = [
            "?scope=among",
            "?scope=todos",
            "?stage=final",
            "?tournamentId=abc",
            "?limit=0",
            "?players=a&players=a",
            "?page=2",
        ]

        for (const query of queries) {
            const response = await get(baseUrl, query)

            assert.equal(response.status, 400, query)
            assert.equal((await response.json()).error.code, "VALIDATION_ERROR")
        }

        assert.equal(state.reads.tournaments.length, 0)
        assert.equal(state.reads.matches.length, 0)
    })
})

test("GET /api/assistant/pending-matches answers the pending matches of a player", async (t) => {
    await withApp(
        t,
        async ({ baseUrl, state }) => {
            const response = await get(
                baseUrl,
                `?players=${NICO.id}&scope=involving`
            )
            const body = await response.json()

            assert.equal(response.status, 200)
            assert.equal(body.success, true)
            assert.equal(body.data.totalPending, 2)
            assert.deepEqual(body.data.filters.players, [
                { id: NICO.id, name: "Nico" },
            ])
            assert.deepEqual(
                body.data.byTournament.map(({ name }) => name),
                // Sin `startedAt` empatan y gana el `_id` más nuevo, igual
                // que en `GET /api/tournaments?status=active`.
                ["Copa APA", "Liga APA"]
            )

            const [filter, projection] = state.reads.matches[0]

            assert.deepEqual(filter.$and[0], {
                "tournament.id": { $in: [CUP_ID, LEAGUE_ID] },
            })
            assert.ok(projection.includes("playerP1"))
        },
        {
            matches: [
                mkMatch({ p1: NICO, p2: MAX, group: "A" }),
                mkMatch({
                    tournament: cup,
                    type: "playoff",
                    playoff_id: 25,
                    p1: SANTI,
                    p2: NICO,
                }),
            ],
        }
    )
})

test("the route adds the favorite key to every returned match (null when the model has no data)", async (t) => {
    await withApp(
        t,
        async ({ baseUrl }) => {
            const response = await get(baseUrl, `?players=${NICO.id}`)
            const body = await response.json()
            assert.equal(response.status, 200)
            assert.equal(body.data.matches.length, 2)
            for (const match of body.data.matches) {
                assert.ok(Object.hasOwn(match, "favorite"))
                // Con estos mocks el historial no alcanza para calcular.
                assert.equal(match.favorite, null)
            }
        },
        {
            matches: [
                mkMatch({ p1: NICO, p2: MAX, group: "A" }),
                mkMatch({
                    tournament: cup,
                    type: "playoff",
                    playoff_id: 25,
                    p1: SANTI,
                    p2: NICO,
                }),
            ],
        }
    )
})
test("the route answers a closed tournament as empty and an unknown one as 404", async (t) => {
    await withApp(t, async ({ baseUrl, state }) => {
        const closedResponse = await get(baseUrl, `?tournamentId=${CLOSED_ID}`)
        const closedBody = await closedResponse.json()

        assert.equal(closedResponse.status, 200)
        assert.equal(closedBody.data.totalPending, 0)
        assert.equal(closedBody.data.filters.tournament.active, false)
        assert.equal(state.reads.matches.length, 0)

        const missing = await get(
            baseUrl,
            "?tournamentId=dddddddddddddddddddddddd"
        )

        assert.equal(missing.status, 404)
        assert.equal((await missing.json()).error.code, "TOURNAMENT_NOT_FOUND")
    })
})

process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const { once } = require("node:events")
const test = require("node:test")

const { createApp } = require("../app")
const {
    DEFAULT_HEAD_TO_HEAD_LIMIT,
    MAX_HEAD_TO_HEAD_LIMIT,
    buildHeadToHeadViewPath,
} = require("../config/assistant")
const {
    buildHeadToHeadFilter,
} = require("../dao/findHeadToHeadMatchesForAssistant")
const matchesModel = require("../dao/models/matches")
const tournamentsModel = require("../dao/models/tournaments")
const usersModel = require("../dao/models/users")
const { RECAP_SECRET_HEADER } = require("../middleware/requireRecapSecret")
const {
    createGetAssistantHeadToHead,
} = require("../controller/getAssistantHeadToHead")
const retrieveAssistantHeadToHead = require("../service/retrieveAssistantHeadToHead")
const { clampLimit, formatPlayedOn } = retrieveAssistantHeadToHead
const requestSchemas = require("../validation/requestSchemas")

const SECRET = "test-recap-secret"
const NOW = new Date("2026-10-26T12:00:00.000Z")
const CUP_ID = "bbbbbbbbbbbbbbbbbbbbbbbb"

const NICO = { id: "u-nico", name: "Nico" }
const MAX = { id: "u-max", name: "Max" }

const users = [NICO, MAX, { id: "u-leo", name: "Leo" }].map(({ id, name }) => ({
    id,
    nickname: name,
}))

const cup = { _id: CUP_ID, name: "Copa APA", format: "playoff" }

let sequence = 0

// Partido jugado con Nico de local salvo que se pida lo contrario.
const mkMatch = ({
    nicoGoals,
    maxGoals,
    nicoIsP1 = true,
    playedAt = "2026-10-20T20:00:00.000Z",
    playedAtPrecision = "exact",
    type = "regular",
    playoffId,
    leg,
    valid,
    outcome,
    id,
    tournament = { id: CUP_ID, name: "Copa APA" },
} = {}) => {
    sequence += 1

    const p1 = nicoIsP1 ? NICO : MAX
    const p2 = nicoIsP1 ? MAX : NICO

    return {
        _id: id ?? String(sequence).padStart(24, "0"),
        tournament,
        type,
        ...(playoffId === undefined ? {} : { playoff_id: playoffId }),
        ...(leg === undefined ? {} : { leg }),
        ...(valid === undefined ? {} : { valid }),
        playerP1: { id: p1.id, name: p1.name },
        teamP1: { id: 1, name: `${p1.name} FC` },
        scoreP1: nicoIsP1 ? nicoGoals : maxGoals,
        playerP2: { id: p2.id, name: p2.name },
        teamP2: { id: 2, name: `${p2.name} FC` },
        scoreP2: nicoIsP1 ? maxGoals : nicoGoals,
        ...(playedAt === null ? {} : { playedAt: new Date(playedAt) }),
        ...(playedAtPrecision ? { playedAtPrecision } : {}),
        ...(outcome ? { outcome } : {}),
    }
}

const run = (matches, filters = {}, overrides = {}) =>
    retrieveAssistantHeadToHead(
        { playerA: NICO.id, playerB: MAX.id, ...filters },
        {
            findAllUsers: async () => users,
            findHeadToHeadMatchesForAssistant: async () => matches,
            findTournamentsForAssistant: async () => [cup],
            now: () => NOW,
            ...overrides,
        }
    )

// ---------------------------------------------------------------------------
// Balance
// ---------------------------------------------------------------------------

test("the record counts wins, draws and goals from the point of view of each player", async () => {
    const result = await run([
        mkMatch({ nicoGoals: 3, maxGoals: 1 }),
        mkMatch({ nicoGoals: 0, maxGoals: 2, nicoIsP1: false }),
        mkMatch({ nicoGoals: 2, maxGoals: 2 }),
        mkMatch({ nicoGoals: 4, maxGoals: 0, nicoIsP1: false }),
    ])

    assert.deepEqual(result.players, {
        playerA: { id: NICO.id, name: "Nico" },
        playerB: { id: MAX.id, name: "Max" },
    })
    assert.deepEqual(result.record, {
        matches: 4,
        playerAWins: 2,
        draws: 1,
        playerBWins: 1,
        playerAGoals: 9,
        playerBGoals: 5,
        shootouts: { total: 0, playerAWon: 0, playerBWon: 0 },
    })
    assert.equal(result.asOf, NOW.toISOString())
})

test("a match decided by penalties counts as a draw and is reported as a shootout", async () => {
    const result = await run([
        mkMatch({
            nicoGoals: 1,
            maxGoals: 1,
            type: "playoff",
            playoffId: 31,
            outcome: {
                draw: true,
                penalties: true,
                playerThatWon: { id: MAX.id, name: "Max" },
                scoreFromTeamThatWon: 5,
                scoreFromTeamThatLost: 4,
            },
        }),
        mkMatch({
            nicoGoals: 0,
            maxGoals: 0,
            type: "playoff",
            playoffId: 30,
            outcome: {
                draw: true,
                penalties: true,
                playerThatWon: { id: NICO.id, name: "Nico" },
                scoreFromTeamThatWon: 3,
                scoreFromTeamThatLost: 2,
            },
        }),
    ])

    assert.equal(result.record.draws, 2)
    assert.equal(result.record.playerAWins, 0)
    assert.deepEqual(result.record.shootouts, {
        total: 2,
        playerAWon: 1,
        playerBWon: 1,
    })
    assert.deepEqual(result.lastMatches[0].shootout, {
        winner: "Nico",
        score: "3-2",
    })
    assert.match(result.criterion, /penales/)
})

test("invalid and incomplete matches are left out of the record and reported", async () => {
    const result = await run([
        mkMatch({ nicoGoals: 2, maxGoals: 0 }),
        mkMatch({ nicoGoals: 5, maxGoals: 0, valid: false }),
        mkMatch({ nicoGoals: undefined, maxGoals: 1 }),
    ])

    assert.equal(result.record.matches, 1)
    assert.equal(result.record.playerAGoals, 2)
    assert.deepEqual(result.excluded, { invalid: 1, incomplete: 1 })
    assert.ok(result.notes.some((note) => note.includes("inválido")))
})

test("a pair that never met gets an empty record and a clear note", async () => {
    const result = await run([])

    assert.equal(result.record.matches, 0)
    assert.equal(result.streak, null)
    assert.deepEqual(result.lastMatches, [])
    assert.deepEqual(result.bestWin, { playerA: null, playerB: null })
    assert.equal(result.firstMatchOn, null)
    assert.ok(
        result.notes.some((note) => note.includes("todavía no se enfrentaron"))
    )
})

test("the pair is the same whichever player is asked as A", async () => {
    const matches = [
        mkMatch({ nicoGoals: 3, maxGoals: 1 }),
        mkMatch({ nicoGoals: 0, maxGoals: 1 }),
    ]

    const asNico = await run(matches)
    const asMax = await run(matches, { playerA: MAX.id, playerB: NICO.id })

    assert.equal(asNico.record.playerAWins, asMax.record.playerBWins)
    assert.equal(asNico.record.playerAGoals, asMax.record.playerBGoals)
    assert.equal(asMax.players.playerA.name, "Max")
})

// ---------------------------------------------------------------------------
// Últimos partidos
// ---------------------------------------------------------------------------

test("the last matches go from the newest to the oldest, undated ones last", async () => {
    const result = await run(
        [
            mkMatch({
                nicoGoals: 1,
                maxGoals: 0,
                playedAt: "2026-10-01T20:00:00Z",
            }),
            mkMatch({
                nicoGoals: 2,
                maxGoals: 0,
                playedAt: null,
                playedAtPrecision: null,
            }),
            mkMatch({
                nicoGoals: 3,
                maxGoals: 0,
                playedAt: "2026-10-15T20:00:00Z",
            }),
        ],
        { limit: 10 }
    )

    assert.deepEqual(
        result.lastMatches.map(({ playerA }) => playerA.goals),
        [3, 1, 2]
    )
})

test("the detail is capped by the limit but the record counts every match", async () => {
    const matches = Array.from({ length: 30 }, (_, index) =>
        mkMatch({
            nicoGoals: 1,
            maxGoals: 0,
            playedAt: new Date(Date.UTC(2026, 0, index + 1, 20)).toISOString(),
        })
    )

    const byDefault = await run(matches)
    const capped = await run(matches, { limit: 500 })

    assert.equal(byDefault.record.matches, 30)
    assert.equal(byDefault.returned, DEFAULT_HEAD_TO_HEAD_LIMIT)
    assert.equal(byDefault.lastMatches.length, 5)
    assert.equal(capped.returned, MAX_HEAD_TO_HEAD_LIMIT)
    assert.equal(clampLimit(undefined), DEFAULT_HEAD_TO_HEAD_LIMIT)
    assert.equal(clampLimit(0), 1)
    assert.equal(clampLimit(3), 3)
})

test("each last match is compact, with names, teams and the round of a playoff", async () => {
    const result = await run([
        mkMatch({
            nicoGoals: 2,
            maxGoals: 1,
            type: "playoff",
            playoffId: 17,
            leg: 1,
        }),
    ])
    const [match] = result.lastMatches

    assert.deepEqual(match, {
        matchId: match.matchId,
        playedOn: "2026-10-20",
        playedAtPrecision: "exact",
        tournamentId: CUP_ID,
        tournament: "Copa APA",
        stage: "playoff",
        round: "round_of_16",
        leg: 1,
        playerA: { team: "Nico FC", goals: 2 },
        playerB: { team: "Max FC", goals: 1 },
        winner: "Nico",
    })
})

test("the rating change is oriented to playerA, whichever side he played", async () => {
    const decorate = async (matches) =>
        matches.map((match) => ({
            ...match,
            ratingChange: { p1: 4.5, p2: -4.5, ratingVersion: "2.0" },
        }))

    const asHome = await run(
        [mkMatch({ nicoGoals: 2, maxGoals: 0 })],
        {},
        {
            addRatingChanges: decorate,
        }
    )
    const asAway = await run(
        [mkMatch({ nicoGoals: 2, maxGoals: 0, nicoIsP1: false })],
        {},
        { addRatingChanges: decorate }
    )

    assert.deepEqual(asHome.lastMatches[0].ratingChange, {
        playerA: 4.5,
        playerB: -4.5,
    })
    assert.deepEqual(asAway.lastMatches[0].ratingChange, {
        playerA: -4.5,
        playerB: 4.5,
    })
})

test("a match without rating change simply has no ratingChange field", async () => {
    const decorate = async (matches) =>
        matches.map((match) => ({ ...match, ratingChange: null }))

    const result = await run(
        [mkMatch({ nicoGoals: 1, maxGoals: 0 })],
        {},
        {
            addRatingChanges: decorate,
        }
    )

    assert.equal("ratingChange" in result.lastMatches[0], false)
})

test("the rating changes are requested only for the matches that are detailed", async () => {
    const requested = []
    const matches = Array.from({ length: 8 }, (_, index) =>
        mkMatch({
            nicoGoals: 1,
            maxGoals: 0,
            playedAt: new Date(Date.UTC(2026, 0, index + 1, 20)).toISOString(),
        })
    )

    await run(
        matches,
        { limit: 3 },
        {
            addRatingChanges: async (list) => {
                requested.push(list.length)
                return list
            },
        }
    )

    assert.deepEqual(requested, [3])
})

test("dates use the Argentine day and respect the precision they were saved with", () => {
    // 02:00Z es todavía el día anterior en Argentina (UTC-3).
    assert.equal(
        formatPlayedOn(new Date("2026-10-21T02:00:00Z"), "exact"),
        "2026-10-20"
    )
    assert.equal(
        formatPlayedOn(new Date("2026-10-21T04:00:00Z"), "day"),
        "2026-10-21"
    )
    assert.equal(
        formatPlayedOn(new Date("2022-11-15T12:00:00Z"), "month"),
        "2022-11"
    )
    assert.equal(
        formatPlayedOn(new Date("2019-06-15T12:00:00Z"), "year"),
        "2019"
    )
    assert.equal(
        formatPlayedOn(new Date("2022-11-15T12:00:00Z"), "approx"),
        "aprox. 2022-11"
    )
    assert.equal(formatPlayedOn(undefined, "exact"), null)
    assert.equal(formatPlayedOn("no-es-fecha", "exact"), null)
})

// ---------------------------------------------------------------------------
// Mejor victoria y racha
// ---------------------------------------------------------------------------

test("the best win is the biggest margin, then more goals, then the oldest match", async () => {
    const result = await run([
        mkMatch({
            nicoGoals: 3,
            maxGoals: 0,
            playedAt: "2026-03-01T20:00:00Z",
        }),
        mkMatch({
            nicoGoals: 5,
            maxGoals: 2,
            playedAt: "2026-01-01T20:00:00Z",
        }),
        mkMatch({
            nicoGoals: 4,
            maxGoals: 1,
            playedAt: "2026-02-01T20:00:00Z",
        }),
        mkMatch({
            nicoGoals: 3,
            maxGoals: 0,
            playedAt: "2026-04-01T20:00:00Z",
        }),
        mkMatch({
            nicoGoals: 0,
            maxGoals: 1,
            playedAt: "2026-05-01T20:00:00Z",
        }),
    ])

    // Diferencia 3 en tres partidos: 5-2 tiene más goles que 3-0 y 4-1... 5-2 gana.
    assert.equal(result.bestWin.playerA.score, "5-2")
    assert.equal(result.bestWin.playerA.playedOn, "2026-01-01")
    assert.equal(result.bestWin.playerA.winner, "Nico")
    assert.equal(result.bestWin.playerB.score, "1-0")
    assert.equal(result.bestWin.playerB.winnerTeam, "Max FC")
})

test("the oldest of two equal wins is the best win", async () => {
    const result = await run([
        mkMatch({
            nicoGoals: 3,
            maxGoals: 0,
            playedAt: "2026-04-01T20:00:00Z",
        }),
        mkMatch({
            nicoGoals: 3,
            maxGoals: 0,
            playedAt: "2026-03-01T20:00:00Z",
        }),
    ])

    assert.equal(result.bestWin.playerA.playedOn, "2026-03-01")
})

test("the current streak counts the latest matches with the same result", async () => {
    const wins = await run([
        mkMatch({
            nicoGoals: 0,
            maxGoals: 1,
            playedAt: "2026-01-01T20:00:00Z",
        }),
        mkMatch({
            nicoGoals: 2,
            maxGoals: 1,
            playedAt: "2026-02-01T20:00:00Z",
        }),
        mkMatch({
            nicoGoals: 3,
            maxGoals: 0,
            playedAt: "2026-03-01T20:00:00Z",
        }),
    ])
    const draws = await run([
        mkMatch({
            nicoGoals: 2,
            maxGoals: 1,
            playedAt: "2026-01-01T20:00:00Z",
        }),
        mkMatch({
            nicoGoals: 1,
            maxGoals: 1,
            playedAt: "2026-02-01T20:00:00Z",
        }),
        mkMatch({
            nicoGoals: 0,
            maxGoals: 0,
            playedAt: "2026-03-01T20:00:00Z",
        }),
    ])

    assert.deepEqual(wins.streak, { result: "win", player: "Nico", count: 2 })
    assert.deepEqual(draws.streak, { result: "draw", player: null, count: 2 })
})

test("the first and last meeting come from the dated matches", async () => {
    const result = await run([
        mkMatch({
            nicoGoals: 1,
            maxGoals: 0,
            playedAt: "2026-03-01T20:00:00Z",
        }),
        mkMatch({
            nicoGoals: 1,
            maxGoals: 0,
            playedAt: "2026-01-10T20:00:00Z",
        }),
        mkMatch({
            nicoGoals: 1,
            maxGoals: 0,
            playedAt: null,
            playedAtPrecision: null,
        }),
    ])

    assert.equal(result.firstMatchOn, "2026-01-10")
    assert.equal(result.lastMatchOn, "2026-03-01")
})

// ---------------------------------------------------------------------------
// Jugadores y enlace
// ---------------------------------------------------------------------------

test("an unknown player is not an error: the answer says so and nothing is read", async () => {
    let read = false
    const result = await run(
        [],
        { playerB: "u-fantasma" },
        {
            findHeadToHeadMatchesForAssistant: async () => {
                read = true
                return []
            },
        }
    )

    assert.equal(read, false)
    assert.equal(result.record, null)
    assert.deepEqual(result.unknownPlayers, ["u-fantasma"])
    assert.deepEqual(result.lastMatches, [])
    assert.ok(result.notes[0].includes("u-fantasma"))
})

test("the answer links to the match listing filtered by both players", async () => {
    const result = await run([])

    assert.equal(
        result.viewPath,
        `/matches?player1=${NICO.id}&player2=${MAX.id}`
    )
    assert.equal(
        buildHeadToHeadViewPath("a b", "c&d"),
        "/matches?player1=a%20b&player2=c%26d"
    )
})

test("tournaments are only looked up for valid ids of the detailed matches", async () => {
    const lookups = []

    await run(
        [
            mkMatch({ nicoGoals: 1, maxGoals: 0 }),
            mkMatch({
                nicoGoals: 1,
                maxGoals: 0,
                tournament: { id: "id-historico", name: "Viejo" },
            }),
        ],
        {},
        {
            findTournamentsForAssistant: async (query) => {
                lookups.push(query)
                return [cup]
            },
        }
    )

    assert.deepEqual(lookups, [{ tournamentIds: [CUP_ID] }])
})

// ---------------------------------------------------------------------------
// Consulta a Mongo y schema
// ---------------------------------------------------------------------------

test("the Mongo filter matches the pair in any order and keeps legacy played matches", () => {
    assert.deepEqual(buildHeadToHeadFilter({ playerA: "a", playerB: "b" }), {
        $and: [
            { played: { $ne: false } },
            {
                $or: [
                    { "playerP1.id": "a", "playerP2.id": "b" },
                    { "playerP1.id": "b", "playerP2.id": "a" },
                ],
            },
        ],
    })
})

const validateQuery = (query) =>
    requestSchemas.getAssistantHeadToHead.query.validate(query)

test("the schema applies the default limit and requires two different players", () => {
    const { value, error } = validateQuery({ playerA: "a", playerB: "b" })

    assert.equal(error, undefined)
    assert.deepEqual(value, {
        playerA: "a",
        playerB: "b",
        limit: DEFAULT_HEAD_TO_HEAD_LIMIT,
    })
    assert.equal(
        validateQuery({ playerA: "a", playerB: "b", limit: "500" }).error,
        undefined
    )

    const invalid = [
        {},
        { playerA: "a" },
        { playerB: "b" },
        { playerA: "a", playerB: "a" },
        { playerA: "a", playerB: "b", limit: "0" },
        { playerA: "a", playerB: "b", limit: "x" },
        { playerA: "", playerB: "b" },
        { playerA: "a", playerB: "b", page: "1" },
    ]

    for (const query of invalid) {
        assert.ok(validateQuery(query).error, JSON.stringify(query))
    }
})

// ---------------------------------------------------------------------------
// Controller y ruta
// ---------------------------------------------------------------------------

test("the controller wraps the result and passes the rating decorator to the service", async () => {
    const calls = []
    const handler = createGetAssistantHeadToHead({
        retrieveAssistantHeadToHead: async (filters, dependencies) => {
            calls.push([filters, dependencies])
            return { record: { matches: 0 } }
        },
    })
    let payload
    await handler(
        { query: { playerA: "a", playerB: "b", limit: 5 } },
        {
            status: () => ({
                json: (body) => {
                    payload = body
                },
            }),
        }
    )

    assert.deepEqual(payload, {
        success: true,
        data: { record: { matches: 0 } },
    })
    assert.deepEqual(calls[0][0], {
        playerA: "a",
        playerB: "b",
        stage: undefined,
        tournamentId: undefined,
        limit: 5,
    })
})

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

    const state = { matches: [], reads: { matches: [], users: 0 }, ...options }

    t.mock.method(matchesModel, "find", (filter, projection) => {
        state.reads.matches.push([filter, projection])
        return { lean: async () => state.matches }
    })
    t.mock.method(tournamentsModel, "find", () => ({
        lean: async () => [cup],
    }))
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
    globalThis.fetch(`${baseUrl}/api/assistant/head-to-head${query}`, {
        headers,
    })

test("the head-to-head route rejects a missing or wrong secret without touching Mongo", async (t) => {
    await withApp(t, async ({ baseUrl, state }) => {
        const query = `?playerA=${NICO.id}&playerB=${MAX.id}`
        const missing = await get(baseUrl, query, {})
        const wrong = await get(baseUrl, query, {
            [RECAP_SECRET_HEADER]: "nope",
        })

        for (const response of [missing, wrong]) {
            assert.equal(response.status, 401)
            assert.equal(
                (await response.json()).error.code,
                "INVALID_RECAP_SECRET"
            )
        }

        assert.equal(state.reads.matches.length, 0)
        assert.equal(state.reads.users, 0)
    })
})

test("the head-to-head route validates the query before reading", async (t) => {
    await withApp(t, async ({ baseUrl, state }) => {
        const queries = [
            "",
            `?playerA=${NICO.id}`,
            `?playerA=${NICO.id}&playerB=${NICO.id}`,
            `?playerA=${NICO.id}&playerB=${MAX.id}&limit=0`,
            `?playerA=${NICO.id}&playerB=${MAX.id}&extra=1`,
        ]

        for (const query of queries) {
            const response = await get(baseUrl, query)

            assert.equal(response.status, 400, query)
            assert.equal((await response.json()).error.code, "VALIDATION_ERROR")
        }

        assert.equal(state.reads.matches.length, 0)
    })
})

test("GET /api/assistant/head-to-head answers the record and the last matches", async (t) => {
    await withApp(
        t,
        async ({ baseUrl, state }) => {
            const response = await get(
                baseUrl,
                `?playerA=${NICO.id}&playerB=${MAX.id}&limit=1`
            )
            const body = await response.json()

            assert.equal(response.status, 200)
            assert.equal(body.success, true)
            assert.equal(body.data.record.matches, 2)
            assert.equal(body.data.record.playerAWins, 1)
            assert.equal(body.data.record.playerBWins, 1)
            assert.equal(body.data.lastMatches.length, 1)
            assert.equal(body.data.lastMatches[0].playerA.goals, 0)
            assert.equal(
                body.data.viewPath,
                `/matches?player1=${NICO.id}&player2=${MAX.id}`
            )
            assert.deepEqual(
                state.reads.matches[0][0],
                buildHeadToHeadFilter({
                    playerA: NICO.id,
                    playerB: MAX.id,
                })
            )
        },
        {
            matches: [
                mkMatch({
                    nicoGoals: 2,
                    maxGoals: 1,
                    playedAt: "2026-01-01T20:00:00Z",
                }),
                mkMatch({
                    nicoGoals: 0,
                    maxGoals: 3,
                    playedAt: "2026-02-01T20:00:00Z",
                }),
            ],
        }
    )
})

// ---------------------------------------------------------------------------
// Filtros por etapa y por torneo ("¿cómo me fue contra Max en playoffs?")
// ---------------------------------------------------------------------------

test("the Mongo filter narrows the pair by stage and tournament", () => {
    const filter = buildHeadToHeadFilter({
        playerA: "a",
        playerB: "b",
        stage: "playoff",
        tournamentId: CUP_ID,
    })

    assert.deepEqual(filter.$and.slice(2), [
        { type: "playoff" },
        { "tournament.id": CUP_ID },
    ])
    assert.equal(
        buildHeadToHeadFilter({ playerA: "a", playerB: "b" }).$and.length,
        2
    )
})

test("the stage and tournament reach the query and are echoed in the answer", async () => {
    const queries = []
    const result = await run(
        [
            mkMatch({
                nicoGoals: 2,
                maxGoals: 1,
                type: "playoff",
                playoffId: 31,
            }),
        ],
        { stage: "playoff", tournamentId: CUP_ID },
        {
            findHeadToHeadMatchesForAssistant: async (query) => {
                queries.push(query)
                return [
                    mkMatch({
                        nicoGoals: 2,
                        maxGoals: 1,
                        type: "playoff",
                        playoffId: 31,
                    }),
                ]
            },
        }
    )

    assert.deepEqual(queries, [
        {
            playerA: NICO.id,
            playerB: MAX.id,
            stage: "playoff",
            tournamentId: CUP_ID,
        },
    ])
    assert.deepEqual(result.filters, {
        stage: "playoff",
        tournamentId: CUP_ID,
    })
    assert.equal(
        result.viewPath,
        `/matches?player1=${NICO.id}&player2=${MAX.id}&type=playoff&tournamentId=${CUP_ID}`
    )
})

test("without filters the answer says so and the link stays the plain one", async () => {
    const result = await run([])

    assert.deepEqual(result.filters, { stage: null, tournamentId: null })
    assert.equal(
        result.viewPath,
        `/matches?player1=${NICO.id}&player2=${MAX.id}`
    )
})

test("a filtered pair with no matches does not claim they never met", async () => {
    const result = await run([], { stage: "playoff" })

    assert.ok(result.notes.some((note) => note.includes("con ese filtro")))
    assert.ok(
        !result.notes.some((note) => note.includes("todavía no se enfrentaron"))
    )
})

test("the schema accepts the stage and tournament filters and rejects bad ones", () => {
    assert.equal(
        validateQuery({
            playerA: "a",
            playerB: "b",
            stage: "playoff",
            tournamentId: CUP_ID,
        }).error,
        undefined
    )

    for (const extra of [{ stage: "final" }, { tournamentId: "abc" }]) {
        assert.ok(validateQuery({ playerA: "a", playerB: "b", ...extra }).error)
    }
})

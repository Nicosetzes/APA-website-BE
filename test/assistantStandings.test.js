process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const { once } = require("node:events")
const test = require("node:test")

const { createApp } = require("../app")
const { buildStandingsViewPath } = require("../config/assistant")
const {
    createGetAssistantStandings,
    captureStandings,
} = require("../controller/getAssistantStandings")
const {
    createGetStandingsTableByTournamentId,
} = require("../controller/getStandingsTableByTournamentId")
const matchesModel = require("../dao/models/matches")
const tournamentsModel = require("../dao/models/tournaments")
const { RECAP_SECRET_HEADER } = require("../middleware/requireRecapSecret")
const retrieveAssistantStandings = require("../service/retrieveAssistantStandings")
const {
    describeQualification,
} = require("../service/retrieveAssistantStandings")
const requestSchemas = require("../validation/requestSchemas")

const SECRET = "test-recap-secret"
const TOURNAMENT_ID = "aaaaaaaaaaaaaaaaaaaaaaaa"
const NOW = new Date("2026-10-26T12:00:00.000Z")

const NICO = { id: "1", name: "Nico" }
const SANTI = { id: "2", name: "Santi" }
const LEO = { id: "3", name: "Leo" }

const RACING = { id: 10, name: "Racing" }
const BOCA = { id: 20, name: "Boca" }
const RIVER = { id: 30, name: "River" }

const leagueTournament = (overrides = {}) => ({
    id: TOURNAMENT_ID,
    _id: TOURNAMENT_ID,
    name: "Liga APA",
    format: "league",
    ongoing: true,
    groups: [],
    teams: [
        { team: RACING, player: NICO },
        { team: BOCA, player: SANTI },
        { team: RIVER, player: LEO },
    ],
    ...overrides,
})

const win = (p1, t1, s1, p2, t2, s2, at) => ({
    playerP1: p1,
    teamP1: t1,
    scoreP1: s1,
    playerP2: p2,
    teamP2: t2,
    scoreP2: s2,
    outcome:
        s1 === s2
            ? { draw: true }
            : {
                  draw: false,
                  teamThatWon: s1 > s2 ? t1 : t2,
                  playerThatWon: s1 > s2 ? p1 : p2,
                  scoreFromTeamThatWon: Math.max(s1, s2),
                  teamThatLost: s1 > s2 ? t2 : t1,
                  playerThatLost: s1 > s2 ? p2 : p1,
                  scoreFromTeamThatLost: Math.min(s1, s2),
              },
    playedAt: at,
    playedAtPrecision: "exact",
})

// Del más nuevo al más viejo, como los entrega el service.
const playedMatches = () => [
    win(NICO, RACING, 3, LEO, RIVER, 0, "2026-09-20T12:00:00.000Z"),
    win(SANTI, BOCA, 1, NICO, RACING, 1, "2026-09-19T12:00:00.000Z"),
]

// Corre el controller de la tabla real con datos en memoria.
const realStandingsHandler = ({
    tournament = leagueTournament(),
    played = playedMatches(),
    unplayed = [],
} = {}) =>
    createGetStandingsTableByTournamentId({
        retrieveTournamentById: async () => tournament,
        orderMatchesFromTournamentById: async () => played,
        retrieveAllNotPlayedMatchesByTournamentId: async () => unplayed,
    })

const run = async (filters, { tournament, handler } = {}) => {
    const doc = tournament ?? leagueTournament()
    const retrieveStandings = captureStandings(
        handler ?? realStandingsHandler({ tournament: doc })
    )

    return retrieveAssistantStandings(
        { tournamentId: TOURNAMENT_ID, ...filters },
        {
            findTournamentById: async () => doc,
            retrieveStandings,
            now: () => NOW,
        }
    )
}

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------

test("the table is the same as the standings view, with compact rows", async () => {
    const result = await run({})
    const [{ teams }] = result.standings

    assert.deepEqual(
        teams.map(({ position, player, team, points }) => [
            position,
            player,
            team,
            points,
        ]),
        [
            [1, "Nico", "Racing", 4],
            [2, "Santi", "Boca", 1],
            [3, "Leo", "River", 0],
        ]
    )
    assert.deepEqual(teams[0], {
        position: 1,
        player: "Nico",
        team: "Racing",
        played: 2,
        wins: 1,
        draws: 1,
        losses: 0,
        goalsFor: 4,
        goalsAgainst: 1,
        goalDifference: 3,
        points: 4,
        // Más viejo a más nuevo: empate y después victoria.
        form: "DW",
    })
    assert.equal(result.hasTable, true)
    assert.equal(result.viewPath, buildStandingsViewPath(TOURNAMENT_ID))
    assert.equal(result.asOf, NOW.toISOString())
    assert.deepEqual(result.tournament, {
        id: TOURNAMENT_ID,
        name: "Liga APA",
        format: "league",
        ongoing: true,
    })
})

test("the compact table is several times smaller than the full one", async () => {
    // Cada equipo con sus últimos 5 partidos, como en un torneo avanzado.
    const pairs = [
        [NICO, RACING, LEO, RIVER],
        [SANTI, BOCA, NICO, RACING],
        [LEO, RIVER, SANTI, BOCA],
    ]
    const played = Array.from({ length: 12 }, (_, index) => {
        const [p1, t1, p2, t2] = pairs[index % pairs.length]

        return win(
            p1,
            t1,
            (index % 4) + 1,
            p2,
            t2,
            index % 3,
            `2026-09-${String(10 + index).padStart(2, "0")}T12:00:00.000Z`
        )
    }).reverse()
    const handler = realStandingsHandler({ played })
    const full = await captureStandings(handler)({
        tournamentId: TOURNAMENT_ID,
    })
    const compact = await run({}, { handler })

    const fullSize = JSON.stringify(full).length
    const compactSize = JSON.stringify(compact.standings).length

    assert.ok(
        compactSize * 3 < fullSize,
        `se esperaba una reducción de 3x o más: ${compactSize} vs ${fullSize}`
    )
    assert.doesNotMatch(
        JSON.stringify(compact),
        /streak|playedAt|datePrecision/
    )
})

test("a league team that cannot reach the leader is described as such", async () => {
    const { standings } = await run({})
    const [leader, , last] = standings[0].teams

    assert.equal(leader.qualification, undefined)
    assert.match(last.qualification, /no puede alcanzar al líder/)
})

test("a player filter keeps only his rows with their real position", async () => {
    const result = await run({ playerId: LEO.id })

    assert.deepEqual(
        result.standings[0].teams.map(({ position, player }) => [
            position,
            player,
        ]),
        [[3, "Leo"]]
    )
})

test("a player without teams in the tournament gets an empty table with a note", async () => {
    const result = await run({ playerId: "999" })

    assert.deepEqual(result.standings, [])
    assert.ok(result.notes.some((note) => note.includes("no tiene equipos")))
})

test("tables with groups keep one entry per group and the group filter is passed on", async () => {
    const received = []
    const handler = async (req, res) => {
        received.push(req.query.group)
        res.status(200).send({
            id: TOURNAMENT_ID,
            name: "Mundial",
            standings: [
                {
                    group: "A",
                    teams: [
                        { team: RACING, player: NICO, points: 6, played: 2 },
                        { team: BOCA, player: SANTI, points: 3, played: 2 },
                    ],
                },
                {
                    group: "B",
                    teams: [
                        { team: RIVER, player: LEO, points: 4, played: 2 },
                        {
                            team: { id: 40, name: "Lanús" },
                            player: NICO,
                            points: 1,
                            played: 2,
                        },
                    ],
                },
            ],
        })
    }
    const tournament = leagueTournament({ format: "world_cup" })

    const all = await run({}, { tournament, handler })
    const onlyNico = await run({ playerId: NICO.id }, { tournament, handler })
    await run({ group: "B" }, { tournament, handler })

    assert.deepEqual(
        all.standings.map(({ group, teams }) => [group, teams.length]),
        [
            ["A", 2],
            ["B", 2],
        ]
    )
    assert.deepEqual(
        onlyNico.standings.map(({ group, teams }) => [
            group,
            teams[0].position,
            teams[0].team,
        ]),
        [
            ["A", 1, "Racing"],
            ["B", 2, "Lanús"],
        ]
    )
    assert.deepEqual(received, [undefined, undefined, "B"])
})

test("a cup format has no qualification text: advancing is by position", async () => {
    const handler = async (req, res) =>
        res.status(200).send({
            standings: [
                {
                    group: "A",
                    teams: [
                        { team: RACING, player: NICO, points: 6, played: 2 },
                    ],
                },
            ],
        })
    const result = await run(
        {},
        { tournament: leagueTournament({ format: "world_cup" }), handler }
    )

    assert.equal(result.standings[0].teams[0].qualification, undefined)
})

test("the Superliga flags become one sentence, strongest first", () => {
    const describe = (flags) =>
        describeQualification("league_playin_playoff", flags)

    assert.equal(
        describe({ directlyQualified: true, playinQualified: true }),
        "clasificado directo al playoff"
    )
    assert.equal(
        describe({ directlyQualified: false, playinQualified: true }),
        "tiene asegurado al menos el play-in"
    )
    assert.equal(
        describe({ playinQualified: false, eliminated: true }),
        "eliminado: no llega al play-in"
    )
    assert.equal(describe({ playinQualified: false, eliminated: false }), null)
    assert.equal(describeQualification("world_cup", { eliminated: true }), null)
})

test("a knockout-only tournament has no table and nothing is computed", async () => {
    let computed = false
    const result = await run(
        {},
        {
            tournament: leagueTournament({ format: "playoff" }),
            handler: async () => {
                computed = true
            },
        }
    )

    assert.equal(computed, false)
    assert.equal(result.hasTable, false)
    assert.deepEqual(result.standings, [])
    assert.equal(result.viewPath, null)
    assert.ok(result.notes[0].includes("no tiene tabla"))
})

test("a table where nothing was played says so", async () => {
    const tournament = leagueTournament()
    const result = await run(
        {},
        {
            tournament,
            handler: realStandingsHandler({ tournament, played: [] }),
        }
    )

    assert.ok(result.notes.some((note) => note.includes("ningún partido")))
})

test("an unknown tournament is a 404", async () => {
    await assert.rejects(
        retrieveAssistantStandings(
            { tournamentId: TOURNAMENT_ID },
            {
                findTournamentById: async () => null,
                retrieveStandings: async () => ({}),
            }
        ),
        (error) => error.status === 404 && error.code === "TOURNAMENT_NOT_FOUND"
    )
})

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

test("captureStandings returns what the table controller would send, whichever method it uses", async () => {
    const viaSend = await captureStandings(async (req, res) => {
        res.status(200).send({ via: "send", tournament: req.params.tournament })
    })({ tournamentId: "t1" })
    const viaJson = await captureStandings(async (req, res) => {
        res.status(200).json({ via: "json", group: req.query.group })
    })({ tournamentId: "t1", group: "C" })

    assert.deepEqual(viaSend, { via: "send", tournament: "t1" })
    assert.deepEqual(viaJson, { via: "json", group: "C" })
})

test("captureStandings lets the controller errors through", async () => {
    await assert.rejects(
        captureStandings(async () => {
            throw new Error("boom")
        })({ tournamentId: "t1" }),
        /boom/
    )
})

test("the controller wraps the result and hands the standings reader to the service", async () => {
    const calls = []
    const handler = createGetAssistantStandings({
        retrieveAssistantStandings: async (filters, dependencies) => {
            calls.push([filters, typeof dependencies.retrieveStandings])
            return { hasTable: true }
        },
    })
    let payload
    await handler(
        { query: { tournamentId: "t1", group: "A", playerId: "p1" } },
        {
            status: () => ({
                json: (body) => {
                    payload = body
                },
            }),
        }
    )

    assert.deepEqual(payload, { success: true, data: { hasTable: true } })
    assert.deepEqual(calls, [
        [{ tournamentId: "t1", group: "A", playerId: "p1" }, "function"],
    ])
})

// ---------------------------------------------------------------------------
// Schema y ruta
// ---------------------------------------------------------------------------

const validateQuery = (query) =>
    requestSchemas.getAssistantStandings.query.validate(query)

test("the schema requires a valid tournament and accepts a group and a player", () => {
    assert.equal(
        validateQuery({
            tournamentId: TOURNAMENT_ID,
            group: "b",
            playerId: "p1",
        }).error,
        undefined
    )
    assert.equal(
        validateQuery({ tournamentId: TOURNAMENT_ID, group: "b" }).value.group,
        "B"
    )

    for (const query of [
        {},
        { tournamentId: "abc" },
        { tournamentId: TOURNAMENT_ID, group: "Z" },
        { tournamentId: TOURNAMENT_ID, playerId: "" },
        { tournamentId: TOURNAMENT_ID, extra: "1" },
    ]) {
        assert.ok(validateQuery(query).error, JSON.stringify(query))
    }
})

const withApp = async (t, callback) => {
    const previousSecret = process.env.RECAP_SECRET
    process.env.RECAP_SECRET = SECRET
    t.after(() => {
        if (previousSecret === undefined) delete process.env.RECAP_SECRET
        else process.env.RECAP_SECRET = previousSecret
    })

    const reads = { tournaments: 0, matches: 0 }

    t.mock.method(tournamentsModel, "findById", async () => {
        reads.tournaments += 1
        return leagueTournament()
    })
    t.mock.method(matchesModel, "find", async (filter) => {
        reads.matches += 1
        return filter.played === true ? playedMatches() : []
    })

    const app = createApp({
        ensureDatabase: async () => {},
        getDatabaseStatus: () => ({ state: "connected", name: "apa_test" }),
    })
    const server = app.listen(0)
    await once(server, "listening")

    try {
        const baseUrl = `http://127.0.0.1:${server.address().port}`
        await callback({ baseUrl, reads })
    } finally {
        server.close()
        await once(server, "close")
    }
}

const get = (
    baseUrl,
    query = "",
    headers = { [RECAP_SECRET_HEADER]: SECRET }
) => globalThis.fetch(`${baseUrl}/api/assistant/standings${query}`, { headers })

test("the standings route rejects a missing or wrong secret without touching Mongo", async (t) => {
    await withApp(t, async ({ baseUrl, reads }) => {
        const query = `?tournamentId=${TOURNAMENT_ID}`

        for (const headers of [{}, { [RECAP_SECRET_HEADER]: "nope" }]) {
            const response = await get(baseUrl, query, headers)

            assert.equal(response.status, 401)
            assert.equal(
                (await response.json()).error.code,
                "INVALID_RECAP_SECRET"
            )
        }

        assert.deepEqual(reads, { tournaments: 0, matches: 0 })
    })
})

test("the standings route validates the query before reading", async (t) => {
    await withApp(t, async ({ baseUrl, reads }) => {
        for (const query of [
            "",
            "?tournamentId=abc",
            `?tournamentId=${TOURNAMENT_ID}&group=Z`,
        ]) {
            const response = await get(baseUrl, query)

            assert.equal(response.status, 400, query)
        }

        assert.deepEqual(reads, { tournaments: 0, matches: 0 })
    })
})

test("GET /api/assistant/standings answers the compact table of a real tournament", async (t) => {
    await withApp(t, async ({ baseUrl }) => {
        const response = await get(
            baseUrl,
            `?tournamentId=${TOURNAMENT_ID}&playerId=${NICO.id}`
        )
        const body = await response.json()

        assert.equal(response.status, 200)
        assert.equal(body.success, true)
        assert.equal(body.data.hasTable, true)
        assert.equal(body.data.standings[0].teams[0].player, "Nico")
        assert.equal(body.data.standings[0].teams[0].position, 1)
        assert.equal(body.data.standings[0].teams[0].points, 4)
        assert.equal(
            body.data.viewPath,
            `/tournaments/${TOURNAMENT_ID}/standings`
        )
    })
})

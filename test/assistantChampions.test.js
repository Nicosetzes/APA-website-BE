process.env.LOG_LEVEL = "silent"
const assert = require("node:assert/strict")
const { once } = require("node:events")
const test = require("node:test")
const { createApp } = require("../app")
const { HALL_OF_FAME_VIEW_PATH } = require("../config/assistant")
const {
    computeTitleRanking,
} = require("../controller/getTournamentRecapContext/titles")
const {
    createGetAssistantChampions,
} = require("../controller/getAssistantChampions")
const tournamentsModel = require("../dao/models/tournaments")
const usersModel = require("../dao/models/users")
const { RECAP_SECRET_HEADER } = require("../middleware/requireRecapSecret")
const retrieveAssistantChampions = require("../service/retrieveAssistantChampions")
const { buildChampionsResponse } = retrieveAssistantChampions
const requestSchemas = require("../validation/requestSchemas")
const SECRET = "test-recap-secret"
const NOW = new Date("2026-10-26T12:00:00.000Z")
const P = {
    leo: { id: "u-leo", name: "Leo" },
    max: { id: "u-max", name: "Max" },
    nico: { id: "u-nico", name: "Nico" },
    santi: { id: "u-santi", name: "Santi" },
    lucho: { id: "u-lucho", name: "Lucho" },
}
const FOUR = [P.nico, P.leo, P.max, P.santi]
const FIVE = [...FOUR, P.lucho]
const users = Object.values(P).map(({ id, name }) => ({
    id,
    nickname: name,
}))
let sequence = 0
// Torneo del snapshot de PROD: `champion` y `finalist` son claves de `P`. Los
// históricos (`legacy`) se cargaron solo con el año.
const t = (name, format, champion, finalist, closedAt, extra = {}) => {
    sequence += 1
    return {
        _id: `0000000000000000000${String(sequence).padStart(5, "0")}`,
        name,
        format,
        players: FOUR,
        ongoing: false,
        closedAt: closedAt ? new Date(closedAt) : undefined,
        ...(extra.legacy ? { closedAtPrecision: "year" } : {}),
        outcome: champion && {
            champion: {
                player: P[champion],
                team: { id: sequence, name: `${P[champion].name} FC` },
            },
            ...(finalist
                ? {
                      finalist: {
                          player: P[finalist],
                          team: {
                              id: 100 + sequence,
                              name: `Rival ${sequence}`,
                          },
                      },
                  }
                : {}),
        },
        ...extra,
    }
}
const LEGACY = { legacy: true }
const INVALID = { valid: false }
// Los 27 torneos del snapshot de PROD del 2026-10-06 (mismos datos que
// `test/tournamentRecapTitles.test.js`), con ids sintéticos.
const prodTournaments = () => [
    t("Torneo Argentino 2021/22", "league", "leo", "leo", "2022-04-19T02:37Z"),
    t(
        "Superliga Europea 2022",
        "league_playin_playoff",
        "nico",
        "nico",
        "2023-05-08T03:55Z"
    ),
    t("Copa del Mundo 2022", "world_cup", "leo", "max", "2023-02-24T23:50Z"),
    t(
        "Superliga ítalo-española 2022/23",
        "league",
        "leo",
        "nico",
        "2023-10-13T22:05Z"
    ),
    t(
        "Superliga Inglesa 2022",
        "league_playin_playoff",
        "nico",
        "santi",
        "2023-05-13T15:05Z"
    ),
    t(
        "Chempions 2019/20",
        "champions_league",
        "leo",
        "max",
        "2023-05-23T02:12Z"
    ),
    t(
        "Superliga Argentina 2023",
        "league_playin_playoff",
        "max",
        "max",
        "2023-12-12T23:15Z"
    ),
    t(
        "Superliga Internacional 2023/24 (I)",
        "league_playin_playoff",
        null,
        null,
        undefined,
        INVALID
    ),
    t(
        "Superliga Internacional 2023/24 (II)",
        "league_playin_playoff",
        null,
        null,
        undefined,
        INVALID
    ),
    t(
        "Superliga Inglesa 2024",
        "league_playin_playoff",
        "nico",
        "max",
        "2024-11-15T22:33Z"
    ),
    t("Chempions 2024", "champions_league", null, null, undefined, {
        ...INVALID,
        ongoing: true,
    }),
    t(
        "Mundial de Ferraris 2024/25",
        "world_cup",
        "leo",
        "leo",
        "2025-02-20T00:05Z"
    ),
    t(
        "Superliga Internacional 2025",
        "league_playin_playoff",
        "nico",
        "leo",
        "2025-12-29T22:05Z"
    ),
    t("Copa Argentina 2025/26", "playoff", "leo", "nico", "2026-08-07T22:28Z", {
        players: FIVE,
    }),
    t("Liga Inglesa 2026", "league", null, null, undefined, INVALID),
    t(
        "Torneo Argentino 2016",
        "league",
        "max",
        "leo",
        "2016-01-01T10:00Z",
        LEGACY
    ),
    t(
        "Torneo Argentino 2017",
        "league",
        "max",
        "max",
        "2017-01-01T10:00Z",
        LEGACY
    ),
    t(
        "Copa del Mundo 2017",
        "world_cup",
        "leo",
        "santi",
        "2017-02-01T10:00Z",
        LEGACY
    ),
    t(
        "Torneo Argentino 2018",
        "league",
        "leo",
        "santi",
        "2018-01-01T10:00Z",
        LEGACY
    ),
    t(
        "Copa del Mundo 2018",
        "world_cup",
        "leo",
        "santi",
        "2018-02-01T10:00Z",
        LEGACY
    ),
    t(
        "Copa del Mundo 2018 (Juego Oficial)",
        "world_cup",
        "max",
        "leo",
        "2018-03-01T10:00Z",
        LEGACY
    ),
    t(
        "Mundial de Clubes 2018",
        "club_world_cup",
        "max",
        "max",
        "2018-04-01T10:00Z",
        LEGACY
    ),
    t(
        "Copa Argentina 2018",
        "playoff",
        "max",
        "leo",
        "2018-05-01T10:00Z",
        LEGACY
    ),
    t(
        "Copa América 2019",
        "american_cup",
        "santi",
        "max",
        "2019-01-01T10:00Z",
        LEGACY
    ),
    t("Copa del Mundo 2026", "world_cup_2026", null, null, undefined, {
        ongoing: true,
    }),
    t("Supercopa APA 2026", "super_cup", null, null, undefined, {
        ongoing: true,
        players: FIVE,
    }),
    t("Copa Afinidades 2026", "playoff", null, null, undefined, {
        ongoing: true,
        players: FIVE,
    }),
]
const run = (tournaments = prodTournaments(), overrides = {}) =>
    retrieveAssistantChampions({
        findTournamentsForStatistics: async () => tournaments,
        findAllUsers: async () => users,
        now: () => NOW,
        ...overrides,
    })
const playerRow = (data, name) => data.players.find((row) => row.name === name)
const tournamentRow = (data, name) =>
    data.tournaments.find((row) => row.name === name)
// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------
test("the real snapshot gives Santi 1 title (a historic one) and 4 runner-ups", async () => {
    const data = await run()
    const santi = playerRow(data, "Santi")
    assert.equal(santi.titles, 1)
    assert.deepEqual(santi.titleTournaments, ["Copa América 2019"])
    assert.equal(santi.runnerUps, 4)
    assert.deepEqual(santi.runnerUpTournaments, [
        "Superliga Inglesa 2022",
        "Copa del Mundo 2018",
        "Torneo Argentino 2018",
        "Copa del Mundo 2017",
    ])
})
test("every player of the snapshot gets the titles and runner-ups counted by hand", async () => {
    const data = await run()
    const totals = Object.fromEntries(
        data.players.map(({ name, titles, runnerUps, rank }) => [
            name,
            [titles, runnerUps, rank],
        ])
    )
    assert.deepEqual(totals, {
        Leo: [9, 4, 1],
        Max: [6, 4, 2],
        Nico: [4, 2, 3],
        Santi: [1, 4, 4],
        Lucho: [0, 0, 5],
    })
    // Los totales de títulos y subcampeonatos cierran con las filas de torneos.
    assert.equal(data.totalTournaments, 20)
    assert.equal(data.tournaments.length, 20)
    assert.equal(
        data.players.reduce((total, { titles }) => total + titles, 0),
        20
    )
    assert.equal(
        data.players.reduce((total, { runnerUps }) => total + runnerUps, 0),
        14
    )
})
test("the historic tournaments come flagged, dated by year and without matches", async () => {
    const data = await run()
    const legacy = data.tournaments.filter((row) => row.legacy)
    assert.equal(legacy.length, 9)
    const worldCup = tournamentRow(data, "Copa del Mundo 2017")
    assert.equal(worldCup.legacy, true)
    assert.equal(worldCup.closedOn, "2017")
    assert.deepEqual(worldCup.champion, { player: "Leo", team: "Leo FC" })
    assert.equal(worldCup.runnerUp.player, "Santi")
    // Los modernos no llevan la marca y se fechan con el día argentino.
    const modern = tournamentRow(data, "Copa Argentina 2025/26")
    assert.equal("legacy" in modern, false)
    assert.equal(modern.closedOn, "2026-08-07")
})
test("a champion that is also the runner-up counts as title, not as runner-up", async () => {
    const data = await run()
    const row = tournamentRow(data, "Torneo Argentino 2017")
    assert.equal(row.sameChampionAndRunnerUp, true)
    assert.equal(row.champion.player, "Max")
    assert.equal(row.runnerUp.player, "Max")
    assert.equal(
        "sameChampionAndRunnerUp" in tournamentRow(data, "Copa del Mundo 2022"),
        false
    )
    const max = playerRow(data, "Max")
    assert.ok(max.titleTournaments.includes("Torneo Argentino 2017"))
    assert.equal(
        max.runnerUpTournaments.includes("Torneo Argentino 2017"),
        false
    )
    // Max: 4 subcampeonatos, ninguno de los 3 torneos donde ganó y quedó segundo.
    assert.equal(max.runnerUps, 4)
})
test("invalid, ongoing and championless tournaments do not count", async () => {
    const data = await run([
        ...prodTournaments(),
        t("Torneo sin campeón", "league", null, null, "2026-09-01T10:00Z"),
    ])
    const names = data.tournaments.map(({ name }) => name)
    for (const excluded of [
        "Superliga Internacional 2023/24 (I)",
        "Chempions 2024",
        "Liga Inglesa 2026",
        "Copa del Mundo 2026",
        "Torneo sin campeón",
    ]) {
        assert.equal(names.includes(excluded), false, excluded)
    }
    assert.equal(data.totalTournaments, 20)
    assert.equal(data.notes.length, 1)
    assert.match(
        data.notes[0],
        /1 torneo\(s\) terminado\(s\) no tienen campeón/
    )
    assert.match(data.notes[0], /Torneo sin campeón/)
})
test("a valid snapshot has no notes", async () => {
    assert.deepEqual((await run()).notes, [])
})
test("the two Copa del Mundo 2018 are separate rows with their own champion", async () => {
    const data = await run()
    const rows = data.tournaments.filter(({ name }) =>
        name.startsWith("Copa del Mundo 2018")
    )
    assert.equal(rows.length, 2)
    assert.deepEqual(
        Object.fromEntries(rows.map((row) => [row.name, row.champion.player])),
        {
            "Copa del Mundo 2018": "Leo",
            "Copa del Mundo 2018 (Juego Oficial)": "Max",
        }
    )
})
test("the tournaments go from the newest to the oldest", async () => {
    const data = await run()
    assert.equal(data.tournaments[0].name, "Copa Argentina 2025/26")
    assert.equal(data.tournaments[0].champion.player, "Leo")
    assert.equal(
        data.tournaments[data.tournaments.length - 1].name,
        "Torneo Argentino 2016"
    )
    const dates = data.tournaments.map(({ closedOn }) => closedOn.slice(0, 4))
    assert.deepEqual(dates, [...dates].sort().reverse())
})
test("equal titles tie on the runner-ups and then share the position", () => {
    const tournaments = [
        t("A", "playoff", "leo", "nico", "2024-01-01T10:00Z"),
        t("B", "playoff", "max", "nico", "2024-02-01T10:00Z"),
        t("C", "playoff", "nico", "leo", "2024-03-01T10:00Z"),
        t("D", "playoff", "santi", "max", "2024-04-01T10:00Z"),
    ]
    const { players } = buildChampionsResponse({
        tournaments,
        users,
        now: NOW,
    })
    // Todos con 1 título: desempata tener más subcampeonatos (Nico 2, Leo y Max 1).
    assert.deepEqual(
        players.map(({ name, titles, runnerUps, rank }) => [
            name,
            titles,
            runnerUps,
            rank,
        ]),
        [
            ["Nico", 1, 2, 1],
            ["Leo", 1, 1, 2],
            ["Max", 1, 1, 2],
            ["Santi", 1, 0, 4],
            ["Lucho", 0, 0, 5],
        ]
    )
})
test("equal titles and runner-ups share the position", () => {
    const tournaments = [
        t("A", "playoff", "leo", "max", "2024-01-01T10:00Z"),
        t("B", "playoff", "max", "leo", "2024-02-01T10:00Z"),
    ]
    const { players } = buildChampionsResponse({
        tournaments,
        users,
        now: NOW,
    })
    assert.deepEqual(
        players.map(({ name, rank }) => [name, rank]),
        [
            ["Leo", 1],
            ["Max", 1],
            ["Nico", 3],
            ["Santi", 3],
            ["Lucho", 3],
        ]
    )
})
test("a tournament without runner-up counts only the title", () => {
    const data = buildChampionsResponse({
        tournaments: [
            t("Sin final", "playoff", "leo", null, "2024-01-01T10:00Z"),
        ],
        users,
        now: NOW,
    })
    const row = tournamentRow(data, "Sin final")
    assert.deepEqual(row.champion, { player: "Leo", team: "Leo FC" })
    assert.equal("runnerUp" in row, false)
    assert.equal("sameChampionAndRunnerUp" in row, false)
    assert.equal(playerRow(data, "Leo").titles, 1)
    assert.equal(playerRow(data, "Leo").runnerUps, 0)
})
test("a player without titles or runner-ups is listed with 0 and 0", async () => {
    const data = await run(prodTournaments(), {
        findAllUsers: async () => [
            ...users,
            { id: "u-pepe", nickname: "Pepe" },
            { id: "u-ana", nickname: "Ana" },
        ],
    })
    const lucho = playerRow(data, "Lucho")
    const pepe = playerRow(data, "Pepe")
    assert.deepEqual(
        [lucho.titles, lucho.runnerUps, pepe.titles, pepe.runnerUps],
        [0, 0, 0, 0]
    )
    // Sin torneos con título, la fila no trae listas vacías.
    assert.equal("titleTournaments" in pepe, false)
    assert.equal("runnerUpTournaments" in pepe, false)
    // Comparten el último puesto, y van ordenados por nombre.
    assert.equal(pepe.rank, lucho.rank)
    const tail = data.players.slice(-3).map(({ name }) => name)
    assert.deepEqual(tail, ["Lucho", "Ana", "Pepe"])
})
test("when nobody has won anything yet the users are listed with rank 1", () => {
    const { players, totalTournaments } = buildChampionsResponse({
        tournaments: [],
        users,
        now: NOW,
    })
    assert.equal(totalTournaments, 0)
    assert.equal(players.length, 5)
    assert.ok(players.every(({ titles, rank }) => titles === 0 && rank === 1))
})
test("the name is the current nickname of the user, or the stored one for an unknown id", () => {
    const tournaments = [
        t("Con apodo nuevo", "playoff", "leo", "max", "2024-01-01T10:00Z", {
            players: [P.leo, P.max],
        }),
        t("Con jugador borrado", "playoff", "leo", "max", "2024-02-01T10:00Z", {
            players: [P.leo, P.max],
        }),
    ]
    tournaments[1].outcome.finalist.player = {
        id: "u-borrado",
        name: "Fantasma",
    }
    const data = buildChampionsResponse({
        tournaments,
        users: [
            { id: "u-leo", nickname: "Leonel" },
            { id: "u-max", nickname: "Maxi" },
        ],
        now: NOW,
    })
    const first = tournamentRow(data, "Con apodo nuevo")
    assert.equal(first.champion.player, "Leonel")
    assert.equal(first.runnerUp.player, "Maxi")
    assert.equal(
        tournamentRow(data, "Con jugador borrado").runnerUp.player,
        "Fantasma"
    )
    assert.deepEqual(data.players.map(({ name }) => name).sort(), [
        "Fantasma",
        "Leonel",
        "Maxi",
    ])
    assert.equal(playerRow(data, "Leonel").titles, 2)
})
test("users that come with _id instead of id are read too", () => {
    const data = buildChampionsResponse({
        tournaments: [t("Copa", "playoff", "leo", "max", "2024-01-01T10:00Z")],
        users: [{ _id: "u-leo", nickname: "Leonel" }],
        now: NOW,
    })
    assert.equal(tournamentRow(data, "Copa").champion.player, "Leonel")
})
test("the answer carries no ids, only names and the Hall of Fame link", async () => {
    const data = await run()
    const text = JSON.stringify(data)
    assert.doesNotMatch(text, /"_id"|"id"|cloudinary|u-leo|u-max|u-nico/)
    assert.equal(data.viewPath, "/hall-of-fame")
    assert.equal(data.viewPath, HALL_OF_FAME_VIEW_PATH)
    assert.equal(data.asOf, NOW.toISOString())
    assert.match(data.criterion, /históricos/)
})
test("the counts are the ones of the title ranking of the recaps", async () => {
    const tournaments = prodTournaments()
    const data = await run(tournaments)
    const ranking = computeTitleRanking(tournaments)
    assert.deepEqual(
        data.players.map(({ name, titles, runnerUps, rank }) => ({
            name,
            titles,
            runnerUps,
            rank,
        })),
        ranking.map(({ player, titles, runnerUps, rank }) => ({
            name: player.name,
            titles,
            runnerUps,
            rank,
        }))
    )
})
test("the answer for the real size of the site stays under 2500 tokens", async () => {
    const data = await run()
    assert.ok(JSON.stringify(data).length / 3.2 < 2500)
})
// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
test("the controller answers what the service returns and takes no input", async () => {
    const calls = []
    const handler = createGetAssistantChampions({
        retrieveAssistantChampions: async (...args) => {
            calls.push(args)
            return { totalTournaments: 0 }
        },
    })
    const res = {
        status(code) {
            this.code = code
            return this
        },
        json(body) {
            this.body = body
            return this
        },
    }
    await handler({ query: { x: "1" } }, res)
    assert.equal(res.code, 200)
    assert.deepEqual(res.body, { success: true, data: { totalTournaments: 0 } })
    assert.deepEqual(calls, [[]])
})
// ---------------------------------------------------------------------------
// Ruta
// ---------------------------------------------------------------------------
const withApp = async (t, callback, options = {}) => {
    const previousSecret = process.env.RECAP_SECRET
    process.env.RECAP_SECRET = SECRET
    t.after(() => {
        if (previousSecret === undefined) delete process.env.RECAP_SECRET
        else process.env.RECAP_SECRET = previousSecret
    })
    const state = {
        tournaments: prodTournaments(),
        reads: { tournaments: 0, users: 0 },
        ...options,
    }
    t.mock.method(tournamentsModel, "find", () => {
        state.reads.tournaments += 1
        return { lean: async () => state.tournaments }
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
) => globalThis.fetch(`${baseUrl}/api/assistant/champions${query}`, { headers })
test("the champions route rejects a missing or wrong secret without touching Mongo", async (t) => {
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
        assert.equal(state.reads.tournaments, 0)
        assert.equal(state.reads.users, 0)
    })
})
test("the champions route is closed when the secret is not configured", async (t) => {
    await withApp(t, async ({ baseUrl, state }) => {
        delete process.env.RECAP_SECRET
        const response = await get(baseUrl)
        assert.equal(response.status, 503)
        assert.equal(
            (await response.json()).error.code,
            "RECAP_SECRET_NOT_CONFIGURED"
        )
        assert.equal(state.reads.tournaments, 0)
    })
})
test("the champions route accepts no query and validates before reading", async (t) => {
    await withApp(t, async ({ baseUrl, state }) => {
        for (const query of [
            "?player=u-leo",
            "?legacy=false",
            "?limit=5",
            "?x=",
        ]) {
            const response = await get(baseUrl, query)
            const body = await response.json()
            assert.equal(response.status, 400, query)
            assert.equal(body.error.code, "VALIDATION_ERROR", query)
        }
        assert.equal(state.reads.tournaments, 0)
        assert.equal(state.reads.users, 0)
    })
    assert.deepEqual(Object.keys(requestSchemas.getAssistantChampions).sort(), [
        "body",
        "params",
        "query",
    ])
})
test("GET /api/assistant/champions answers the Hall of Fame with the historic tournaments", async (t) => {
    await withApp(t, async ({ baseUrl, state }) => {
        const response = await get(baseUrl)
        const body = await response.json()
        assert.equal(response.status, 200)
        assert.equal(body.success, true)
        assert.equal(body.data.totalTournaments, 20)
        assert.equal(body.data.viewPath, "/hall-of-fame")
        const santi = body.data.players.find(({ name }) => name === "Santi")
        assert.equal(santi.titles, 1)
        assert.deepEqual(santi.titleTournaments, ["Copa América 2019"])
        assert.equal(state.reads.tournaments, 1)
        assert.equal(state.reads.users, 1)
    })
})

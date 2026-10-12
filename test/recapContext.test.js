process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const { once } = require("node:events")
const test = require("node:test")

const { createApp } = require("../app")
const matchesModel = require("../dao/models/matches")
const { createGetRecapContext } = require("../controller/getRecapContext")
const { describeTournamentFormat } = require("../config/tournamentFormatRules")

const createResponse = () => ({
    body: null,
    json(body) {
        this.body = body
        return this
    },
})

const team = (id) => ({ id, name: `Equipo ${id}` })
const player = (id) => ({ id, name: `Jugador ${id}` })

const playoffMatch = (overrides) => ({
    type: "playoff",
    played: false,
    leg: 1,
    teamP1: team(1),
    playerP1: player(1),
    teamP2: team(2),
    playerP2: player(2),
    ...overrides,
})

test("every tournament format has rules and the playoff mode changes the knockout text", () => {
    const formats = [
        "champions_league",
        "league",
        "league_playin_playoff",
        "playoff",
        "super_cup",
        "world_cup",
        "world_cup_2026",
    ]

    for (const format of formats) {
        const rules = describeTournamentFormat({ format })
        assert.ok(rules.stages.length > 0, format)
        assert.ok(rules.description, format)
    }

    assert.equal(
        describeTournamentFormat({ format: "world_cup_2026" }).qualification
            .bestThirds,
        8
    )
    assert.equal(
        describeTournamentFormat({ format: "super_cup" }).qualification
            .bestThirds,
        4
    )
    assert.deepEqual(
        describeTournamentFormat({ format: "super_cup" }).qualification
            .firstsFacingThirds,
        ["B", "F", "E", "C"]
    )
    assert.equal(
        describeTournamentFormat({ format: "world_cup_2026" }).qualification
            .firstsFacingThirds.length,
        8
    )
    assert.match(
        describeTournamentFormat({ format: "super_cup" }).qualification.note,
        /mismo grupo/
    )
    for (const format of ["world_cup", "champions_league"]) {
        const { qualification } = describeTournamentFormat({ format })
        assert.equal(qualification.bestThirds, 0)
        assert.ok(!("firstsFacingThirds" in qualification), format)
    }
    assert.match(
        describeTournamentFormat({
            format: "playoff",
            playoffMode: "two_legged",
        }).knockout,
        /ida y vuelta/
    )
    assert.match(
        describeTournamentFormat({ format: "playoff", playoffMode: "single" })
            .knockout,
        /partido único/
    )
    assert.deepEqual(describeTournamentFormat({ format: "legacy" }).stages, [])
})

test("recap context returns rules, slim standings and the bracket per tournament", async () => {
    const calls = { standings: [], playin: [], playoff: [] }
    const controller = createGetRecapContext({
        retrieveTournamentIdsPlayedOnDate: async (date) => {
            calls.date = date
            return ["t-playoff", "t-league", "t-gone"]
        },
        retrieveTournamentById: async (id) =>
            ({
                "t-playoff": {
                    name: "Copa",
                    format: "playoff",
                    playoffMode: "two_legged",
                    ongoing: true,
                },
                "t-league": {
                    name: "Liga",
                    format: "league",
                    ongoing: false,
                },
            }[id] ?? null),
        retrieveStandings: async (id, playedBefore) => {
            calls.standings.push([id, playedBefore.toISOString()])
            const rows = [
                {
                    team: team(1),
                    played: 3,
                    points: 9,
                    streak: [{ outcome: "w" }],
                },
                {
                    team: team(2),
                    played: 3,
                    points: 4,
                    eliminated: true,
                    streak: [],
                },
            ]
            // Antes del día el orden era el inverso.
            const isStartOfDay =
                playedBefore.toISOString() === "2026-10-11T03:00:00.000Z"
            return {
                standings: [
                    {
                        group: undefined,
                        teams: isStartOfDay ? [...rows].reverse() : rows,
                    },
                ],
            }
        },
        retrievePlayinMatchesByTournamentId: async (id) => {
            calls.playin.push(id)
            return []
        },
        retrievePlayoffMatchesByTournamentId: async (id) => {
            calls.playoff.push(id)
            return [
                playoffMatch({
                    playoff_id: 31,
                    leg: 1,
                    played: true,
                    scoreP1: 2,
                    scoreP2: 1,
                    outcome: { draw: false },
                    series: { status: "awaiting_leg2", aggregate: [] },
                }),
                playoffMatch({ playoff_id: 31, leg: 2 }),
                // Ronda futura sin equipos: se omite.
                {
                    type: "playoff",
                    played: false,
                    playoff_id: 32,
                    leg: 1,
                    teamP1: {},
                    teamP2: {},
                },
            ]
        },
    })
    const response = createResponse()

    await controller({ query: { date: "2026-10-11" } }, response)

    assert.equal(calls.date, "2026-10-11")
    assert.equal(response.body.success, true)
    assert.equal(response.body.date, "2026-10-11")
    // t-gone no existe más y se descarta.
    assert.equal(response.body.data.length, 2)

    const [cup, league] = response.body.data

    assert.equal(cup.tournament, "Copa")
    assert.equal(cup.ongoing, true)
    assert.deepEqual(cup.rules.stages, ["playoff"])
    assert.deepEqual(cup.standings, [])
    assert.deepEqual(calls.standings, [
        ["t-league", "2026-10-12T03:00:00.000Z"],
        ["t-league", "2026-10-11T03:00:00.000Z"],
    ])
    assert.equal(cup.bracket.length, 1)
    assert.equal(cup.bracket[0].playoffId, 31)
    assert.equal(cup.bracket[0].round, "final")
    assert.equal(cup.bracket[0].series.status, "awaiting_leg2")
    assert.deepEqual(
        cup.bracket[0].matches.map(({ leg, played }) => ({ leg, played })),
        [
            { leg: 1, played: true },
            { leg: 2, played: false },
        ]
    )
    assert.equal(cup.bracket[0].matches[1].outcome, null)

    assert.equal(league.format, "league")
    assert.deepEqual(league.bracket, [])
    assert.deepEqual(calls.playoff, ["t-playoff"])
    assert.equal(league.standings[0].group, null)
    assert.deepEqual(league.asOf, {
        standings: "2026-10-11",
        playin: "current",
        bracket: "current",
    })
    assert.deepEqual(
        league.standings[0].teams.map(
            ({ position, previousPosition, points, eliminated }) => ({
                position,
                previousPosition,
                points,
                eliminated,
            })
        ),
        [
            {
                position: 1,
                previousPosition: 2,
                points: 9,
                eliminated: undefined,
            },
            { position: 2, previousPosition: 1, points: 4, eliminated: true },
        ]
    )
    assert.ok(
        league.standings[0].teams.every((row) => !("streak" in row)),
        "streak must be stripped"
    )
})

test("recap context loads the play-in only for league_playin_playoff", async () => {
    const calls = { playin: [] }
    const controller = createGetRecapContext({
        retrieveTournamentIdsPlayedOnDate: async () => ["t1"],
        retrieveTournamentById: async () => ({
            name: "Liga APA",
            format: "league_playin_playoff",
            ongoing: true,
        }),
        retrieveStandings: async () => ({
            standings: [{ group: "A", teams: [] }],
        }),
        retrievePlayinMatchesByTournamentId: async (id) => {
            calls.playin.push(id)
            return [
                {
                    toObject: () => ({
                        type: "playin",
                        played: true,
                        playoff_id: 1,
                        teamP1: team(7),
                        teamP2: team(8),
                        scoreP1: 1,
                        scoreP2: 0,
                        outcome: { draw: false },
                    }),
                },
            ]
        },
        retrievePlayoffMatchesByTournamentId: async () => [],
    })
    const response = createResponse()

    await controller({ query: { date: "2026-10-11" } }, response)

    const [context] = response.body.data
    assert.deepEqual(calls.playin, ["t1"])
    assert.equal(context.standings[0].group, "A")
    assert.equal(context.playin.length, 1)
    assert.equal(context.playin[0].scoreP1, 1)
    assert.equal(context.rules.qualification.directPerGroup, 6)
})

test("recap context answers an empty list when nobody played", async () => {
    const controller = createGetRecapContext({
        retrieveTournamentIdsPlayedOnDate: async () => [],
    })
    const response = createResponse()

    await controller({ query: { date: "2026-10-11" } }, response)

    assert.deepEqual(response.body, {
        success: true,
        date: "2026-10-11",
        data: [],
    })
})

const withApp = async (callback) => {
    const app = createApp({
        ensureDatabase: async () => {},
        getDatabaseStatus: () => ({ state: "connected", name: "apa_test" }),
    })
    const server = app.listen(0)
    await once(server, "listening")

    try {
        await callback(`http://127.0.0.1:${server.address().port}`)
    } finally {
        server.close()
        await once(server, "close")
    }
}

test("GET /api/recaps/context is routed before :date and queries the Argentina day", async (t) => {
    let filter
    t.mock.method(matchesModel, "distinct", async (field, query) => {
        filter = { field, query }
        return []
    })

    await withApp(async (baseUrl) => {
        const response = await globalThis.fetch(
            `${baseUrl}/api/recaps/context?date=2026-10-11`
        )

        assert.equal(response.status, 200)
        assert.deepEqual(await response.json(), {
            success: true,
            date: "2026-10-11",
            data: [],
        })
    })

    assert.equal(filter.field, "tournament.id")
    assert.equal(filter.query.played, true)
    assert.deepEqual(filter.query.valid, { $ne: false })
    // 11/10 00:00 ART = 03:00 UTC; el día siguiente cierra el rango.
    assert.deepEqual(filter.query.playedAt, {
        $gte: new Date("2026-10-11T03:00:00.000Z"),
        $lt: new Date("2026-10-12T03:00:00.000Z"),
    })
})

test("GET /api/recaps/context requires a valid YYYY-MM-DD date and rejects extras", async (t) => {
    t.mock.method(matchesModel, "distinct", async () => [])

    await withApp(async (baseUrl) => {
        for (const query of [
            "",
            "date=11-10-2026",
            "date=10-11-2026",
            "date=2026-02-30",
            "date=2026-10-11&extra=1",
        ]) {
            const response = await globalThis.fetch(
                `${baseUrl}/api/recaps/context?${query}`
            )
            assert.equal(response.status, 400, query)
        }
    })
})

test("recap context reuses the real standings controller for a league", async (t) => {
    const tournamentsModel = require("../dao/models/tournaments")
    const teamA = { id: 1, name: "Racing" }
    const teamB = { id: 2, name: "Boca" }
    const teamC = { id: 3, name: "River" }
    const entry = (team, id) => ({
        team,
        player: { id, name: `Jugador ${id}` },
    })
    const tournament = {
        name: "Liga APA",
        format: "league",
        ongoing: true,
        teams: [entry(teamA, 1), entry(teamB, 2), entry(teamC, 3)],
    }
    const played = {
        playerP1: { id: 1, name: "Jugador 1" },
        teamP1: teamA,
        scoreP1: 3,
        playerP2: { id: 2, name: "Jugador 2" },
        teamP2: teamB,
        scoreP2: 0,
        played: true,
        outcome: { draw: false, teamThatWon: teamA, teamThatLost: teamB },
    }

    t.mock.method(matchesModel, "distinct", async () => ["t1"])
    t.mock.method(tournamentsModel, "findById", async () => tournament)
    t.mock.method(matchesModel, "find", async (filter) =>
        filter.played ? [played] : []
    )

    await withApp(async (baseUrl) => {
        const response = await globalThis.fetch(
            `${baseUrl}/api/recaps/context?date=2026-10-11`
        )
        const body = await response.json()

        assert.equal(response.status, 200)
        const [context] = body.data
        const [table] = context.standings
        assert.equal(context.format, "league")
        assert.deepEqual(
            table.teams.map(({ position, team, points }) => [
                position,
                team.name,
                points,
            ]),
            [
                [1, "Racing", 3],
                [2, "River", 0],
                [3, "Boca", 0],
            ]
        )
        assert.ok(table.teams.every((row) => !("streak" in row)))
        assert.deepEqual(context.bracket, [])
    })
})

test("recap context leaves out matches played after the date and reports the previous position", async (t) => {
    const tournamentsModel = require("../dao/models/tournaments")
    const teamA = { id: 1, name: "Racing" }
    const teamB = { id: 2, name: "Boca" }
    const teamC = { id: 3, name: "River" }
    const entry = (team, id) => ({
        team,
        player: { id, name: `Jugador ${id}` },
    })
    const result = (winner, loser, scoreWinner, playedAt) => ({
        playerP1: { id: winner.id, name: `Jugador ${winner.id}` },
        teamP1: winner,
        scoreP1: scoreWinner,
        playerP2: { id: loser.id, name: `Jugador ${loser.id}` },
        teamP2: loser,
        scoreP2: 0,
        played: true,
        playedAt: new Date(playedAt),
        outcome: { draw: false, teamThatWon: winner, teamThatLost: loser },
    })

    t.mock.method(matchesModel, "distinct", async () => ["t1"])
    t.mock.method(tournamentsModel, "findById", async () => ({
        name: "Liga APA",
        format: "league",
        ongoing: true,
        teams: [entry(teamA, 1), entry(teamB, 2), entry(teamC, 3)],
    }))
    t.mock.method(matchesModel, "find", async (filter) =>
        filter.played
            ? [
                  // Antes del día, el día y después del día (hora Argentina).
                  result(teamA, teamB, 3, "2026-10-10T20:00:00Z"),
                  result(teamB, teamC, 1, "2026-10-11T20:00:00Z"),
                  result(teamC, teamA, 5, "2026-10-12T20:00:00Z"),
              ]
            : []
    )

    await withApp(async (baseUrl) => {
        const response = await globalThis.fetch(
            `${baseUrl}/api/recaps/context?date=2026-10-11`
        )
        const [context] = (await response.json()).data
        const rows = context.standings[0].teams

        // Sin el 5-0 de River del día 12: Racing 3, Boca 3, River 0.
        assert.deepEqual(
            rows.map(({ team, position, previousPosition, points }) => [
                team.name,
                position,
                previousPosition,
                points,
            ]),
            [
                ["Racing", 1, 1, 3],
                ["Boca", 2, 3, 3],
                ["River", 3, 2, 0],
            ]
        )
        // River aún puede sumar 3 puntos con el partido que, a esa fecha,
        // todavía no se había jugado, así que no está eliminado.
        assert.equal(rows[2].eliminated, undefined)
    })
})

test("recap context gives no previousPosition when nobody had played before that day", async () => {
    const controller = createGetRecapContext({
        retrieveTournamentIdsPlayedOnDate: async () => ["t1"],
        retrieveTournamentById: async () => ({
            name: "Liga APA",
            format: "league",
            ongoing: true,
        }),
        retrieveStandings: async () => ({
            standings: [
                {
                    group: undefined,
                    teams: [
                        { team: team(1), played: 0, points: 0 },
                        { team: team(2), played: 0, points: 0 },
                    ],
                },
            ],
        }),
    })
    const response = createResponse()

    await controller({ query: { date: "2026-10-11" } }, response)

    assert.deepEqual(
        response.body.data[0].standings[0].teams.map(
            ({ previousPosition }) => previousPosition
        ),
        [null, null]
    )
})

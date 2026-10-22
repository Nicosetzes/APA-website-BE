process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const { once } = require("node:events")
const test = require("node:test")

const { createApp } = require("../app")
const matchesModel = require("../dao/models/matches")
const { createGetRecapContext } = require("../controller/getRecapContext")
const { describeTournamentFormat } = require("../config/tournamentFormatRules")
const retrieveRatingMatches = require("../service/retrieveRatingMatches")
const { findMatchesPlayedOnDate } = require("../dao")

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
        /ida y vuelta.*gol de oro/
    )
    assert.match(
        describeTournamentFormat({ format: "playoff", playoffMode: "single" })
            .knockout,
        /partido único.*gol de plata.*penales/
    )
    assert.deepEqual(describeTournamentFormat({ format: "legacy" }).stages, [])
})

const noInsights = {
    retrieveRatingsTimeline: async () => ({ events: [] }),
    retrieveMatchesPlayedOnDate: async () => [],
}

test("recap context returns rules, slim standings and the bracket per tournament", async () => {
    const calls = { standings: [], playin: [], playoff: [] }
    const controller = createGetRecapContext({
        ...noInsights,
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
                playoffMatch({
                    playoff_id: 31,
                    leg: 2,
                    played: true,
                    scoreP1: 0,
                    scoreP2: 2,
                    valid: false,
                    outcome: { draw: false },
                }),
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
        cup.bracket[0].matches.map(({ leg, played, valid }) => ({
            leg,
            played,
            valid,
        })),
        [
            { leg: 1, played: true, valid: true },
            // Cargado sólo para que avance el cuadro (W/O): valid false.
            { leg: 2, played: true, valid: false },
        ]
    )
    assert.deepEqual(cup.bracket[0].matches[1].outcome, { draw: false })

    assert.deepEqual(cup.matchInsights, [])
    assert.deepEqual(league.matchInsights, [])
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
        ...noInsights,
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

// `matchesModel.find(...)` se puede esperar directo o encadenar `.lean()`
// (historial de ratings y partidos del día para `matchInsights`).
const query = (rows) =>
    Object.assign(Promise.resolve(rows), { lean: async () => rows })

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

    retrieveRatingMatches.invalidate()
    t.mock.method(matchesModel, "distinct", async () => ["t1"])
    t.mock.method(tournamentsModel, "findById", async () => tournament)
    t.mock.method(matchesModel, "find", (filter) =>
        query(filter.played ? [played] : [])
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

    retrieveRatingMatches.invalidate()
    t.mock.method(matchesModel, "distinct", async () => ["t1"])
    t.mock.method(tournamentsModel, "findById", async () => ({
        name: "Liga APA",
        format: "league",
        ongoing: true,
        teams: [entry(teamA, 1), entry(teamB, 2), entry(teamC, 3)],
    }))
    t.mock.method(matchesModel, "find", (filter) =>
        query(
            filter.played
                ? [
                      // Antes del día, el día y después del día (hora Argentina).
                      result(teamA, teamB, 3, "2026-10-10T20:00:00Z"),
                      result(teamB, teamC, 1, "2026-10-11T20:00:00Z"),
                      result(teamC, teamA, 5, "2026-10-12T20:00:00Z"),
                  ]
                : []
        )
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
        ...noInsights,
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

const insightEvent = (matchId, time, overrides = {}) => ({
    matchId,
    time: Date.parse(time),
    tournament: "x",
    type: "regular",
    scoreP1: 2,
    scoreP2: 1,
    expectedP1: 0.3,
    resultP1: 1,
    delta: 6,
    teamAdjustment: 4,
    p1: { id: "1", name: "Jugador 1", before: 1000, games: 5, teamOverall: 80 },
    p2: { id: "2", name: "Jugador 2", before: 1100, games: 5, teamOverall: 84 },
    ...overrides,
})

const insightMatch = (id, tournamentId, overrides = {}) => ({
    _id: id,
    tournament: { id: tournamentId },
    type: "regular",
    scoreP1: 2,
    scoreP2: 1,
    playerP1: player(1),
    teamP1: team(11),
    playerP2: player(2),
    teamP2: team(12),
    outcome: { draw: false, playerThatWon: { id: 1 } },
    ...overrides,
})

const insightTournaments = {
    "t-league": { name: "Liga", format: "league", ongoing: true },
    "t-cup": {
        name: "Copa",
        format: "playoff",
        playoffMode: "single",
        ongoing: true,
    },
    "t-twolegs": {
        name: "Copa ida y vuelta",
        format: "playoff",
        playoffMode: "two_legged",
        ongoing: true,
    },
    "t-empty": { name: "Sin partidos", format: "playoff", ongoing: true },
}

test("recap context adds matchInsights per tournament from one day-wide read", async () => {
    const calls = { timeline: 0, dayMatches: [] }
    const controller = createGetRecapContext({
        retrieveTournamentIdsPlayedOnDate: async () => [
            "t-league",
            "t-cup",
            "t-twolegs",
            "t-empty",
        ],
        retrieveTournamentById: async (id) => insightTournaments[id],
        retrieveStandings: async () => ({ standings: [] }),
        retrievePlayinMatchesByTournamentId: async () => [],
        retrievePlayoffMatchesByTournamentId: async () => [],
        retrieveRatingsTimeline: async () => {
            calls.timeline += 1
            return {
                events: [
                    // 02:59:59Z del 21: es del día anterior en Argentina.
                    insightEvent("before", "2026-10-21T02:59:59Z"),
                    // 03:00:00Z del 21: primer instante del día (entra).
                    insightEvent("league-1", "2026-10-21T03:00:00Z"),
                    insightEvent("cup-1", "2026-10-21T20:00:00Z", {
                        type: "playoff",
                        scoreP1: 1,
                        scoreP2: 1,
                        resultP1: 0.5,
                        delta: -1.5,
                    }),
                    insightEvent("twolegs-1", "2026-10-22T00:13:40Z", {
                        type: "playoff",
                        scoreP1: 1,
                        scoreP2: 1,
                        resultP1: 0.5,
                    }),
                    // 02:59:59Z del 22: último instante del día (entra).
                    insightEvent("league-2", "2026-10-22T02:59:59Z", {
                        scoreP1: 0,
                        scoreP2: 7,
                        resultP1: 0,
                        expectedP1: 0.79,
                        delta: -9.5,
                    }),
                    // 03:00:00Z del 22: ya es el día siguiente.
                    insightEvent("after", "2026-10-22T03:00:00Z"),
                ],
            }
        },
        retrieveMatchesPlayedOnDate: async (date) => {
            calls.dayMatches.push(date)
            return [
                insightMatch("league-2", "t-league", {
                    scoreP1: 0,
                    scoreP2: 7,
                    outcome: { draw: false, playerThatWon: { id: 2 } },
                }),
                insightMatch("league-1", "t-league"),
                insightMatch("cup-1", "t-cup", {
                    type: "playoff",
                    playoff_id: 31,
                    leg: 1,
                    scoreP1: 1,
                    scoreP2: 1,
                    outcome: {
                        draw: true,
                        penalties: true,
                        playerThatWon: { id: 2 },
                    },
                }),
                insightMatch("twolegs-1", "t-twolegs", {
                    type: "playoff",
                    playoff_id: 31,
                    leg: 1,
                    scoreP1: 1,
                    scoreP2: 1,
                    outcome: { draw: true },
                }),
                // valid:false (W.O., gol de oro): no tiene evento del motor.
                insightMatch("twolegs-wo", "t-twolegs", {
                    type: "playoff",
                    playoff_id: 31,
                    leg: 3,
                    scoreP1: 0,
                    scoreP2: 1,
                }),
            ]
        },
    })
    const response = createResponse()

    await controller({ query: { date: "2026-10-21" } }, response)

    assert.equal(calls.timeline, 1)
    assert.deepEqual(calls.dayMatches, ["2026-10-21"])

    const byName = Object.fromEntries(
        response.body.data.map((context) => [context.tournament, context])
    )

    // Orden por playedAt ascendente, aunque la consulta traiga otro orden.
    assert.deepEqual(
        byName.Liga.matchInsights.map(({ matchId, playedAt }) => [
            matchId,
            playedAt,
        ]),
        [
            ["league-1", "2026-10-21T03:00:00.000Z"],
            ["league-2", "2026-10-22T02:59:59.000Z"],
        ]
    )
    const [, upset] = byName.Liga.matchInsights
    assert.equal(upset.winner, "p2")
    assert.equal(upset.expectedP1, 0.79)
    assert.equal(upset.winnerExpectedScore, 0.21)
    assert.equal(upset.ratingSwing, 9.5)
    assert.equal(upset.kind, "expected_points")
    assert.equal(upset.p1.teamOverall, 80)
    assert.equal(upset.teamAdjustment, 4)

    const [penalties] = byName.Copa.matchInsights
    assert.equal(byName.Copa.matchInsights.length, 1)
    assert.equal(penalties.kind, "advance")
    assert.equal(penalties.playoffId, 31)
    assert.equal(penalties.scoreP1, penalties.scoreP2)
    assert.equal(penalties.winner, "p2")
    assert.equal(penalties.winnerExpectedScore, 0.7)

    const [draw] = byName["Copa ida y vuelta"].matchInsights
    assert.equal(byName["Copa ida y vuelta"].matchInsights.length, 1)
    assert.equal(draw.kind, "expected_points")
    assert.equal(draw.leg, 1)
    assert.equal(draw.winner, "draw")
    assert.equal(draw.winnerExpectedScore, null)

    assert.deepEqual(byName["Sin partidos"].matchInsights, [])
})

test("recap context does not read the day's matches when no event falls in the day", async () => {
    let dayMatchesCalls = 0
    const controller = createGetRecapContext({
        retrieveTournamentIdsPlayedOnDate: async () => ["t-league"],
        retrieveTournamentById: async (id) => insightTournaments[id],
        retrieveStandings: async () => ({ standings: [] }),
        retrieveRatingsTimeline: async () => ({
            events: [
                insightEvent("other-day", "2026-10-25T12:00:00Z"),
                {
                    ...insightEvent("no-date", "2026-10-21T12:00:00Z"),
                    time: null,
                },
            ],
        }),
        retrieveMatchesPlayedOnDate: async () => {
            dayMatchesCalls += 1
            return []
        },
    })
    const response = createResponse()

    await controller({ query: { date: "2026-10-21" } }, response)

    assert.equal(dayMatchesCalls, 0)
    assert.deepEqual(response.body.data[0].matchInsights, [])
})

test("recap context does not touch ratings when nobody played", async () => {
    const controller = createGetRecapContext({
        retrieveTournamentIdsPlayedOnDate: async () => [],
        retrieveRatingsTimeline: async () => {
            throw new Error("no debería leer ratings")
        },
        retrieveMatchesPlayedOnDate: async () => {
            throw new Error("no debería leer partidos")
        },
    })
    const response = createResponse()

    await controller({ query: { date: "2026-10-21" } }, response)

    assert.deepEqual(response.body.data, [])
})

test("recap context fails instead of hiding a ratings read error", async () => {
    const controller = createGetRecapContext({
        retrieveTournamentIdsPlayedOnDate: async () => ["t-league"],
        retrieveTournamentById: async (id) => insightTournaments[id],
        retrieveStandings: async () => ({ standings: [] }),
        retrieveRatingsTimeline: async () => {
            throw new Error("ratings caídos")
        },
    })

    await assert.rejects(
        controller({ query: { date: "2026-10-21" } }, createResponse()),
        /ratings caídos/
    )
})

test("findMatchesPlayedOnDate queries played, valid matches of the Argentina day once", async (t) => {
    const calls = { find: [], lean: 0 }
    t.mock.method(matchesModel, "find", (filter, projection) => {
        calls.find.push({ filter, projection })
        return {
            lean: async () => {
                calls.lean += 1
                return [{ _id: "m1" }]
            },
        }
    })

    const rows = await findMatchesPlayedOnDate("2026-10-11")

    assert.deepEqual(rows, [{ _id: "m1" }])
    assert.equal(calls.find.length, 1)
    assert.equal(calls.lean, 1)
    assert.deepEqual(calls.find[0].filter, {
        played: true,
        valid: { $ne: false },
        playedAt: {
            $gte: new Date("2026-10-11T03:00:00.000Z"),
            $lt: new Date("2026-10-12T03:00:00.000Z"),
        },
    })
    for (const field of [
        "tournament.id",
        "playoff_id",
        "leg",
        "outcome.playerThatWon.id",
        "teamP1.name",
    ]) {
        assert.ok(calls.find[0].projection.split(" ").includes(field), field)
    }
})

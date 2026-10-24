process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
    createGetStandingsTableByTournamentId,
} = require("../controller/getStandingsTableByTournamentId")
const {
    buildStandingsProgress,
} = require("../controller/getTournamentRecapContext/standingsProgress")
const { LEAGUE_PROGRESS_MIN_MATCHES } = require("../config/tournamentRecap")
const { describeTournamentFormat } = require("../config/tournamentFormatRules")
const {
    LEO,
    MAX,
    NICO,
    SANTI,
    mkMatch,
    mkTournament,
    team,
} = require("./fixtures/tournamentRecap")

const TEAMS = {
    liverpool: team(1, "Liverpool"),
    chelsea: team(2, "Chelsea"),
    bayern: team(3, "Bayern"),
    milan: team(4, "Milan"),
    ajax: team(5, "Ajax"),
    porto: team(6, "Porto"),
}

const entry = (teamRef, player, group) => ({ team: teamRef, player, group })

const leagueTeams = [
    entry(TEAMS.liverpool, NICO),
    entry(TEAMS.chelsea, MAX),
    entry(TEAMS.bayern, LEO),
    entry(TEAMS.milan, SANTI),
]

// Liga de 4 equipos, todos contra todos (6 partidos).
const leagueMatches = () => {
    const pairs = [
        [NICO, TEAMS.liverpool, 2, MAX, TEAMS.chelsea, 0],
        [LEO, TEAMS.bayern, 1, SANTI, TEAMS.milan, 1],
        [NICO, TEAMS.liverpool, 0, LEO, TEAMS.bayern, 1],
        [MAX, TEAMS.chelsea, 3, SANTI, TEAMS.milan, 1],
        [NICO, TEAMS.liverpool, 1, SANTI, TEAMS.milan, 0],
        [MAX, TEAMS.chelsea, 2, LEO, TEAMS.bayern, 0],
    ]

    return pairs.map(([p1, t1, s1, p2, t2, s2], index) =>
        mkMatch({ n: index + 1, p1, t1, s1, p2, t2, s2 })
    )
}

const rulesOf = (format) => describeTournamentFormat({ format })

const progress = ({ tournament, matches, playoffTeamIds }) =>
    buildStandingsProgress({
        tournament,
        matches,
        rules: rulesOf(tournament.format),
        playoffTeamIds,
    })

test("the final table orders by points, goal difference and goals for", () => {
    const tournament = mkTournament({ teams: leagueTeams })
    const { standings } = progress({
        tournament,
        matches: leagueMatches(),
    })
    const [group] = standings.final

    assert.equal(group.group, null)
    // Liverpool y Chelsea: 6 pts y +2; Chelsea metió 5 goles y Liverpool 3.
    assert.deepEqual(
        group.teams.map(({ team: name, points, gd }) => [name, points, gd]),
        [
            ["Chelsea", 6, 2],
            ["Liverpool", 6, 2],
            ["Bayern", 4, -1],
            ["Milan", 1, -3],
        ]
    )
    assert.deepEqual(
        group.teams.map(({ position }) => position),
        [1, 2, 3, 4]
    )
    assert.deepEqual(Object.keys(group.teams[0]), [
        "position",
        "team",
        "teamId",
        "player",
        "played",
        "wins",
        "draws",
        "losses",
        "gf",
        "ga",
        "gd",
        "points",
        "qualification",
    ])
})

test("a tie on points and goal difference is broken by goals for", () => {
    const tournament = mkTournament({ teams: leagueTeams.slice(0, 3) })
    // Los tres suman 3 puntos; Chelsea y Bayern empatan también la diferencia.
    const matches = [
        mkMatch({
            n: 1,
            p1: NICO,
            t1: TEAMS.liverpool,
            s1: 3,
            p2: MAX,
            t2: TEAMS.chelsea,
            s2: 2,
        }),
        mkMatch({
            n: 2,
            p1: LEO,
            t1: TEAMS.bayern,
            s1: 3,
            p2: NICO,
            t2: TEAMS.liverpool,
            s2: 0,
        }),
        mkMatch({
            n: 3,
            p1: MAX,
            t1: TEAMS.chelsea,
            s1: 2,
            p2: LEO,
            t2: TEAMS.bayern,
            s2: 0,
        }),
    ]
    const { standings } = progress({ tournament, matches })

    // Bayern y Chelsea: 3 pts y +1; Chelsea metió 4 goles y Bayern 3.
    assert.deepEqual(
        standings.final[0].teams.map(({ team: name, points, gd, gf }) => [
            name,
            points,
            gd,
            gf,
        ]),
        [
            ["Chelsea", 3, 1, 4],
            ["Bayern", 3, 1, 3],
            ["Liverpool", 3, -2, 3],
        ]
    )
})

test("matches with valid false count in the table, like the table endpoint", () => {
    const tournament = mkTournament({ teams: leagueTeams.slice(0, 2) })
    const matches = [
        mkMatch({
            n: 1,
            p1: NICO,
            t1: TEAMS.liverpool,
            s1: 3,
            p2: MAX,
            t2: TEAMS.chelsea,
            s2: 0,
            valid: false,
        }),
    ]
    const { standings } = progress({ tournament, matches })

    assert.deepEqual(
        standings.final[0].teams.map(({ team: name, points }) => [
            name,
            points,
        ]),
        [
            ["Liverpool", 3],
            ["Chelsea", 0],
        ]
    )
})

// Partidos de una tabla de dos equipos según un patrón: "L" gana el local
// (p1), "V" gana el visitante (p2) y "D" empata. `from` es el número del primer
// partido.
const duel = (pattern, { group, from = 1, home, away } = {}) => {
    const [p1, t1] = home ?? [NICO, TEAMS.liverpool]
    const [p2, t2] = away ?? [MAX, TEAMS.chelsea]

    return [...pattern].map((result, index) =>
        mkMatch({
            n: from + index,
            group,
            p1,
            t1,
            s1: result === "V" ? 0 : 1,
            p2,
            t2,
            s2: result === "L" ? 0 : 1,
            legDraw: true,
        })
    )
}

const duelTeams = leagueTeams.slice(0, 2)

test("tables below the minimum have no progress, leaderChanges nor closeRace", () => {
    // Liga de 4 equipos con 6 partidos (por debajo de LEAGUE_PROGRESS_MIN_MATCHES).
    const { standings } = progress({
        tournament: mkTournament({ teams: leagueTeams }),
        matches: leagueMatches(),
    })

    assert.deepEqual(standings.progress, [])
    assert.deepEqual(standings.leaderChanges, {})
    assert.deepEqual(standings.closeRace, [])
    // La tabla final sí se informa.
    assert.equal(standings.final[0].teams.length, 4)
    assert.equal(standings.final[0].teams[0].played, 3)
})

test("a world cup with groups of 6 matches has no progress nor closeRace", () => {
    const teams = [
        entry(TEAMS.liverpool, NICO, "A"),
        entry(TEAMS.chelsea, MAX, "A"),
        entry(TEAMS.bayern, LEO, "B"),
        entry(TEAMS.milan, SANTI, "B"),
    ]
    const { standings, topTwoByGroup } = progress({
        tournament: mkTournament({
            format: "world_cup",
            teams,
            groups: [{}, {}],
        }),
        matches: [
            ...duel("LLLLLL", { group: "A" }),
            ...duel("LLLLLL", {
                group: "B",
                from: 7,
                home: [LEO, TEAMS.bayern],
                away: [SANTI, TEAMS.milan],
            }),
        ],
    })

    assert.deepEqual(standings.progress, [])
    assert.deepEqual(standings.leaderChanges, {})
    assert.deepEqual(standings.closeRace, [])
    assert.deepEqual(
        standings.final.map(({ group, teams: rows }) => [
            group,
            rows[0].points,
        ]),
        [
            ["A", 18],
            ["B", 18],
        ]
    )
    assert.equal(topTwoByGroup.size, 2)
})

test("the minimum is 30 matches per table", () => {
    const run = (count) =>
        progress({
            tournament: mkTournament({ teams: duelTeams }),
            matches: duel("L".repeat(count)),
        }).standings

    assert.equal(LEAGUE_PROGRESS_MIN_MATCHES, 30)
    assert.deepEqual(run(29).progress, [])
    assert.deepEqual(run(29).closeRace, [])

    const exact = run(30)

    assert.equal(exact.progress.length, 4)
    assert.equal(exact.closeRace.length, 1)
    assert.equal(exact.closeRace[0].matchesPlayed, 20)
    assert.equal(exact.closeRace[0].matchesLeft, 10)
})

test("leader progress is reported at 25, 50, 75 and 100 percent of the matches", () => {
    // 40 partidos (algunos valid false: la tabla los cuenta).
    const matches = duel("L".repeat(40)).map((match, index) => ({
        ...match,
        valid: index % 5 !== 0,
    }))
    const { standings } = progress({
        tournament: mkTournament({ teams: duelTeams }),
        matches,
    })

    assert.deepEqual(
        standings.progress.map(({ afterPct, leaders: [leader] }) => [
            afterPct,
            leader.matchesPlayed,
            leader.matchesLeft,
        ]),
        [
            [25, 10, 30],
            [50, 20, 20],
            [75, 30, 10],
            [100, 40, 0],
        ]
    )
    assert.deepEqual(standings.progress[3].leaders[0], {
        group: null,
        team: "Liverpool",
        player: "Nico",
        points: 120,
        matchesPlayed: 40,
        matchesLeft: 0,
    })
    // matchesPlayed + matchesLeft es el total de la tabla en todos los puntos.
    const tableTotal =
        standings.final[0].teams.reduce((sum, row) => sum + row.played, 0) / 2

    assert.equal(tableTotal, 40)
    for (const { leaders } of standings.progress) {
        for (const leader of leaders) {
            assert.equal(leader.matchesPlayed + leader.matchesLeft, tableTotal)
        }
    }
    assert.equal(standings.closeRace[0].matchesPlayed, 30)
    assert.equal(standings.closeRace[0].matchesLeft, 10)
})

test("closeRace of a league is taken with 10 matches left", () => {
    // 209 partidos: Liverpool gana los primeros 199 (597 puntos) y empata los
    // 10 últimos. closeRace mira la tabla a los 199, antes de esos empates.
    const { standings } = progress({
        tournament: mkTournament({ teams: duelTeams }),
        matches: duel(`${"L".repeat(199)}${"D".repeat(10)}`),
    })

    assert.deepEqual(standings.closeRace, [
        {
            group: null,
            leader: "Liverpool",
            leaderTeamId: TEAMS.liverpool.id,
            gapToSecond: 597,
            matchesPlayed: 199,
            matchesLeft: 10,
        },
    ])
    assert.equal(standings.final[0].teams[0].points, 607)
    // progress sigue en porcentajes.
    assert.deepEqual(
        standings.progress.map(({ afterPct }) => afterPct),
        [25, 50, 75, 100]
    )
})

test("a group of 53 matches gets entries and a group of 10 gets none", () => {
    const teams = [
        entry(TEAMS.liverpool, NICO, "A"),
        entry(TEAMS.chelsea, MAX, "A"),
        entry(TEAMS.bayern, LEO, "B"),
        entry(TEAMS.milan, SANTI, "B"),
    ]
    const { standings } = progress({
        tournament: mkTournament({
            format: "league_playin_playoff",
            teams,
            groups: [{}, {}],
        }),
        matches: [
            ...duel("L".repeat(53), { group: "A" }),
            ...duel("L".repeat(10), {
                group: "B",
                from: 54,
                home: [LEO, TEAMS.bayern],
                away: [SANTI, TEAMS.milan],
            }),
        ],
    })

    // 53 partidos: 25 % = 14, 50 % = 27, 75 % = 40 y 100 % = 53.
    assert.deepEqual(
        standings.progress.map(({ leaders }) =>
            leaders.map(({ group, matchesPlayed, matchesLeft }) => [
                group,
                matchesPlayed,
                matchesLeft,
            ])
        ),
        [[["A", 14, 39]], [["A", 27, 26]], [["A", 40, 13]], [["A", 53, 0]]]
    )
    assert.deepEqual(
        standings.closeRace.map(({ group, matchesPlayed, matchesLeft }) => [
            group,
            matchesPlayed,
            matchesLeft,
        ]),
        [["A", 43, 10]]
    )
    assert.deepEqual(Object.keys(standings.leaderChanges), ["A"])
    // La tabla final trae los dos grupos.
    assert.deepEqual(
        standings.final.map(({ group }) => group),
        ["A", "B"]
    )
})

test("leader changes are counted after the first quarter of the matches", () => {
    // 30 partidos: Liverpool gana 10, Chelsea 12 (pasa al frente en el 21) y
    // Liverpool 8 más (vuelve al frente en el 25). El arranque no cuenta.
    const { standings } = progress({
        tournament: mkTournament({ teams: duelTeams }),
        matches: duel(`${"L".repeat(10)}${"V".repeat(12)}${"L".repeat(8)}`),
    })

    assert.equal(standings.leaderChanges.all, 2)
    assert.equal(standings.closeRace.length, 1)
    assert.equal(standings.closeRace[0].matchesPlayed, 20)
    assert.equal(standings.closeRace[0].matchesLeft, 10)
})

test("qualification follows the format rules", () => {
    // league_playin_playoff: 1 a 6 directo, 7 a 10 play-in, el resto eliminado.
    const teams = Array.from({ length: 12 }, (_, index) =>
        entry(team(index + 1, `Equipo ${index + 1}`), NICO, "A")
    )
    const matches = []
    for (let i = 0; i < 12; i++) {
        // Equipo i+1 le gana a todos los de abajo: tabla sin empates.
        for (let j = i + 1; j < 12; j++) {
            matches.push(
                mkMatch({
                    n: matches.length + 1,
                    group: "A",
                    p1: NICO,
                    t1: teams[i].team,
                    s1: 1,
                    p2: LEO,
                    t2: teams[j].team,
                    s2: 0,
                })
            )
        }
    }
    const { standings } = progress({
        tournament: mkTournament({
            format: "league_playin_playoff",
            teams,
            groups: [{}],
        }),
        matches,
    })

    assert.deepEqual(
        standings.final[0].teams.map(({ qualification }) => qualification),
        [
            ...Array(6).fill("direct"),
            ...Array(4).fill("playin"),
            "eliminated",
            "eliminated",
        ]
    )

    // Fase de grupos con cuadro: 2 directos; el tercero que juega el playoff es
    // "best_third" y el que no, eliminado. Una liga no tiene clasificación.
    const groupTeams = [
        entry(TEAMS.liverpool, NICO, "A"),
        entry(TEAMS.chelsea, MAX, "A"),
        entry(TEAMS.bayern, LEO, "A"),
        entry(TEAMS.milan, SANTI, "A"),
    ]
    const groupMatches = leagueMatches().map((match) => ({
        ...match,
        group: "A",
    }))
    const withThirds = progress({
        tournament: mkTournament({
            format: "world_cup_2026",
            teams: groupTeams,
            groups: [{}],
        }),
        matches: groupMatches,
        playoffTeamIds: new Set(["3"]),
    })

    assert.deepEqual(
        withThirds.standings.final[0].teams.map(
            ({ team: name, qualification }) => [name, qualification]
        ),
        [
            ["Chelsea", "direct"],
            ["Liverpool", "direct"],
            ["Bayern", "best_third"],
            ["Milan", "eliminated"],
        ]
    )

    const league = progress({
        tournament: mkTournament({ teams: leagueTeams }),
        matches: leagueMatches(),
    })

    assert.ok(
        league.standings.final[0].teams.every(
            ({ qualification }) => qualification === null
        )
    )
})

test("formats without a regular phase have no standings", () => {
    const result = progress({
        tournament: mkTournament({ format: "playoff", teams: leagueTeams }),
        matches: [],
    })

    assert.equal(result.standings, null)
    assert.equal(result.topTwoByGroup.size, 0)
})

test("topTwoByGroup lists the final top two team ids of each group", () => {
    const { topTwoByGroup } = progress({
        tournament: mkTournament({ teams: leagueTeams }),
        matches: leagueMatches(),
    })

    assert.deepEqual([...topTwoByGroup.get(null)].sort(), ["1", "2"])
})

// --- Paridad con el endpoint de la tabla ------------------------------------

const fetchControllerTable = async (tournament, matches) => {
    let body
    const handler = createGetStandingsTableByTournamentId({
        retrieveTournamentById: async () => tournament,
        orderMatchesFromTournamentById: async (tournamentId, group) =>
            matches.filter((match) => !group || match.group === group),
        retrieveAllNotPlayedMatchesByTournamentId: async () => [],
    })

    await handler(
        { params: { tournament: String(tournament._id) }, query: {} },
        {
            status() {
                return this
            },
            send(payload) {
                body = payload
            },
        }
    )

    return body.standings
}

const comparable = (rows) =>
    rows.map((row) => [
        row.team.id ?? row.teamId,
        row.played,
        row.wins,
        row.draws,
        row.losses,
        row.goalsFor ?? row.gf,
        row.goalsAgainst ?? row.ga,
        row.points,
    ])

test("parity: the final table equals createGetStandingsTableByTournamentId for one group", async () => {
    const tournament = mkTournament({
        _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
        teams: leagueTeams,
    })
    // Partidos con empate, W.O. (`valid: false`) y desempates.
    const matches = [
        ...leagueMatches(),
        mkMatch({
            n: 7,
            p1: LEO,
            t1: TEAMS.bayern,
            s1: 2,
            p2: SANTI,
            t2: TEAMS.milan,
            s2: 2,
        }),
        mkMatch({
            n: 8,
            p1: NICO,
            t1: TEAMS.liverpool,
            s1: 0,
            p2: MAX,
            t2: TEAMS.chelsea,
            s2: 0,
            valid: false,
        }),
    ]
    const expected = (await fetchControllerTable(tournament, matches))[0].teams
    const { standings } = progress({ tournament, matches })

    assert.deepEqual(comparable(standings.final[0].teams), comparable(expected))
    // Tabla chica (8 partidos): sin evolución.
    assert.deepEqual(standings.progress, [])
})

test("parity: the final table equals the endpoint for two groups", async () => {
    const teams = [
        entry(TEAMS.liverpool, NICO, "A"),
        entry(TEAMS.chelsea, MAX, "A"),
        entry(TEAMS.bayern, LEO, "A"),
        entry(TEAMS.milan, SANTI, "B"),
        entry(TEAMS.ajax, NICO, "B"),
        entry(TEAMS.porto, LEO, "B"),
    ]
    const tournament = mkTournament({
        _id: "bbbbbbbbbbbbbbbbbbbbbbbb",
        format: "league_playin_playoff",
        teams,
        groups: [{}, {}],
    })
    const matches = [
        mkMatch({
            n: 1,
            group: "A",
            p1: NICO,
            t1: TEAMS.liverpool,
            s1: 2,
            p2: MAX,
            t2: TEAMS.chelsea,
            s2: 2,
        }),
        mkMatch({
            n: 2,
            group: "A",
            p1: LEO,
            t1: TEAMS.bayern,
            s1: 1,
            p2: NICO,
            t2: TEAMS.liverpool,
            s2: 1,
        }),
        mkMatch({
            n: 3,
            group: "A",
            p1: MAX,
            t1: TEAMS.chelsea,
            s1: 1,
            p2: LEO,
            t2: TEAMS.bayern,
            s2: 1,
        }),
        mkMatch({
            n: 4,
            group: "B",
            p1: SANTI,
            t1: TEAMS.milan,
            s1: 3,
            p2: NICO,
            t2: TEAMS.ajax,
            s2: 0,
        }),
        mkMatch({
            n: 5,
            group: "B",
            p1: NICO,
            t1: TEAMS.ajax,
            s1: 1,
            p2: LEO,
            t2: TEAMS.porto,
            s2: 0,
        }),
        mkMatch({
            n: 6,
            group: "B",
            p1: LEO,
            t1: TEAMS.porto,
            s1: 0,
            p2: SANTI,
            t2: TEAMS.milan,
            s2: 3,
            valid: false,
        }),
    ]
    const expected = await fetchControllerTable(tournament, matches)
    const { standings } = progress({ tournament, matches })

    assert.deepEqual(
        standings.final.map(({ group }) => group),
        expected.map(({ group }) => group)
    )
    standings.final.forEach((table, index) => {
        assert.deepEqual(
            comparable(table.teams),
            comparable(expected[index].teams),
            `group ${table.group}`
        )
    })
    // Grupo A empatado en todo: conserva el orden de `tournament.teams`.
    assert.deepEqual(
        standings.final[0].teams.map(({ team: name }) => name),
        expected[0].teams.map(({ team: name }) => name.name)
    )
})

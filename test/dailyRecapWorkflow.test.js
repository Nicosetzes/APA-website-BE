process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const { createGetRecapContext } = require("../controller/getRecapContext")

const WORKFLOW_PATH = path.join(__dirname, "..", "n8n", "daily-recap.json")
const workflow = JSON.parse(fs.readFileSync(WORKFLOW_PATH, "utf8"))
const nodeNamed = (name) => workflow.nodes.find((node) => node.name === name)
const jsCodeOf = (name) => nodeNamed(name).parameters.jsCode
const promptOf = () =>
    nodeNamed("Write Recap").parameters.messages.messageValues[0].message

// --- Arnés: evalúa el jsCode de un nodo Code sin n8n ---------------------------
// Día argentino fijo: 2026-10-27 va de 03:00Z a 02:59:59.999Z del día siguiente.
const DATE = "2026-10-27"
const DAY_START = Date.parse(`${DATE}T03:00:00Z`)
const DAY_END = DAY_START + 24 * 3600 * 1000 - 1

const dayHandle = {
    startOf: () => ({ toMillis: () => DAY_START }),
    endOf: () => ({ toMillis: () => DAY_END }),
    toFormat: () => DATE,
}
const NOW = { minus: () => dayHandle }
const DateTimeStub = { fromISO: () => dayHandle }

const asItems = (list) => list.map((json) => ({ json }))

// `input`: jsons que recibe el nodo. `nodes`: salida de los nodos que consulta
// con `$("Nombre")`. Devuelve el resultado del nodo.
const runCodeNode = (name, { input = [], nodes = {} } = {}) => {
    const items = asItems(input)
    const $input = { first: () => items[0], all: () => items }
    const $ = (nodeName) => {
        if (!(nodeName in nodes)) throw new Error(`nodo sin stub: ${nodeName}`)
        const list = asItems(nodes[nodeName])
        return { first: () => list[0], all: () => list }
    }
    const fn = new Function("$input", "$", "$now", "DateTime", jsCodeOf(name))
    return fn($input, $, NOW, DateTimeStub)
}

// --- Fixture: el día del ejemplo (27/10/2026) ---------------------------------
const NICO = { id: 1, name: "Nico" }
const MAX = { id: 2, name: "Max" }
const TEAM = {
    Belgium: { id: 10, name: "Belgium" },
    Sweden: { id: 11, name: "Sweden" },
    Germany: { id: 12, name: "Germany" },
    Norway: { id: 13, name: "Norway" },
    Morocco: { id: 14, name: "Morocco" },
    Ecuador: { id: 15, name: "Ecuador" },
    Türkiye: { id: 16, name: "Türkiye" },
    France: { id: 17, name: "France" },
    Italy: { id: 18, name: "Italy" },
    England: { id: 19, name: "England" },
    Netherlands: { id: 20, name: "Netherlands" },
    Austria: { id: 21, name: "Austria" },
}
const at = (hour) => `${DATE}T${hour}:00:00.000Z`

// Partido tal como lo devuelve `/api/matches`.
const rawMatch = ({
    id,
    tournament,
    type = "regular",
    playoffId,
    leg,
    seeds,
    p1,
    t1,
    s1,
    p2,
    t2,
    s2,
    hour,
    deltaP1,
    penaltiesWinner,
}) => {
    const winnerOnP1 = penaltiesWinner ? penaltiesWinner === "p1" : s1 > s2
    const draw = s1 === s2 && !penaltiesWinner
    const outcome = draw
        ? { draw: true }
        : {
              draw: s1 === s2,
              penalties: Boolean(penaltiesWinner),
              playerThatWon: winnerOnP1 ? p1 : p2,
              playerThatLost: winnerOnP1 ? p2 : p1,
              teamThatWon: TEAM[winnerOnP1 ? t1 : t2],
              teamThatLost: TEAM[winnerOnP1 ? t2 : t1],
          }
    const match = {
        _id: id,
        played: true,
        playedAt: at(hour),
        type,
        tournament: { _id: tournament.id, name: tournament.name },
        playerP1: p1,
        teamP1: TEAM[t1],
        scoreP1: s1,
        playerP2: p2,
        teamP2: TEAM[t2],
        scoreP2: s2,
        outcome,
        ratingChange: { p1: deltaP1, p2: -deltaP1 },
    }
    if (playoffId !== undefined) match.playoff_id = playoffId
    if (leg !== undefined) match.leg = leg
    if (seeds) [match.seedP1, match.seedP2] = seeds
    return match
}

const T_AFINIDADES = { id: "t-af", name: "Copa Afinidades 2026" }
const T_MUNDIAL = { id: "t-wc", name: "Copa del Mundo 2026" }
const T_SUPERCOPA = { id: "t-sc", name: "Supercopa APA 2026" }

const DAY_MATCHES = [
    rawMatch({
        id: "m1",
        tournament: T_AFINIDADES,
        type: "playoff",
        playoffId: 3,
        leg: 1,
        p1: NICO,
        t1: "Belgium",
        s1: 5,
        p2: MAX,
        t2: "Sweden",
        s2: 4,
        hour: "14",
        deltaP1: 1.8,
    }),
    rawMatch({
        id: "m2",
        tournament: T_MUNDIAL,
        type: "playoff",
        playoffId: 18,
        seeds: ["1E", "1I"],
        p1: NICO,
        t1: "Germany",
        s1: 6,
        p2: MAX,
        t2: "Norway",
        s2: 7,
        hour: "15",
        deltaP1: -9.46,
    }),
    rawMatch({
        id: "m3",
        tournament: T_MUNDIAL,
        type: "playoff",
        playoffId: 19,
        seeds: ["1C", "2E"],
        p1: NICO,
        t1: "Morocco",
        s1: 5,
        p2: MAX,
        t2: "Ecuador",
        s2: 4,
        hour: "16",
        deltaP1: 1.9,
    }),
    rawMatch({
        id: "m4",
        tournament: T_SUPERCOPA,
        p1: NICO,
        t1: "Türkiye",
        s1: 0,
        p2: MAX,
        t2: "France",
        s2: 2,
        hour: "17",
        deltaP1: -3.3,
    }),
    rawMatch({
        id: "m5",
        tournament: T_SUPERCOPA,
        p1: MAX,
        t1: "Italy",
        s1: 2,
        p2: NICO,
        t2: "England",
        s2: 4,
        hour: "18",
        deltaP1: -5.19,
    }),
]

// Evento del motor de ratings (lo que lee `matchInsights`).
const ratingEvent = (matchId, hour, fields) => ({
    time: Date.parse(at(hour)),
    tournament: "x",
    resultP1: 1,
    teamAdjustment: 0,
    ...fields,
    matchId,
    p1: { id: "1", name: "Nico", games: 100, ...fields.p1 },
    p2: { id: "2", name: "Max", games: 100, ...fields.p2 },
})

const RATING_EVENTS = [
    // Belgium 81 vs Sweden 77, ELO 1655 vs 1563,3.
    ratingEvent("m1", "14", {
        type: "playoff",
        scoreP1: 5,
        scoreP2: 4,
        expectedP1: 0.68,
        delta: 1.8,
        p1: { before: 1655, teamOverall: 81 },
        p2: { before: 1563.3, teamOverall: 77 },
    }),
    // Germany 84 vs Norway 79, ELO 1661 vs 1557,3: ganó el de 21 %.
    ratingEvent("m2", "15", {
        type: "playoff",
        scoreP1: 6,
        scoreP2: 7,
        expectedP1: 0.79,
        delta: -9.46,
        p1: { before: 1661, teamOverall: 84 },
        p2: { before: 1557.3, teamOverall: 79 },
    }),
    // Morocco 79 vs Ecuador 76, ELO 1651,5 vs 1566,7.
    ratingEvent("m3", "16", {
        type: "playoff",
        scoreP1: 5,
        scoreP2: 4,
        expectedP1: 0.72,
        delta: 1.9,
        p1: { before: 1651.5, teamOverall: 79 },
        p2: { before: 1566.7, teamOverall: 76 },
    }),
    // Türkiye 79 vs France 86, ELO 1661,8 vs 1556,5: Max, con menos ELO, favorito.
    ratingEvent("m4", "17", {
        type: "regular",
        scoreP1: 0,
        scoreP2: 2,
        expectedP1: 0.45,
        delta: -3.3,
        p1: { before: 1661.8, teamOverall: 79 },
        p2: { before: 1556.5, teamOverall: 86 },
    }),
    // Italy 83 vs England 84, ELO 1561,3 vs 1657.
    ratingEvent("m5", "18", {
        type: "regular",
        scoreP1: 2,
        scoreP2: 4,
        expectedP1: 0.34,
        delta: -5.19,
        p1: { before: 1561.3, teamOverall: 83 },
        p2: { before: 1657, teamOverall: 84 },
    }),
]

const TOURNAMENTS = {
    "t-af": {
        name: T_AFINIDADES.name,
        format: "playoff",
        playoffMode: "two_legged",
        ongoing: true,
    },
    "t-wc": { name: T_MUNDIAL.name, format: "world_cup_2026", ongoing: true },
    "t-sc": { name: T_SUPERCOPA.name, format: "super_cup", ongoing: true },
}

// Cruce de `/api/recaps/context` (forma de `slimMatch` antes de aplanar).
const bracketMatch = ({
    playoffId,
    leg = null,
    played = true,
    valid = true,
    hour,
    p1,
    t1,
    s1 = null,
    p2,
    t2,
    s2 = null,
    seeds,
    series,
    winner,
}) => ({
    type: "playoff",
    playoff_id: playoffId,
    leg,
    played,
    valid,
    playedAt: hour ? at(hour) : null,
    playerP1: p1,
    teamP1: TEAM[t1],
    seedP1: seeds?.[0],
    scoreP1: s1,
    playerP2: p2,
    teamP2: TEAM[t2],
    seedP2: seeds?.[1],
    scoreP2: s2,
    series,
    outcome: played
        ? {
              draw: s1 === s2,
              playerThatWon: winner === "p1" ? p1 : p2,
              playerThatLost: winner === "p1" ? p2 : p1,
              teamThatWon: TEAM[winner === "p1" ? t1 : t2],
              teamThatLost: TEAM[winner === "p1" ? t2 : t1],
          }
        : null,
})

const PLAYOFF_MATCHES = {
    "t-af": [
        bracketMatch({
            playoffId: 3,
            leg: 1,
            hour: "14",
            p1: NICO,
            t1: "Belgium",
            s1: 5,
            p2: MAX,
            t2: "Sweden",
            s2: 4,
            winner: "p1",
            seeds: ["3", "30"],
            series: {
                status: "awaiting_leg2",
                aggregate: [
                    { teamId: 10, score: 5 },
                    { teamId: 11, score: 4 },
                ],
            },
        }),
        bracketMatch({
            playoffId: 3,
            leg: 2,
            played: false,
            p1: MAX,
            t1: "Sweden",
            p2: NICO,
            t2: "Belgium",
            seeds: ["30", "3"],
        }),
    ],
    "t-wc": [
        bracketMatch({
            playoffId: 18,
            hour: "15",
            p1: NICO,
            t1: "Germany",
            s1: 6,
            p2: MAX,
            t2: "Norway",
            s2: 7,
            winner: "p2",
            seeds: ["1E", "1I"],
        }),
        bracketMatch({
            playoffId: 19,
            hour: "16",
            p1: NICO,
            t1: "Morocco",
            s1: 5,
            p2: MAX,
            t2: "Ecuador",
            s2: 4,
            winner: "p1",
            seeds: ["1C", "2E"],
        }),
    ],
    // Cruce entre dos equipos del mismo jugador: se resolvió sin jugarse.
    "t-sc": [
        bracketMatch({
            playoffId: 4,
            hour: "13",
            valid: false,
            p1: NICO,
            t1: "Netherlands",
            p2: NICO,
            t2: "Austria",
            seeds: ["1D", "2F"],
            winner: "p1",
        }),
    ],
}

const standingRow = (team, player, position, previousPosition, points) => ({
    team: TEAM[team],
    player,
    position,
    previousPosition,
    played: 4,
    points,
    wins: Math.floor(points / 3),
    draws: points % 3,
    losses: 4 - Math.floor(points / 3) - (points % 3),
    goalsFor: 8,
    goalsAgainst: 5,
})
// Dos grupos de 5 equipos con 4 partidos jugados cada uno (grupos completos).
const standingGroup = (group, rows) => ({
    group,
    teams: [
        ...rows,
        ...Array.from({ length: 5 - rows.length }, (_, n) => ({
            ...standingRow("Austria", NICO, rows.length + n + 1, null, 1),
            team: { id: 100 + n, name: `Relleno ${group}${n + 1}` },
        })),
    ].map((row, index) => ({ ...row, position: index + 1 })),
})
const STANDINGS = {
    "t-sc": [
        standingGroup("A", [
            standingRow("France", MAX, 1, 2, 10),
            standingRow("Türkiye", NICO, 2, 1, 9),
        ]),
        standingGroup("C", [
            standingRow("Netherlands", NICO, 1, 1, 12),
            standingRow("England", NICO, 2, 3, 9),
            standingRow("Austria", NICO, 3, 2, 6),
            standingRow("Italy", MAX, 4, 4, 3),
        ]),
    ],
}

// Respuesta REAL de `GET /api/recaps/context`, armada con el controlador y
// dependencias de fixture (así los campos nuevos salen del código del BE).
const buildRecapContextResponse = async (overrides = {}) => {
    const controller = createGetRecapContext({
        retrieveTournamentIdsPlayedOnDate: async () => Object.keys(TOURNAMENTS),
        retrieveTournamentById: async (id) => TOURNAMENTS[id],
        retrieveStandings: async (id) => ({ standings: STANDINGS[id] ?? [] }),
        retrievePlayinMatchesByTournamentId: async () => [],
        retrievePlayoffMatchesByTournamentId: async (id) =>
            PLAYOFF_MATCHES[id] ?? [],
        retrieveRatingsTimeline: async () => ({ events: RATING_EVENTS }),
        retrieveMatchesPlayedOnDate: async () =>
            DAY_MATCHES.map((match) => ({
                ...match,
                tournament: { id: match.tournament._id },
            })),
        ...overrides,
    })
    let body
    await controller(
        { query: { date: DATE } },
        {
            json(payload) {
                body = payload
            },
        }
    )
    return body
}

// `/api/statistics` el día del ejemplo: se corta la racha récord de Nico (132
// partidos marcando 1+ gol) y la de Max pasa a ser la activa más larga.
const matchRef = (hour, extra = {}) => ({
    date: at(hour),
    tournament: { name: T_SUPERCOPA.name },
    type: "regular",
    team: { name: "Türkiye" },
    opponent: { name: "Max" },
    opponentTeam: { name: "France" },
    goalsFor: 0,
    goalsAgainst: 2,
    result: "loss",
    ...extra,
})
const activeRef = (key, count, player, hour, started = false) => ({
    count,
    players: [
        {
            id: player.id,
            name: player.name,
            isActive: true,
            startDate: started ? at(hour) : "2026-09-01T12:00:00.000Z",
            endDate: at(hour),
            endMatch: matchRef(hour, {
                team: { name: "Italy" },
                result: "win",
            }),
        },
    ],
})
const STATISTICS = {
    records: {
        most_consecutive_matches_scoring_1_plus_goals: {
            count: 132,
            players: [
                {
                    id: NICO.id,
                    name: "Nico",
                    isActive: false,
                    startDate: "2025-01-01T12:00:00.000Z",
                    endDate: "2026-10-26T20:00:00.000Z",
                    breakMatch: matchRef("17"),
                },
            ],
        },
        most_consecutive_matches_scoring_3_plus_goals: {
            count: 22,
            players: [
                {
                    id: NICO.id,
                    name: "Nico",
                    isActive: false,
                    startDate: "2026-06-01T12:00:00.000Z",
                    endDate: "2026-10-26T20:00:00.000Z",
                    breakMatch: matchRef("17"),
                },
            ],
        },
    },
    activeStreaks: {
        most_consecutive_matches_scoring_1_plus_goals: activeRef(
            "most_consecutive_matches_scoring_1_plus_goals",
            22,
            MAX,
            "18"
        ),
        most_consecutive_matches_scoring_3_plus_goals: activeRef(
            "most_consecutive_matches_scoring_3_plus_goals",
            4,
            NICO,
            "18",
            true
        ),
        most_wins_in_a_row: activeRef(
            "most_wins_in_a_row",
            2,
            NICO,
            "18",
            true
        ),
        most_unbeaten_in_a_row: activeRef(
            "most_unbeaten_in_a_row",
            2,
            NICO,
            "18",
            true
        ),
        most_knockout_wins_in_a_row: activeRef(
            "most_knockout_wins_in_a_row",
            2,
            NICO,
            "18",
            true
        ),
        most_knockout_unbeaten_in_a_row: activeRef(
            "most_knockout_unbeaten_in_a_row",
            2,
            NICO,
            "18",
            true
        ),
    },
    players: [],
}

// Corre la cadena de nodos del workflow con las respuestas HTTP de fixture y
// devuelve la salida de cada uno.
const runChain = async ({
    matches = DAY_MATCHES,
    statistics = STATISTICS,
    contextResponse,
} = {}) => {
    const context = contextResponse ?? (await buildRecapContextResponse())
    const [dayStats] = runCodeNode("Compute Day Stats", {
        input: [{ matches }],
    })
    const [streaks] = runCodeNode("Compute Streak Events", {
        input: [statistics],
        nodes: { "Compute Day Stats": [dayStats.json] },
    })
    const [withContext] = runCodeNode("Add Tournament Context", {
        input: [context],
        nodes: { "Compute Streak Events": [streaks.json] },
    })
    const [cleaned] = runCodeNode("Cleanup for agent", {
        input: [withContext.json],
        nodes: { "Fetch Tournament Context": [context] },
    })
    return {
        context,
        dayStats: dayStats.json,
        streaks: streaks.json,
        withContext: withContext.json,
        recap: cleaned.json,
    }
}

const tournamentOf = (recap, name) =>
    recap.tournaments.find(({ tournament }) => tournament === name)

// --- Caracterización: lo que NO debe cambiar ----------------------------------
test("the workflow export is valid JSON and every connection points to an existing node", () => {
    const names = new Set(workflow.nodes.map((node) => node.name))

    for (const [source, byType] of Object.entries(workflow.connections)) {
        assert.ok(names.has(source), `origen inexistente: ${source}`)
        for (const outputs of Object.values(byType)) {
            for (const output of outputs) {
                for (const { node } of output) {
                    assert.ok(names.has(node), `destino inexistente: ${node}`)
                }
            }
        }
    }
})

test("the day of the example keeps Germany-Norway as the most notable match", async () => {
    const { recap } = await runChain()

    assert.equal(recap.matchCount, 5)
    assert.equal(recap.tournamentCount, 3)
    assert.equal(recap.topHighlights[0].rank, 1)
    assert.equal(recap.topHighlights[0].tournament, T_MUNDIAL.name)
    assert.equal(
        recap.topHighlights[0].match,
        "Nico (Germany) 6 - 7 Max (Norway)"
    )
})

test("matches keep their order, margins and the series and unplayed ties of the day", async () => {
    const { recap } = await runChain()
    const mundial = tournamentOf(recap, T_MUNDIAL.name)
    const afinidades = tournamentOf(recap, T_AFINIDADES.name)
    const supercopa = tournamentOf(recap, T_SUPERCOPA.name)

    assert.deepEqual(
        mundial.matches.map(({ order, round, home, away, score }) => ({
            order,
            round,
            home,
            away,
            score,
        })),
        [
            {
                order: 1,
                round: "8vos de final",
                home: "Nico (Germany)",
                away: "Max (Norway)",
                score: "6 - 7",
            },
            {
                order: 2,
                round: "8vos de final",
                home: "Nico (Morocco)",
                away: "Max (Ecuador)",
                score: "5 - 4",
            },
        ]
    )
    assert.deepEqual(mundial.biggestMarginOrders, [1, 2])
    assert.deepEqual(supercopa.biggestMarginOrders, [1, 2])
    assert.equal(afinidades.playoffSeries.length, 1)
    assert.equal(afinidades.playoffSeries[0].round, "16vos de final")
    assert.equal(afinidades.playoffSeries[0].status, "awaiting_leg2")
    assert.deepEqual(afinidades.playoffSeries[0].aggregate, [
        { team: "Belgium", score: 5 },
        { team: "Sweden", score: 4 },
    ])
    assert.equal(supercopa.advancedWithoutPlaying.length, 1)
    assert.equal(
        supercopa.advancedWithoutPlaying[0].advancing,
        "Nico (Netherlands)"
    )
    assert.equal(
        supercopa.advancedWithoutPlaying[0].decidedBy,
        "same_player_pick"
    )
})

// --- Compute Day Stats ----------------------------------------------------------
const dayStatsOf = (matches) =>
    runCodeNode("Compute Day Stats", { input: [{ matches }] })[0].json

const simpleMatch = (overrides = {}) =>
    rawMatch({
        id: "x",
        tournament: T_SUPERCOPA,
        p1: NICO,
        t1: "Belgium",
        s1: 2,
        p2: MAX,
        t2: "Sweden",
        s2: 1,
        hour: "14",
        deltaP1: 2,
        ...overrides,
    })

test("the biggest swing carries a size computed in code and no scale leaks", () => {
    const sizeOf = (deltaP1) =>
        dayStatsOf([simpleMatch({ deltaP1 })]).elo.biggestSingleMatchSwing.size

    assert.equal(sizeOf(3.99), "small")
    assert.equal(sizeOf(4), "medium")
    assert.equal(sizeOf(8.99), "medium")
    assert.equal(sizeOf(9), "huge")
    assert.equal(sizeOf(-9.46), "huge")

    const { elo } = dayStatsOf(DAY_MATCHES)
    assert.equal(elo.biggestSingleMatchSwing.change, -9.46)
    assert.equal(elo.biggestSingleMatchSwing.size, "huge")
    assert.ok(!("note" in elo))
    assert.ok(!("maxChangePerMatch" in elo))
    assert.doesNotMatch(JSON.stringify(elo), /9-12|1-3|small, \d|12 points/)
})

test("the day record counts a penalty shoot-out as a win and a plain tie as a draw", () => {
    const [table] = dayStatsOf([
        simpleMatch({
            id: "a",
            s1: 1,
            s2: 1,
            penaltiesWinner: "p2",
            hour: "14",
        }),
        simpleMatch({ id: "b", s1: 2, s2: 2, hour: "15" }),
        simpleMatch({ id: "c", s1: 3, s2: 0, hour: "16" }),
    ]).tournaments.map(({ playerTable }) => playerTable)
    const byPlayer = Object.fromEntries(table.map((row) => [row.player, row]))

    assert.deepEqual(
        ["wins", "draws", "losses"].map((key) => byPlayer.Nico[key]),
        [1, 1, 1]
    )
    assert.deepEqual(
        ["wins", "draws", "losses"].map((key) => byPlayer.Max[key]),
        [1, 1, 1]
    )
})

test("the day record falls back to the score when the outcome names no winner", () => {
    const withoutWinner = simpleMatch({ s1: 0, s2: 3 })
    withoutWinner.outcome = { draw: false }
    const [table] = dayStatsOf([withoutWinner]).tournaments.map(
        ({ playerTable }) => playerTable
    )
    const byPlayer = Object.fromEntries(table.map((row) => [row.player, row]))

    assert.equal(byPlayer.Max.wins, 1)
    assert.equal(byPlayer.Nico.losses, 1)
})

// --- Compute Streak Events ------------------------------------------------------
const streakEventsOf = (statistics) => {
    const [dayStats] = runCodeNode("Compute Day Stats", {
        input: [{ matches: DAY_MATCHES }],
    })
    const [result] = runCodeNode("Compute Streak Events", {
        input: [statistics],
        nodes: { "Compute Day Stats": [dayStats.json] },
    })
    return result.json.streakEvents
}
const activeEvent = (events, player, streakType) =>
    events.find(
        (event) =>
            event.event === "ACTIVE_STREAK_EXTENDED" &&
            event.player === player &&
            event.streakType === streakType
    )
const ONE_PLUS = "matches in a row scoring 1+ goals"
const withRecordBreak = (key, breakDate) => ({
    ...STATISTICS,
    records: {
        [key]: {
            ...STATISTICS.records.most_consecutive_matches_scoring_1_plus_goals,
            players: [
                {
                    ...STATISTICS.records
                        .most_consecutive_matches_scoring_1_plus_goals
                        .players[0],
                    breakMatch: matchRef("17", { date: breakDate }),
                },
            ],
        },
    },
})

test("an active streak that took over after a record streak was cut says whose it was", () => {
    const events = streakEventsOf(STATISTICS)

    assert.deepEqual(activeEvent(events, "Max", ONE_PLUS).takesOverFrom, {
        player: "Nico",
        length: 132,
    })
    // La racha récord cortada sigue reportándose como corte.
    const broken = events.find(
        (event) =>
            event.event === "RECORD_STREAK_BROKEN" &&
            event.streakType === ONE_PLUS
    )
    assert.equal(broken.player, "Nico")
    assert.equal(broken.length, 132)
    // La nueva racha de 3+ goles de Nico no toma nada de nadie (el récord cortado era suyo).
    assert.ok(
        !(
            "takesOverFrom" in
            activeEvent(events, "Nico", "matches in a row scoring 3+ goals")
        )
    )
    assert.ok(
        !("takesOverFrom" in activeEvent(events, "Nico", "wins in a row"))
    )
})

test("without a record cut that day, a record cut of another type or a cut on another day nothing is taken over", () => {
    const noRecords = { ...STATISTICS, records: {} }
    const otherType = withRecordBreak("most_wins_in_a_row", at("17"))
    const otherDay = withRecordBreak(
        "most_consecutive_matches_scoring_1_plus_goals",
        "2026-10-26T17:00:00.000Z"
    )

    for (const statistics of [noRecords, otherType, otherDay]) {
        const events = streakEventsOf(statistics)
        assert.ok(activeEvent(events, "Max", ONE_PLUS))
        assert.ok(!("takesOverFrom" in activeEvent(events, "Max", ONE_PLUS)))
    }
})

// --- Cleanup for agent ----------------------------------------------------------
const oddsList = (recap) =>
    recap.tournaments.flatMap(({ matches }) =>
        matches.map(({ odds }) => odds).filter(Boolean)
    )

test("odds use the assistant labels and carry no player ELO or raw overall", async () => {
    const { recap } = await runChain()
    const mundial = tournamentOf(recap, T_MUNDIAL.name)
    const [germanyNorway, morocco] = mundial.matches

    assert.deepEqual(germanyNorway.odds.favorite, {
        who: "Nico (Germany)",
        label: "favorito",
    })
    assert.equal(germanyNorway.odds.result, "upset")
    assert.equal(germanyNorway.odds.winnerExpectedScore, 0.21)
    assert.equal(germanyNorway.odds.kind, "advance")
    assert.deepEqual(germanyNorway.odds.ratingEdge, {
        who: "Nico",
        level: "clear",
    })
    assert.equal(morocco.odds.result, "favorite_win")

    for (const odds of oddsList(recap)) {
        for (const key of ["elo", "overall", "matchup"]) {
            assert.ok(!(key in odds), `odds.${key} no debe viajar`)
        }
        assert.ok(
            [
                "favorito",
                "levemente favorito",
                "gran favorito",
                undefined,
            ].includes(odds.favorite?.label)
        )
    }

    // Ningún ELO de jugador ni overall crudo en todo lo que ve el agente.
    const payload = JSON.stringify(recap)
    for (const elo of [
        "1655",
        "1563.3",
        "1661",
        "1557.3",
        "1651.5",
        "1566.7",
        "1661.8",
        "1556.5",
        "1561.3",
        "1657",
    ]) {
        assert.ok(!payload.includes(elo), `aparece el ELO ${elo}`)
    }
})

test("the overall only travels when the gap between the teams is relevant", async () => {
    const { recap } = await runChain()
    const [belgium] = tournamentOf(recap, T_AFINIDADES.name).matches
    const [, morocco] = tournamentOf(recap, T_MUNDIAL.name).matches
    const [, england] = tournamentOf(recap, T_SUPERCOPA.name).matches
    const [france] = tournamentOf(recap, T_SUPERCOPA.name).matches

    assert.deepEqual(belgium.odds.overallEdge, {
        who: "Nico (Belgium)",
        points: 4,
        level: "notable",
        overall: { Belgium: 81, Sweden: 77 },
    })
    assert.equal(france.odds.overallEdge.who, "Max (France)")
    assert.equal(france.odds.overallEdge.points, 7)
    // 3 y 1 puntos de diferencia: no se manda el overall.
    assert.ok(!("overallEdge" in morocco.odds))
    assert.ok(!("overallEdge" in england.odds))
})

test("a duel without a clear favorite is a toss up and the label comes from the backend", async () => {
    const context = await buildRecapContextResponse()
    const insight = context.data
        .find(({ tournament }) => tournament === T_SUPERCOPA.name)
        .matchInsights.find(({ matchId }) => matchId === "m4")
    insight.favorite = null
    const { recap } = await runChain({ contextResponse: context })
    const [france] = tournamentOf(recap, T_SUPERCOPA.name).matches

    assert.equal(france.odds.result, "toss_up")
    assert.ok(!("favorite" in france.odds))
    assert.ok(!("favoriteExpected" in france.odds))
})

test("winners say which round they advance to", async () => {
    const { recap } = await runChain()
    const [germanyNorway, morocco] = tournamentOf(recap, T_MUNDIAL.name).matches
    const supercopa = tournamentOf(recap, T_SUPERCOPA.name)

    assert.deepEqual(germanyNorway.advancesTo, {
        winner: "Max (Norway)",
        to: "4tos de final",
    })
    assert.deepEqual(morocco.advancesTo, {
        winner: "Nico (Morocco)",
        to: "4tos de final",
    })
    // Los partidos de fase de grupos y la ida de una serie no clasifican a nadie.
    assert.ok(supercopa.matches.every((match) => !("advancesTo" in match)))
    const [belgium] = tournamentOf(recap, T_AFINIDADES.name).matches
    assert.ok(!("advancesTo" in belgium))
    assert.deepEqual(supercopa.advancedWithoutPlaying[0].advancesTo, {
        winner: "Nico (Netherlands)",
        to: "4tos de final",
    })
})

test("the winner of a final is the champion and a decided series says where it advances", async () => {
    const finalMatch = rawMatch({
        id: "f1",
        tournament: { id: "t-fin", name: "Copa Final" },
        type: "playoff",
        playoffId: 31,
        p1: NICO,
        t1: "Italy",
        s1: 3,
        p2: MAX,
        t2: "England",
        s2: 1,
        hour: "20",
        deltaP1: 2,
    })
    const serieLeg1 = rawMatch({
        id: "s1",
        tournament: { id: "t-ser", name: "Copa Series" },
        type: "playoff",
        playoffId: 3,
        leg: 1,
        p1: NICO,
        t1: "Belgium",
        s1: 1,
        p2: MAX,
        t2: "Sweden",
        s2: 0,
        hour: "21",
        deltaP1: 2,
    })
    const context = await buildRecapContextResponse({
        retrieveTournamentIdsPlayedOnDate: async () => ["t-fin", "t-ser"],
        retrieveTournamentById: async (id) =>
            id === "t-fin"
                ? { name: "Copa Final", format: "world_cup_2026" }
                : {
                      name: "Copa Series",
                      format: "playoff",
                      playoffMode: "two_legged",
                  },
        retrieveRatingsTimeline: async () => ({ events: [] }),
        retrievePlayoffMatchesByTournamentId: async (id) =>
            id === "t-fin"
                ? [
                      bracketMatch({
                          playoffId: 31,
                          hour: "20",
                          p1: NICO,
                          t1: "Italy",
                          s1: 3,
                          p2: MAX,
                          t2: "England",
                          s2: 1,
                          winner: "p1",
                      }),
                  ]
                : [
                      bracketMatch({
                          playoffId: 3,
                          leg: 1,
                          hour: "21",
                          p1: NICO,
                          t1: "Belgium",
                          s1: 1,
                          p2: MAX,
                          t2: "Sweden",
                          s2: 0,
                          winner: "p1",
                          series: {
                              status: "decided",
                              winnerTeamId: 10,
                              aggregate: [],
                          },
                      }),
                      bracketMatch({
                          playoffId: 3,
                          leg: 2,
                          hour: "22",
                          p1: MAX,
                          t1: "Sweden",
                          s1: 0,
                          p2: NICO,
                          t2: "Belgium",
                          s2: 0,
                          winner: "p2",
                      }),
                  ],
    })
    const { recap } = await runChain({
        matches: [finalMatch, serieLeg1],
        contextResponse: context,
    })
    const [final] = tournamentOf(recap, "Copa Final").matches
    const [series] = tournamentOf(recap, "Copa Series").playoffSeries

    assert.deepEqual(final.advancesTo, {
        winner: "Nico (Italy)",
        to: "campeón del torneo",
    })
    assert.equal(series.status, "decided")
    assert.deepEqual(series.advancesTo, {
        winner: "Belgium",
        to: "8vos de final",
    })
    assert.ok(!("lead" in series))
})

test("the series lead is graded by the goal difference of the first leg", async () => {
    const outlookFor = async (goals) => {
        const context = await buildRecapContextResponse({
            retrievePlayoffMatchesByTournamentId: async (id) =>
                (PLAYOFF_MATCHES[id] ?? []).map((match) =>
                    id === "t-af" && match.leg === 1
                        ? {
                              ...match,
                              scoreP1: goals === 0 ? 1 : goals,
                              scoreP2: goals === 0 ? 1 : 0,
                          }
                        : match
                ),
        })
        const { recap } = await runChain({ contextResponse: context })
        return tournamentOf(recap, T_AFINIDADES.name).playoffSeries[0].lead
    }

    assert.deepEqual(await outlookFor(0), {
        leader: null,
        trailing: null,
        goals: 0,
        outlook: "level",
    })
    assert.deepEqual(await outlookFor(1), {
        leader: "Belgium",
        trailing: "Sweden",
        goals: 1,
        outlook: "open",
    })
    for (const [goals, outlook] of [
        [2, "edge"],
        [3, "steep"],
        [4, "steep"],
        [5, "very_steep"],
        [12, "very_steep"],
    ]) {
        const lead = await outlookFor(goals)
        assert.equal(lead.goals, goals)
        assert.equal(lead.outlook, outlook, `${goals} goles`)
    }
})

test("there is one day record for all the tournaments and no per-tournament table", async () => {
    const { recap } = await runChain()

    assert.deepEqual(recap.dayRecord, [
        { player: "Nico", wins: 3, draws: 0, losses: 2 },
        { player: "Max", wins: 2, draws: 0, losses: 3 },
    ])
    for (const tournament of recap.tournaments) {
        assert.ok(!("playerTable" in tournament))
    }
})

test("the first knockout round travels only for tournaments with group matches that day", async () => {
    const { recap } = await runChain()
    const rulesOf = (name) =>
        recap.tournamentContext.find(({ tournament }) => tournament === name)
            .rules

    assert.equal(rulesOf(T_SUPERCOPA.name).firstKnockoutRound, "8vos de final")
    assert.ok(!("firstKnockoutRound" in rulesOf(T_MUNDIAL.name)))
    assert.ok(!("firstKnockoutRound" in rulesOf(T_AFINIDADES.name)))
})

test("an active streak that took over stays apart and the others are grouped as before", async () => {
    const { recap } = await runChain()
    const active = recap.streakEvents.filter(
        ({ event }) => event === "ACTIVE_STREAK_EXTENDED"
    )
    const takeOver = active.filter((event) => "takesOverFrom" in event)

    assert.equal(takeOver.length, 1)
    assert.equal(takeOver[0].player, "Max")
    assert.deepEqual(takeOver[0].takesOverFrom, { player: "Nico", length: 132 })
    assert.deepEqual(takeOver[0].streakTypes, [ONE_PLUS])
    const grouped = active.find(({ streakTypes }) => streakTypes.length === 4)
    assert.equal(grouped.player, "Nico")
    assert.equal(grouped.length, 2)
    assert.equal(recap.elo.biggestSingleMatchSwing.size, "huge")
})

test("a backend without the new fields still produces a recap without inventing them", async () => {
    const context = await buildRecapContextResponse()
    for (const tournament of context.data) {
        delete tournament.playoffStartRound
        for (const tie of tournament.bracket) delete tie.nextRound
        for (const insight of tournament.matchInsights) {
            delete insight.favorite
            delete insight.ratingEdge
            delete insight.overallGap
        }
    }
    const { recap } = await runChain({ contextResponse: context })
    const [germanyNorway] = tournamentOf(recap, T_MUNDIAL.name).matches

    assert.equal(germanyNorway.odds.result, "upset")
    assert.ok(!("favorite" in germanyNorway.odds))
    assert.ok(!("advancesTo" in germanyNorway))
    assert.ok(
        !(
            "firstKnockoutRound" in
            recap.tournamentContext.find(
                ({ tournament }) => tournament === T_SUPERCOPA.name
            ).rules
        )
    )
    assert.equal(
        recap.topHighlights[0].match,
        "Nico (Germany) 6 - 7 Max (Norway)"
    )
})

// --- Prompt de Write Recap ------------------------------------------------------
const collectKeys = (value, keys = new Set()) => {
    if (Array.isArray(value)) value.forEach((item) => collectKeys(item, keys))
    else if (value && typeof value === "object") {
        for (const [key, inner] of Object.entries(value)) {
            keys.add(key)
            collectKeys(inner, keys)
        }
    }
    return keys
}

test("the prompt no longer quotes rules or leaks scales and removed fields", () => {
    const prompt = promptOf()

    for (const forbidden of [
        "Quote the knockout rule",
        "elo.note",
        "9-12",
        "scale",
        "odds.elo",
        "odds.overall ",
        "odds.matchup",
        "maxChangePerMatch",
        "playerTable",
        "ELO 1542",
    ]) {
        assert.ok(
            !prompt.includes(forbidden),
            `el prompt todavía dice: ${forbidden}`
        )
    }
})

test("the prompt asks for the new pre-calculated data and the assistant labels", () => {
    const prompt = promptOf()

    for (const expected of [
        "dayRecord",
        "advancesTo",
        "lead.outlook",
        "takesOverFrom",
        "size",
        "ratingEdge",
        "overallEdge",
        "firstKnockoutRound",
        "levemente favorito",
        '"favorito"',
        "gran favorito",
        "NEVER write ELO numbers",
        "OWN words",
        "do NOT use quotation marks",
    ]) {
        assert.ok(
            prompt.toLowerCase().includes(expected.toLowerCase()),
            `falta en el prompt: ${expected}`
        )
    }
    // Un solo récord del día: nunca uno por torneo.
    assert.match(prompt, /ONE single "Récord del día" line/)
    assert.match(prompt, /Never one per tournament/)
})

test("every field the prompt relies on exists in the data the agent receives", async () => {
    const { recap } = await runChain()
    const keys = collectKeys(recap)
    const prompt = promptOf()

    for (const field of [
        "favorite",
        "label",
        "favoriteExpected",
        "result",
        "winnerExpectedScore",
        "kind",
        "ratingEdge",
        "overallEdge",
        "overall",
        "lead",
        "outlook",
        "leader",
        "advancesTo",
        "to",
        "dayRecord",
        "takesOverFrom",
        "firstKnockoutRound",
        "size",
        "biggestSingleMatchSwing",
        "startedThatDay",
        "streakTypes",
        "aggregate",
        "decidedBy",
        "topHighlights",
        "biggestMarginOrders",
        "advancedWithoutPlaying",
        "playoffSeries",
        "groupComplete",
        "positionLocked",
    ]) {
        assert.ok(keys.has(field), `la data no trae ${field}`)
        assert.ok(prompt.includes(field), `el prompt no menciona ${field}`)
    }
})

test("the data the agent receives carries no scales, notes or internal tables", async () => {
    const { recap } = await runChain()
    const keys = collectKeys(recap)

    for (const leaked of [
        "note",
        "maxChangePerMatch",
        "playerTable",
        "matchup",
    ]) {
        assert.ok(!keys.has(leaked), `la data todavía trae ${leaked}`)
    }
    assert.doesNotMatch(JSON.stringify(recap), /9-12|single match moves/)
})

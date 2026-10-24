process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
    buildTitleContext,
    computeTitleRanking,
} = require("../controller/getTournamentRecapContext/titles")

const P = {
    leo: { id: "u-leo", name: "Leo" },
    max: { id: "u-max", name: "Max" },
    nico: { id: "u-nico", name: "Nico" },
    santi: { id: "u-santi", name: "Santi" },
    lucho: { id: "u-lucho", name: "Lucho" },
}
const FOUR = [P.nico, P.leo, P.max, P.santi]
const FIVE = [...FOUR, P.lucho]

let sequence = 0
const t = (number, name, format, champion, finalist, closedAt, extra = {}) => {
    sequence += 1

    return {
        _id: `000000000000000000${String(number).padStart(6, "0")}`,
        name,
        format,
        players: FOUR,
        ongoing: false,
        closedAt: closedAt ? new Date(closedAt) : undefined,
        outcome: champion && {
            champion: {
                player: P[champion],
                team: { id: sequence, name: `Equipo ${sequence}` },
            },
            finalist: {
                player: P[finalist],
                team: { id: 100 + sequence, name: `Rival ${sequence}` },
            },
        },
        ...extra,
    }
}

const LEGACY = { legacy: true }
const INVALID = { valid: false }

// Los 27 torneos del snapshot de PROD del 2026-10-06 (.agents/tasks/
// prod-inventory-tournaments.md), reducidos a lo que usan los títulos. Las
// fechas de cierre salen del último partido (o del año, en los legacy).
const prodTournaments = () => [
    t(
        1,
        "Torneo Argentino 2021/22",
        "league",
        "leo",
        "leo",
        "2022-04-19T02:37:00Z"
    ),
    t(
        2,
        "Superliga Europea 2022",
        "league_playin_playoff",
        "nico",
        "nico",
        "2023-05-08T03:55:00Z"
    ),
    t(
        3,
        "Copa del Mundo 2022",
        "world_cup",
        "leo",
        "max",
        "2023-02-24T23:50:00Z"
    ),
    t(
        4,
        "Superliga ítalo-española 2022/23",
        "league",
        "leo",
        "nico",
        "2023-10-13T22:05:00Z"
    ),
    t(
        5,
        "Superliga Inglesa 2022",
        "league_playin_playoff",
        "nico",
        "santi",
        "2023-05-13T15:05:00Z"
    ),
    t(
        6,
        "Chempions 2019/20",
        "champions_league",
        "leo",
        "max",
        "2023-05-23T02:12:00Z"
    ),
    t(
        7,
        "Superliga Argentina 2023",
        "league_playin_playoff",
        "max",
        "max",
        "2023-12-12T23:15:00Z"
    ),
    t(
        8,
        "Superliga Internacional 2023/24 (I)",
        "league_playin_playoff",
        null,
        null,
        undefined,
        INVALID
    ),
    t(
        9,
        "Superliga Internacional 2023/24 (II)",
        "league_playin_playoff",
        null,
        null,
        undefined,
        INVALID
    ),
    t(
        10,
        "Superliga Inglesa 2024",
        "league_playin_playoff",
        "nico",
        "max",
        "2024-11-15T22:33:00Z"
    ),
    t(11, "Chempions 2024", "champions_league", null, null, undefined, {
        ...INVALID,
        ongoing: true,
    }),
    t(
        12,
        "Mundial de Ferraris 2024/25",
        "world_cup",
        "leo",
        "leo",
        "2025-02-20T00:05:00Z"
    ),
    t(
        13,
        "Superliga Internacional 2025",
        "league_playin_playoff",
        "nico",
        "leo",
        "2025-12-29T22:05:00Z"
    ),
    t(
        14,
        "Copa Argentina 2025/26",
        "playoff",
        "leo",
        "nico",
        "2026-08-07T22:28:00Z",
        { players: FIVE }
    ),
    t(15, "Liga Inglesa 2026", "league", null, null, undefined, INVALID),
    t(
        16,
        "Torneo Argentino 2016",
        "league",
        "max",
        "leo",
        "2016-01-01T10:00:00Z",
        LEGACY
    ),
    t(
        17,
        "Torneo Argentino 2017",
        "league",
        "max",
        "max",
        "2017-01-01T10:00:00Z",
        LEGACY
    ),
    t(
        18,
        "Copa del Mundo 2017",
        "world_cup",
        "leo",
        "santi",
        "2017-02-01T10:00:00Z",
        LEGACY
    ),
    t(
        19,
        "Torneo Argentino 2018",
        "league",
        "leo",
        "santi",
        "2018-01-01T10:00:00Z",
        LEGACY
    ),
    t(
        20,
        "Copa del Mundo 2018",
        "world_cup",
        "leo",
        "santi",
        "2018-02-01T10:00:00Z",
        LEGACY
    ),
    t(
        21,
        "Copa del Mundo 2018 (Juego Oficial)",
        "world_cup",
        "max",
        "leo",
        "2018-03-01T10:00:00Z",
        LEGACY
    ),
    t(
        22,
        "Mundial de Clubes 2018",
        "club_world_cup",
        "max",
        "max",
        "2018-04-01T10:00:00Z",
        LEGACY
    ),
    t(
        23,
        "Copa Argentina 2018",
        "playoff",
        "max",
        "leo",
        "2018-05-01T10:00:00Z",
        LEGACY
    ),
    t(
        24,
        "Copa América 2019",
        "american_cup",
        "santi",
        "max",
        "2019-01-01T10:00:00Z",
        LEGACY
    ),
    t(25, "Copa del Mundo 2026", "world_cup_2026", null, null, undefined, {
        ongoing: true,
    }),
    t(26, "Supercopa APA 2026", "super_cup", null, null, undefined, {
        ongoing: true,
        players: FIVE,
    }),
    t(27, "Copa Afinidades 2026", "playoff", null, null, undefined, {
        ongoing: true,
        players: FIVE,
        playoffMode: "two_legged",
    }),
]

const byNumber = (tournaments, number) => tournaments[number - 1]

const counters = ({
    titles,
    runnerUps,
    titlesAndRunnerUps,
    finalsPlayed,
    finalsWon,
    finalsLost,
}) => ({
    titles,
    runnerUps,
    titlesAndRunnerUps,
    finalsPlayed,
    finalsWon,
    finalsLost,
})

const titlesOf = (ranking) =>
    Object.fromEntries(
        ranking.map(({ player, titles }) => [player.name, titles])
    )

test("all-time ranking reproduces Leo 9 / Max 6 / Nico 4 / Santi 1 / Lucho 0", () => {
    const ranking = computeTitleRanking(prodTournaments())

    assert.deepEqual(titlesOf(ranking), {
        Leo: 9,
        Max: 6,
        Nico: 4,
        Santi: 1,
        Lucho: 0,
    })
    assert.deepEqual(
        ranking.map(({ player, rank }) => [player.name, rank]),
        [
            ["Leo", 1],
            ["Max", 2],
            ["Nico", 3],
            ["Santi", 4],
            ["Lucho", 5],
        ]
    )
    // La suma de títulos es la cantidad de torneos terminados, válidos y con campeón.
    assert.equal(
        ranking.reduce((total, { titles }) => total + titles, 0),
        20
    )
})

test("the counting rule is the one the Hall of Fame uses (finalized listing, grouped by champion)", () => {
    const tournaments = prodTournaments()
    // Lo que devuelve GET /tournaments?status=finalized: `ongoing: false` y
    // `valid != false` (dao/findTournaments), legacy incluidos.
    const finalized = tournaments.filter(
        (tournament) =>
            tournament.ongoing === false && tournament.valid !== false
    )
    // Lo que hace el FE (Accolades): agrupar por nombre del campeón.
    const accolades = {}
    for (const tournament of finalized) {
        if (tournament.outcome?.champion) {
            const name = tournament.outcome.champion.player.name
            accolades[name] = (accolades[name] ?? 0) + 1
        }
    }

    assert.deepEqual(accolades, {
        Leo: 9,
        Max: 6,
        Nico: 4,
        Santi: 1,
    })

    const ranking = computeTitleRanking(tournaments)

    for (const [name, count] of Object.entries(accolades)) {
        assert.equal(titlesOf(ranking)[name], count, name)
    }
})

test("an invalid or ongoing tournament never counts, even with an outcome", () => {
    const [first] = prodTournaments()
    const withOutcomeButInvalid = { ...first, _id: "x1", valid: false }
    const withOutcomeButOngoing = { ...first, _id: "x2", ongoing: true }
    const ranking = computeTitleRanking([
        withOutcomeButInvalid,
        withOutcomeButOngoing,
    ])

    assert.deepEqual(ranking, [])
})

test("the champion context of Nico's 2025 Superliga: 4th title, 3rd place, 4 behind Leo", () => {
    const tournaments = prodTournaments()
    const { titleContext } = buildTitleContext({
        tournaments,
        tournament: byNumber(tournaments, 13),
    })

    assert.equal(titleContext.includesLegacy, true)
    assert.equal(titleContext.asOf, "2025-12-29T22:05:00.000Z")
    // Legacy (9) + 1, 3, 2, 5, 6, 4, 7, 10, 12 y 13.
    assert.equal(titleContext.tournamentsConsidered, 19)
    assert.deepEqual(
        titleContext.ranking.map(({ player, titles }) => [player.name, titles]),
        [
            ["Leo", 8],
            ["Max", 6],
            ["Nico", 4],
            ["Santi", 1],
        ]
    )

    const { champion } = titleContext

    assert.equal(champion.player.name, "Nico")
    assert.equal(champion.titleNumber, 4)
    assert.equal(champion.rank, 3)
    assert.deepEqual(champion.gapToLeader, {
        player: { id: "u-leo", name: "Leo" },
        behind: 4,
    })
    assert.equal(champion.isFirstTitle, false)
    assert.equal(champion.leadChange, null)
    assert.equal(champion.consecutiveTitles, 1)
    // Ganó también la edición anterior de la familia Superliga (Inglesa 2024).
    assert.equal(champion.wasDefendingChampion, true)
    // 4 títulos y el subcampeonato de 2022/23, que fue una liga (no tiene
    // final): 5 torneos con título o subcampeonato, pero solo 4 finales.
    assert.deepEqual(counters(champion), {
        titles: 4,
        runnerUps: 1,
        titlesAndRunnerUps: 5,
        finalsPlayed: 4,
        finalsWon: 4,
        finalsLost: 0,
    })
    assert.equal("finals" in champion, false)
    assert.deepEqual(champion.beforeThisTournament, {
        titles: 3,
        runnerUps: 1,
        titlesAndRunnerUps: 4,
        finalsPlayed: 3,
        finalsWon: 3,
        finalsLost: 0,
    })
    assert.deepEqual(champion.sameCompetition, {
        titles: 4,
        runnerUps: 0,
        titlesAndRunnerUps: 4,
        finalsPlayed: 4,
        finalsWon: 4,
        finalsLost: 0,
    })
    assert.equal(titleContext.countsIncludeThisTournament, true)
    assert.match(titleContext.countsScope, /incluyen este torneo/)
    // La familia sale del formato: sus 4 títulos de league_playin_playoff.
    assert.equal("titlesSameFormat" in champion, false)
    assert.deepEqual(champion.titlesSameCompetition, {
        key: "league_playin_playoff",
        label: "Superliga",
        count: 4,
        ordinal: 4,
    })
    // Leo: 8 títulos + 4 subcampeonatos (Torneo Argentino 2016 es una liga),
    // 12 torneos distintos. Sus dos torneos con campeón y finalista del mismo
    // jugador (Torneo Argentino 2021/22 y Mundial de Ferraris) cuentan una vez.
    assert.deepEqual(titleContext.runnerUp, {
        player: { id: "u-leo", name: "Leo" },
        isAlsoChampion: false,
        rank: 1,
        titles: 8,
        runnerUps: 4,
        titlesAndRunnerUps: 12,
        finalsPlayed: 8,
        finalsWon: 5,
        finalsLost: 3,
        beforeThisTournament: {
            titles: 8,
            runnerUps: 3,
            titlesAndRunnerUps: 11,
            finalsPlayed: 7,
            finalsWon: 5,
            finalsLost: 2,
        },
        sameCompetition: {
            titles: 0,
            runnerUps: 1,
            titlesAndRunnerUps: 1,
            finalsPlayed: 1,
            finalsWon: 0,
            finalsLost: 1,
        },
    })
})

test("counters as of Copa Argentina 2025/26 include it and count each tournament once", () => {
    const tournaments = prodTournaments()
    const { titleContext } = buildTitleContext({
        tournaments,
        tournament: byNumber(tournaments, 14),
    })

    assert.deepEqual(
        Object.fromEntries(
            titleContext.ranking.map((row) => [row.player.name, counters(row)])
        ),
        {
            Leo: {
                titles: 9,
                runnerUps: 4,
                titlesAndRunnerUps: 13,
                finalsPlayed: 9,
                finalsWon: 6,
                finalsLost: 3,
            },
            Max: {
                titles: 6,
                runnerUps: 4,
                titlesAndRunnerUps: 10,
                finalsPlayed: 8,
                finalsWon: 4,
                finalsLost: 4,
            },
            Nico: {
                titles: 4,
                runnerUps: 2,
                titlesAndRunnerUps: 6,
                finalsPlayed: 5,
                finalsWon: 4,
                finalsLost: 1,
            },
            Santi: {
                titles: 1,
                runnerUps: 4,
                titlesAndRunnerUps: 5,
                finalsPlayed: 4,
                finalsWon: 1,
                finalsLost: 3,
            },
            Lucho: {
                titles: 0,
                runnerUps: 0,
                titlesAndRunnerUps: 0,
                finalsPlayed: 0,
                finalsWon: 0,
                finalsLost: 0,
            },
        }
    )
    assert.equal(titleContext.countsIncludeThisTournament, true)

    const { champion, runnerUp } = titleContext

    // Leo: 13 con esta Copa Argentina, 12 antes.
    assert.equal(champion.titlesAndRunnerUps, 13)
    assert.equal(champion.beforeThisTournament.titlesAndRunnerUps, 12)
    assert.equal(champion.beforeThisTournament.titles, 8)
    // Familia Eliminatoria: Copa Argentina 2018 (subcampeón) y esta (campeón).
    assert.deepEqual(champion.sameCompetition, {
        titles: 1,
        runnerUps: 1,
        titlesAndRunnerUps: 2,
        finalsPlayed: 2,
        finalsWon: 1,
        finalsLost: 1,
    })
    assert.equal(titleContext.competition.key, "playoff")
    assert.equal(titleContext.competition.label, "Eliminatoria")
    assert.equal(runnerUp.player.name, "Nico")
    assert.equal(runnerUp.isAlsoChampion, false)
    assert.deepEqual(runnerUp.sameCompetition, {
        titles: 0,
        runnerUps: 1,
        titlesAndRunnerUps: 1,
        finalsPlayed: 1,
        finalsWon: 0,
        finalsLost: 1,
    })
})

test("a league has a champion and a runner-up but no final", () => {
    const tournaments = [
        t(1, "Liga A 2020", "league", "nico", "leo", "2020-01-01T00:00:00Z"),
        t(2, "Copa A 2021", "playoff", "nico", "leo", "2021-01-01T00:00:00Z"),
    ]
    const { titleContext } = buildTitleContext({
        tournaments,
        tournament: tournaments[1],
    })
    const rowOf = (name) =>
        titleContext.ranking.find(({ player }) => player.name === name)

    assert.deepEqual(counters(rowOf("Leo")), {
        titles: 0,
        runnerUps: 2,
        titlesAndRunnerUps: 2,
        finalsPlayed: 1,
        finalsWon: 0,
        finalsLost: 1,
    })
    assert.deepEqual(counters(rowOf("Nico")), {
        titles: 2,
        runnerUps: 0,
        titlesAndRunnerUps: 2,
        finalsPlayed: 1,
        finalsWon: 1,
        finalsLost: 0,
    })
})

test("a human who is champion and runner-up of the same tournament counts once, as a title and a final won", () => {
    for (const format of ["league", "playoff", "world_cup"]) {
        const tournaments = [
            t(1, "Torneo A", format, "max", "max", "2020-01-01T00:00:00Z"),
        ]
        const { titleContext } = buildTitleContext({
            tournaments,
            tournament: tournaments[0],
        })
        const hasFinal = format !== "league"

        assert.deepEqual(
            counters(titleContext.champion),
            {
                titles: 1,
                runnerUps: 0,
                titlesAndRunnerUps: 1,
                finalsPlayed: hasFinal ? 1 : 0,
                finalsWon: hasFinal ? 1 : 0,
                finalsLost: 0,
            },
            format
        )
        assert.equal(titleContext.runnerUp.isAlsoChampion, true, format)
        assert.deepEqual(
            counters(titleContext.runnerUp),
            counters(titleContext.champion),
            format
        )
    }
})

test("previous winners of the competition are ordered and exclude the current edition", () => {
    const tournaments = prodTournaments()
    const { titleContext } = buildTitleContext({
        tournaments,
        tournament: byNumber(tournaments, 13),
    })
    const { competition } = titleContext

    assert.equal(competition.key, "league_playin_playoff")
    assert.equal(competition.label, "Superliga")
    assert.deepEqual(
        competition.previousWinners.map(({ name, champion }) => [
            name,
            champion.player.name,
        ]),
        [
            ["Superliga Europea 2022", "Nico"],
            ["Superliga Inglesa 2022", "Nico"],
            ["Superliga Argentina 2023", "Max"],
            ["Superliga Inglesa 2024", "Nico"],
        ]
    )
    assert.deepEqual(Object.keys(competition.previousWinners[0]), [
        "tournamentId",
        "name",
        "closedAt",
        "champion",
    ])
})

test("american_cup and club_world_cup are families of their own, without warnings", () => {
    const tournaments = prodTournaments()
    const americanCup = buildTitleContext({
        tournaments,
        tournament: byNumber(tournaments, 24),
    })
    assert.deepEqual(americanCup.warnings, [])
    assert.deepEqual(americanCup.titleContext.competition.key, "american_cup")
    assert.deepEqual(americanCup.titleContext.competition.label, "Copa América")
    assert.deepEqual(americanCup.titleContext.champion.titlesSameCompetition, {
        key: "american_cup",
        label: "Copa América",
        count: 1,
        ordinal: 1,
    })
    // Copa Argentina 2018 (`playoff`) ya no comparte familia con la Copa América.
    assert.deepEqual(americanCup.titleContext.competition.previousWinners, [])
    const clubWorldCup = buildTitleContext({
        tournaments,
        tournament: byNumber(tournaments, 22),
    })
    assert.deepEqual(clubWorldCup.warnings, [])
    assert.deepEqual(clubWorldCup.titleContext.champion.titlesSameCompetition, {
        key: "club_world_cup",
        label: "Mundial de Clubes",
        count: 1,
        ordinal: 1,
    })
    // Copa Argentina 2018 es la primera Eliminatoria (la Copa América 2019 ya no cuenta ahí).
    const copaArgentina = buildTitleContext({
        tournaments,
        tournament: byNumber(tournaments, 23),
    })
    assert.equal(copaArgentina.titleContext.competition.label, "Eliminatoria")
    assert.equal(
        copaArgentina.titleContext.champion.titlesSameCompetition.count,
        1
    )
})
test("the context is as of the tournament's closing: later titles do not count", () => {
    const tournaments = prodTournaments()
    const { titleContext } = buildTitleContext({
        tournaments,
        tournament: byNumber(tournaments, 5),
    })

    assert.deepEqual(titlesOf(titleContext.ranking), {
        Leo: 5,
        Max: 5,
        Nico: 2,
        Santi: 1,
    })

    const { champion } = titleContext

    assert.equal(champion.titleNumber, 2)
    assert.equal(champion.rank, 3)
    assert.equal(champion.gapToLeader.behind, 3)
    assert.equal(champion.consecutiveTitles, 2)
    assert.equal(champion.wasDefendingChampion, true)
    assert.equal(champion.titlesSameCompetition.ordinal, 2)
    assert.equal(titleContext.competition.previousWinners.length, 1)
})

test("a first title, and ranks that tie share a position", () => {
    const tournaments = prodTournaments()
    const { titleContext } = buildTitleContext({
        tournaments,
        tournament: byNumber(tournaments, 24),
    })

    assert.equal(titleContext.champion.player.name, "Santi")
    assert.equal(titleContext.champion.isFirstTitle, true)
    assert.equal(titleContext.champion.titleNumber, 1)
    // Antes de 2019: Max 5 títulos, Leo 3, Santi 1.
    assert.deepEqual(
        titleContext.ranking.map(({ player, titles, rank }) => [
            player.name,
            titles,
            rank,
        ]),
        [
            ["Max", 5, 1],
            ["Leo", 3, 2],
            ["Santi", 1, 3],
            ["Nico", 0, 4],
        ]
    )
    assert.equal(titleContext.champion.wasDefendingChampion, false)
    assert.equal(
        titleContext.champion.titlesSameCompetition.key,
        "american_cup"
    )
    assert.equal(
        titleContext.champion.titlesSameCompetition.label,
        "Copa América"
    )
    assert.equal(titleContext.champion.titlesSameCompetition.ordinal, 1)
})

test("equal titles and titles-plus-runner-ups share the rank and the next one skips positions", () => {
    const tournaments = [
        t(1, "Liga A 2020", "league", "nico", "leo", "2020-01-01T00:00:00Z"),
        t(2, "Liga A 2021", "league", "leo", "nico", "2021-01-01T00:00:00Z"),
        t(3, "Liga A 2022", "league", "max", "leo", "2022-01-01T00:00:00Z"),
    ]
    const ranking = computeTitleRanking(tournaments)

    // Nico: 1 título y 2 torneos con título o subcampeonato. Leo: 1 y 3. Max: 1 y 1.
    assert.deepEqual(
        ranking.map(({ player, titles, titlesAndRunnerUps, rank }) => [
            player.name,
            titles,
            titlesAndRunnerUps,
            rank,
        ]),
        [
            ["Leo", 1, 3, 1],
            ["Nico", 1, 2, 2],
            ["Max", 1, 1, 3],
            ["Santi", 0, 0, 4],
        ]
    )

    const tied = computeTitleRanking([
        t(1, "Liga A 2020", "league", "nico", "leo", "2020-01-01T00:00:00Z"),
        t(2, "Liga A 2021", "league", "leo", "nico", "2021-01-01T00:00:00Z"),
    ])

    assert.deepEqual(
        tied.map(({ player, rank }) => [player.name, rank]),
        [
            ["Leo", 1],
            ["Nico", 1],
            ["Max", 3],
            ["Santi", 3],
        ]
    )
})

test("a finalist who is also the champion counts one title and no runner-up", () => {
    const [ranking] = computeTitleRanking([
        t(
            1,
            "Mundial A 2020",
            "world_cup",
            "max",
            "max",
            "2020-01-01T00:00:00Z"
        ),
    ])

    assert.equal(ranking.player.name, "Max")
    assert.deepEqual(counters(ranking), {
        titles: 1,
        runnerUps: 0,
        titlesAndRunnerUps: 1,
        finalsPlayed: 1,
        finalsWon: 1,
        finalsLost: 0,
    })
    assert.equal("finals" in ranking, false)
})

test("lead change: new leader, tied for the lead, or none", () => {
    const base = [
        t(1, "Liga A 2020", "league", "nico", "max", "2020-01-01T00:00:00Z"),
        t(2, "Liga A 2021", "league", "leo", "max", "2021-01-01T00:00:00Z"),
    ]
    const context = (tournaments, index) =>
        buildTitleContext({ tournaments, tournament: tournaments[index] })
            .titleContext.champion

    // Nico y Leo con 1; Nico gana el 2.º: pasa a liderar solo.
    const newLeader = [
        ...base,
        t(3, "Liga A 2022", "league", "nico", "max", "2022-01-01T00:00:00Z"),
    ]

    assert.equal(context(newLeader, 2).leadChange, "new_leader")
    assert.equal(context(newLeader, 2).gapToLeader, null)

    // Leo le gana a Nico (que tiene 2): lo alcanza.
    const tiedForLead = [
        t(1, "Liga A 2020", "league", "nico", "max", "2020-01-01T00:00:00Z"),
        t(2, "Liga A 2021", "league", "nico", "max", "2021-01-01T00:00:00Z"),
        t(3, "Liga A 2022", "league", "leo", "max", "2022-01-01T00:00:00Z"),
        t(4, "Liga A 2023", "league", "leo", "max", "2023-01-01T00:00:00Z"),
    ]

    assert.equal(context(tiedForLead, 3).leadChange, "tied_for_lead")
    assert.equal(context(tiedForLead, 2).leadChange, null)

    // Leo ya lideraba solo y lo sigue haciendo.
    const extends_ = [
        t(1, "Liga A 2020", "league", "leo", "max", "2020-01-01T00:00:00Z"),
        t(2, "Liga A 2021", "league", "leo", "max", "2021-01-01T00:00:00Z"),
    ]

    assert.equal(context(extends_, 1).leadChange, null)
})

test("consecutive titles skip tournaments the player did not play and break on one they lost", () => {
    const withoutNico = { players: [P.leo, P.max, P.santi] }
    const tournaments = [
        t(
            1,
            "Copa Alfa 2020",
            "playoff",
            "nico",
            "leo",
            "2020-01-01T00:00:00Z"
        ),
        // Nico no jugó este: no corta la racha.
        t(
            2,
            "Copa Beta 2021",
            "playoff",
            "leo",
            "max",
            "2021-01-01T00:00:00Z",
            withoutNico
        ),
        t(
            3,
            "Copa Alfa 2022",
            "playoff",
            "nico",
            "leo",
            "2022-01-01T00:00:00Z"
        ),
        // Nico jugó y no ganó: corta.
        t(
            4,
            "Copa Gamma 2023",
            "playoff",
            "max",
            "leo",
            "2023-01-01T00:00:00Z"
        ),
        t(
            5,
            "Copa Alfa 2024",
            "playoff",
            "nico",
            "leo",
            "2024-01-01T00:00:00Z"
        ),
    ]
    const consecutive = (index) =>
        buildTitleContext({ tournaments, tournament: tournaments[index] })
            .titleContext.champion.consecutiveTitles

    assert.equal(consecutive(2), 2)
    assert.equal(consecutive(4), 1)
})

test("defending champion needs the previous edition of the same format, not just the previous tournament", () => {
    const tournaments = [
        t(
            1,
            "Copa Alfa 2020",
            "playoff",
            "nico",
            "leo",
            "2020-01-01T00:00:00Z"
        ),
        t(2, "Liga Beta 2021", "league", "leo", "nico", "2021-01-01T00:00:00Z"),
        t(
            3,
            "Copa Gamma 2022",
            "playoff",
            "nico",
            "leo",
            "2022-01-01T00:00:00Z"
        ),
        t(
            4,
            "Copa Delta 2023",
            "playoff",
            "leo",
            "nico",
            "2023-01-01T00:00:00Z"
        ),
        t(
            5,
            "Copa Alfa 2024",
            "playoff",
            "nico",
            "leo",
            "2024-01-01T00:00:00Z"
        ),
    ]
    const contextOf = (index) =>
        buildTitleContext({
            tournaments,
            tournament: tournaments[index],
        }).titleContext.champion

    // El torneo anterior fue una liga, pero la edición anterior del formato
    // (otro nombre) la ganó el mismo jugador.
    const third = contextOf(2)

    assert.equal(third.wasDefendingChampion, true)
    assert.equal(third.titlesSameCompetition.count, 2)
    assert.equal(third.titlesSameCompetition.label, "Eliminatoria")
    assert.equal(third.consecutiveTitles, 1)
    // Una liga en el medio no cuenta como edición de las copas.
    assert.equal(contextOf(1).wasDefendingChampion, false)
    assert.equal(contextOf(1).titlesSameCompetition.ordinal, 1)
    assert.equal(contextOf(1).titlesSameCompetition.label, "Liga")
    // La edición anterior (2023) la ganó otro: no defiende, y es su 3ra.
    const fifth = contextOf(4)

    assert.equal(fifth.wasDefendingChampion, false)
    assert.equal(fifth.titlesSameCompetition.ordinal, 3)
})

test("previousTitle and defendedEdition name the two different tournaments", () => {
    const champion = (tournaments, index) =>
        buildTitleContext({ tournaments, tournament: tournaments[index] })
            .titleContext.champion
    const idOf = (tournament) => String(tournament._id)

    // Back-to-back titles of different formats: previousTitle sí, defendedEdition no.
    const backToBack = [
        t(
            "1",
            "Copa Alfa 2020",
            "playoff",
            "nico",
            "leo",
            "2020-01-01T00:00:00Z"
        ),
        t(
            "2",
            "Liga Beta 2021",
            "league",
            "nico",
            "leo",
            "2021-01-01T00:00:00Z"
        ),
    ]
    const second = champion(backToBack, 1)

    assert.equal(second.consecutiveTitles, 2)
    assert.equal(second.wasDefendingChampion, false)
    assert.equal(second.defendedEdition, null)
    assert.deepEqual(second.previousTitle, {
        tournamentId: idOf(backToBack[0]),
        name: "Copa Alfa 2020",
        competitionLabel: "Eliminatoria",
        closedAt: "2020-01-01T00:00:00.000Z",
    })

    // Defiende la familia con un torneo de otro formato en el medio que ganó otro:
    // defendedEdition sí, previousTitle no (la racha se cortó).
    const defending = [
        t(
            "1",
            "Copa Alfa 2020",
            "playoff",
            "nico",
            "leo",
            "2020-01-01T00:00:00Z"
        ),
        t(
            "2",
            "Liga Beta 2021",
            "league",
            "leo",
            "nico",
            "2021-01-01T00:00:00Z"
        ),
        t(
            "3",
            "Copa Gamma 2022",
            "playoff",
            "nico",
            "leo",
            "2022-01-01T00:00:00Z"
        ),
    ]
    const third = champion(defending, 2)

    assert.equal(third.consecutiveTitles, 1)
    assert.equal(third.previousTitle, null)
    assert.equal(third.wasDefendingChampion, true)
    assert.deepEqual(third.defendedEdition, {
        tournamentId: idOf(defending[0]),
        name: "Copa Alfa 2020",
        closedAt: "2020-01-01T00:00:00.000Z",
    })
    // Es el último de competition.previousWinners.
    const { competition } = buildTitleContext({
        tournaments: defending,
        tournament: defending[2],
    }).titleContext

    assert.equal(
        competition.previousWinners.at(-1).tournamentId,
        third.defendedEdition.tournamentId
    )

    // Las dos cosas a la vez, en torneos distintos (el caso del Torneo Argentino
    // 2021/22): defendió la Liga de 2018 y viene de ganar la Champions.
    const both = [
        t(
            "1",
            "Torneo Argentino 2018",
            "league",
            "leo",
            "nico",
            "2018-01-01T00:00:00Z"
        ),
        t(
            "2",
            "Chempions 2019/20",
            "champions_league",
            "leo",
            "max",
            "2019-01-01T00:00:00Z"
        ),
        t(
            "3",
            "Torneo Argentino 2021/22",
            "league",
            "leo",
            "leo",
            "2021-01-01T00:00:00Z"
        ),
    ]
    const argentino = champion(both, 2)

    assert.equal(argentino.consecutiveTitles, 3)
    assert.equal(argentino.previousTitle.name, "Chempions 2019/20")
    assert.equal(argentino.previousTitle.competitionLabel, "Champions")
    assert.equal(argentino.defendedEdition.name, "Torneo Argentino 2018")
    assert.notEqual(
        argentino.previousTitle.tournamentId,
        argentino.defendedEdition.tournamentId
    )

    // Primer título: ninguno de los dos.
    const first = champion(backToBack, 0)

    assert.equal(first.isFirstTitle, true)
    assert.equal(first.previousTitle, null)
    assert.equal(first.defendedEdition, null)
})

test("not playing an intermediate tournament does not break the previousTitle streak", () => {
    const withoutNico = { players: [P.leo, P.max, P.santi] }
    const tournaments = [
        t(
            "1",
            "Copa Alfa 2020",
            "playoff",
            "nico",
            "leo",
            "2020-01-01T00:00:00Z"
        ),
        // Nico no jugó este: no corta la racha ni es su previousTitle.
        t(
            "2",
            "Liga Beta 2021",
            "league",
            "leo",
            "max",
            "2021-01-01T00:00:00Z",
            withoutNico
        ),
        t(
            "3",
            "Copa Gamma 2022",
            "world_cup",
            "nico",
            "leo",
            "2022-01-01T00:00:00Z"
        ),
        // Nico jugó y no ganó: corta la racha.
        t(
            "4",
            "Copa Delta 2023",
            "playoff",
            "max",
            "leo",
            "2023-01-01T00:00:00Z"
        ),
        t(
            "5",
            "Copa Epsilon 2024",
            "super_cup",
            "nico",
            "leo",
            "2024-01-01T00:00:00Z"
        ),
    ]
    const champion = (index) =>
        buildTitleContext({ tournaments, tournament: tournaments[index] })
            .titleContext.champion

    assert.equal(champion(2).consecutiveTitles, 2)
    assert.equal(champion(2).previousTitle.name, "Copa Alfa 2020")
    assert.equal(champion(2).previousTitle.competitionLabel, "Eliminatoria")
    assert.equal(champion(4).consecutiveTitles, 1)
    assert.equal(champion(4).previousTitle, null)
    // previousTitle existe sii consecutiveTitles >= 2.
    for (let index = 0; index < tournaments.length; index++) {
        if (!tournaments[index].outcome) continue

        const { consecutiveTitles, previousTitle } = champion(index)

        assert.equal(previousTitle !== null, consecutiveTitles >= 2, index)
    }
})

test("a tournament with a missing or unknown format raises a warning and lands in its own family", () => {
    const tournaments = [
        t(1, "Liga A 2020", "league", "nico", "max", "2020-01-01T00:00:00Z"),
        t(2, "Torneo raro", undefined, "nico", "max", "2021-01-01T00:00:00Z"),
        t(3, "Liga B 2022", "league", "nico", "max", "2022-01-01T00:00:00Z"),
        t(
            4,
            "Torneo nuevo",
            "formato_nuevo",
            "nico",
            "max",
            "2023-01-01T00:00:00Z"
        ),
    ]
    const result = buildTitleContext({
        tournaments,
        tournament: tournaments[3],
    })

    assert.equal(result.titleContext.champion.titleNumber, 4)
    assert.equal(
        result.titleContext.champion.titlesSameCompetition.key,
        "formato_nuevo"
    )
    assert.equal(result.titleContext.champion.titlesSameCompetition.ordinal, 1)
    assert.equal(result.warnings.length, 1)
    assert.match(
        result.warnings[0],
        /2 torneo\(s\) con formato ausente o desconocido/
    )
    assert.match(result.warnings[0], /sin formato, formato_nuevo/)
    // El torneo sin formato cuenta para todos los que vienen después; con solo
    // formatos conocidos no hay advertencia.
    assert.deepEqual(
        buildTitleContext({ tournaments, tournament: tournaments[2] }).warnings
            .length,
        1
    )
    assert.deepEqual(
        buildTitleContext({
            tournaments: [tournaments[0]],
            tournament: tournaments[0],
        }).warnings,
        []
    )
})

test("a tournament without closedAt is ordered first and raises a warning", () => {
    const tournaments = [
        t(1, "Liga A 2020", "league", "nico", "max", "2020-01-01T00:00:00Z"),
        t(2, "Liga A sin fecha", "league", "leo", "max", undefined),
    ]
    const result = buildTitleContext({
        tournaments,
        tournament: tournaments[0],
    })

    // El que no tiene fecha va primero: cuando se cierra el de 2020, ya cuenta.
    assert.deepEqual(titlesOf(result.titleContext.ranking), {
        Leo: 1,
        Nico: 1,
        Max: 0,
        Santi: 0,
    })
    assert.equal(result.warnings.length, 1)
    assert.match(result.warnings[0], /sin fecha de cierre/)
    assert.equal(
        buildTitleContext({ tournaments, tournament: tournaments[1] })
            .titleContext.asOf,
        null
    )
})

test("the current tournament is added when it is not in the list", () => {
    const tournaments = [
        t(1, "Liga A 2020", "league", "nico", "max", "2020-01-01T00:00:00Z"),
    ]
    const current = t(
        2,
        "Liga A 2021",
        "league",
        "nico",
        "max",
        "2021-01-01T00:00:00Z"
    )
    const { titleContext } = buildTitleContext({
        tournaments,
        tournament: current,
    })

    assert.equal(titleContext.champion.titleNumber, 2)
    assert.equal(titleContext.tournamentsConsidered, 2)
})

test("a tournament that does not count has no title context", () => {
    const current = t(2, "Liga A 2021", "league", null, null, undefined, {
        valid: false,
    })

    assert.deepEqual(
        buildTitleContext({ tournaments: [], tournament: current }),
        {
            titleContext: null,
            warnings: [],
        }
    )
})

test("nameOf replaces the stored player names everywhere", () => {
    const tournaments = prodTournaments()
    const nameOf = ({ id, name }) => (id === "u-max" ? "Maximiliano" : name)
    const { titleContext } = buildTitleContext({
        tournaments,
        tournament: byNumber(tournaments, 7),
        nameOf,
    })

    assert.equal(titleContext.champion.player.name, "Maximiliano")
    assert.ok(
        titleContext.ranking.some(({ player }) => player.name === "Maximiliano")
    )
    assert.equal(
        titleContext.competition.previousWinners.some(
            ({ champion }) => champion.player.name === "Maxi"
        ),
        false
    )
})

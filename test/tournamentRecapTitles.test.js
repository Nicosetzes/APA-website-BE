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
    // 4 títulos y la final perdida de 2022/23.
    assert.equal(champion.finalsPlayed, 5)
    // La familia sale del formato: sus 4 títulos de league_playin_playoff.
    assert.equal("titlesSameFormat" in champion, false)
    assert.deepEqual(champion.titlesSameCompetition, {
        key: "league_playin_playoff",
        label: "Superliga",
        count: 4,
        ordinal: 4,
    })
    assert.deepEqual(titleContext.runnerUp, {
        player: { id: "u-leo", name: "Leo" },
        finalsPlayed: 12,
        titles: 8,
    })
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

test("equal titles and finals share the rank and the next one skips positions", () => {
    const tournaments = [
        t(1, "Liga A 2020", "league", "nico", "leo", "2020-01-01T00:00:00Z"),
        t(2, "Liga A 2021", "league", "leo", "nico", "2021-01-01T00:00:00Z"),
        t(3, "Liga A 2022", "league", "max", "leo", "2022-01-01T00:00:00Z"),
    ]
    const ranking = computeTitleRanking(tournaments)

    // Nico: 1 título y 2 finales. Leo: 1 título y 3 finales. Max: 1 título y 1 final.
    assert.deepEqual(
        ranking.map(({ player, titles, finals, rank }) => [
            player.name,
            titles,
            finals,
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

test("a finalist who is also the champion counts one final", () => {
    const [ranking] = computeTitleRanking([
        t(1, "Liga A 2020", "league", "max", "max", "2020-01-01T00:00:00Z"),
    ])

    assert.equal(ranking.player.name, "Max")
    assert.equal(ranking.titles, 1)
    assert.equal(ranking.finals, 1)
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

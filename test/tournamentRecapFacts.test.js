process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const test = require("node:test")

const { buildFacts } = require("../controller/getTournamentRecapContext/facts")
const {
    buildStandingsProgress,
} = require("../controller/getTournamentRecapContext/standingsProgress")
const {
    buildMatchEntries,
} = require("../controller/getTournamentRecapContext/matchLog")
const {
    buildTitleContext,
} = require("../controller/getTournamentRecapContext/titles")
const {
    FACTS_MAX,
    TITLE_RACE_LAST_MATCHES,
    UPSET_WINNER_EXPECTED_MAX,
} = require("../config/tournamentRecap")
const {
    LEO,
    MAX,
    NICO,
    SANTI,
    mkMatch,
    stubEvent,
    stubTimeline,
    team,
} = require("./fixtures/tournamentRecap")

const T = {
    nico: team(1, "Liverpool"),
    max: team(2, "Chelsea"),
    leo: team(3, "Bayern"),
    santi: team(4, "Milan"),
}

const ref = (player, teamRef) => ({
    player: { id: player.id, name: player.name },
    team: { id: teamRef.id, name: teamRef.name },
})

// Entradas del log de partidos a partir de definiciones mínimas.
const entriesFrom = (definitions, format = "league_playin_playoff") => {
    const matches = definitions.map(({ event, ...config }, index) =>
        mkMatch({ n: index + 1, ...config })
    )
    const timeline = stubTimeline(
        definitions
            .map(({ event }, index) =>
                event === null ? null : stubEvent(matches[index], event ?? {})
            )
            .filter(Boolean)
    )

    return buildMatchEntries({
        matches,
        timeline,
        tournament: { format },
    })
}

const base = () => ({
    tournament: {
        name: "Superliga de prueba",
        format: "league_playin_playoff",
    },
    rules: { stages: ["regular", "playin", "playoff"] },
    result: {
        champion: ref(NICO, T.nico),
        runnerUp: ref(MAX, T.max),
        source: "table",
        final: null,
    },
    standings: null,
    ties: [],
    championPath: { regular: null, playin: null, ties: [] },
    entries: [],
    ratingMovement: {
        players: [],
        biggestGainer: null,
        biggestLoser: null,
        overtakes: [],
    },
    playerStats: { players: [] },
    headToHead: [],
    titleContext: null,
})

const facts = (overrides = {}) => buildFacts({ ...base(), ...overrides })
const typesOf = (list) => list.map(({ type }) => type)
const find = (list, type) => list.find((fact) => fact.type === type)

const ko = (config) => ({
    type: "playoff",
    playoffId: 15,
    seeds: ["1", "2"],
    ...config,
})

test("the champion path is always present and names the champion", () => {
    const list = facts({
        championPath: {
            regular: { group: "A", position: 2, points: 31 },
            playin: { played: true, matchSeqs: [3] },
            ties: [{ wonTie: true }, { wonTie: true }],
        },
    })
    const fact = find(list, "champion_path")

    assert.equal(fact.importance, 5)
    assert.match(fact.text, /Nico \(Liverpool\)/)
    assert.match(fact.text, /2° en el grupo A con 31 puntos/)
    assert.match(fact.text, /play-in/)
    assert.match(fact.text, /ganó 2 cruces/)
    assert.deepEqual(typesOf(facts()), ["champion_path"])
})

test("final_summary needs a final and orients the score to the winner", () => {
    assert.equal(find(facts(), "final_summary"), undefined)

    const result = {
        ...base().result,
        champion: ref(NICO, T.nico),
        runnerUp: ref(MAX, T.max),
        final: {
            matchId: "m1",
            score: [1, 1],
            winner: "p2",
            penalties: { winner: "p2", score: [3, 5] },
            decidedBy: "penalties",
            aggregate: null,
        },
    }
    const fact = find(facts({ result }), "final_summary")

    assert.match(fact.text, /Nico \(Liverpool\) le ganó a Max \(Chelsea\) 1-1/)
    assert.match(fact.text, /penales \(5-3\)/)
    assert.deepEqual(fact.matchIds, ["m1"])
})

test("title_milestone tells the number, the gap to the leader and the competition ordinal", () => {
    const closed = (number, name, champion, date) => ({
        _id: `00000000000000000000000${number}`,
        name,
        format: "league_playin_playoff",
        players: [NICO, LEO, MAX, SANTI],
        ongoing: false,
        closedAt: new Date(date),
        outcome: {
            champion: { player: champion, team: team(number, "Equipo") },
            finalist: { player: MAX, team: team(9, "Rival") },
        },
    })
    const tournaments = [
        closed(1, "Superliga Europea 2022", LEO, "2022-01-01"),
        closed(2, "Superliga Inglesa 2023", LEO, "2023-01-01"),
        closed(3, "Superliga Argentina 2024", NICO, "2024-01-01"),
    ]
    const { titleContext } = buildTitleContext({
        tournaments,
        tournament: tournaments[2],
    })
    const fact = find(facts({ titleContext }), "title_milestone")

    assert.equal(fact.importance, 5)
    assert.match(fact.text, /primer título de Nico en la historia/)
    assert.match(fact.text, /queda a 1 de alcanzar a Leo/)
    assert.match(fact.text, /primer título de Superliga/)

    // Segundo título de la familia y campeón vigente.
    const second = [
        ...tournaments,
        closed(4, "Superliga Internacional 2025", NICO, "2025-01-01"),
    ]
    const repeated = find(
        facts({
            titleContext: buildTitleContext({
                tournaments: second,
                tournament: second[3],
            }).titleContext,
        }),
        "title_milestone"
    )

    assert.match(repeated.text, /título número 2 de Nico/)
    // La edición defendida es también el torneo anterior de la racha: se dice
    // una sola vez.
    assert.match(
        repeated.text,
        /defendió el título de Superliga \(que había ganado en Superliga Argentina 2024, el torneo anterior que jugó\)/
    )
    assert.doesNotMatch(repeated.text, /consecutivos|viene de ganar/)
    assert.equal(repeated.data.consecutiveTitles, 2)
    assert.equal(repeated.data.defendedEdition.name, "Superliga Argentina 2024")
    assert.equal(repeated.data.previousTitle.name, "Superliga Argentina 2024")
    assert.equal(repeated.data.titlesSameCompetition.ordinal, 2)
})

test("title_milestone keeps 'defended' (same format) apart from 'comes from winning' (previous tournament)", () => {
    const closed = (number, name, format, champion, date) => ({
        _id: `00000000000000000000000${number}`,
        name,
        format,
        players: [NICO, LEO, MAX, SANTI],
        ongoing: false,
        closedAt: new Date(date),
        outcome: {
            champion: { player: champion, team: team(number, "Equipo") },
            finalist: { player: MAX, team: team(9, "Rival") },
        },
    })
    const tournaments = [
        closed(1, "Torneo Argentino 2018", "league", LEO, "2018-01-01"),
        closed(2, "Chempions 2019/20", "champions_league", LEO, "2019-01-01"),
        closed(3, "Torneo Argentino 2021/22", "league", LEO, "2021-01-01"),
    ]
    const fact = find(
        facts({
            titleContext: buildTitleContext({
                tournaments,
                tournament: tournaments[2],
            }).titleContext,
        }),
        "title_milestone"
    )

    assert.match(
        fact.text,
        /defendió el título de Liga \(que había ganado en Torneo Argentino 2018\); viene de ganar Chempions 2019\/20\./
    )
    assert.doesNotMatch(fact.text, /consecutivos/)
    assert.equal(fact.data.consecutiveTitles, 3)
    assert.equal(fact.data.wasDefendingChampion, true)
    assert.equal(fact.data.defendedEdition.name, "Torneo Argentino 2018")
    assert.equal(fact.data.previousTitle.name, "Chempions 2019/20")
})

test("biggest_upset needs a winner below the threshold and quotes % only for advance odds", () => {
    const upsetAdvance = entriesFrom([
        ko({
            p1: NICO,
            t1: T.nico,
            s1: 1,
            p2: MAX,
            t2: T.max,
            s2: 2,
            event: { expectedP1: 0.85 },
        }),
    ])
    const [advance] = facts({ entries: upsetAdvance }).filter(
        ({ type }) => type === "biggest_upset"
    )

    assert.match(advance.text, /Max \(Chelsea\) a Nico \(Liverpool\) 2-1/)
    // playoffId 15 es la final: no se "avanza de ronda", se queda con el título.
    assert.equal(advance.data.round, "final")
    assert.match(
        advance.text,
        /el modelo le daba 15% de quedarse con el título/
    )
    assert.doesNotMatch(advance.text, /de ronda/)
    assert.equal(advance.importance, 5)
    assert.equal(advance.data.odds.kind, "advance")

    // En cualquier otra ronda del cuadro sí se avanza.
    const upsetQuarterfinal = entriesFrom([
        ko({
            playoffId: 9,
            p1: NICO,
            t1: T.nico,
            s1: 1,
            p2: MAX,
            t2: T.max,
            s2: 2,
            event: { expectedP1: 0.85 },
        }),
    ])
    const [quarterfinal] = facts({ entries: upsetQuarterfinal }).filter(
        ({ type }) => type === "biggest_upset"
    )

    assert.equal(quarterfinal.data.round, "quarterfinal")
    assert.match(
        quarterfinal.text,
        /el modelo le daba 15% de avanzar en el cuadro/
    )

    const upsetLeague = entriesFrom([
        {
            p1: NICO,
            t1: T.nico,
            s1: 0,
            p2: MAX,
            t2: T.max,
            s2: 3,
            event: { expectedP1: 0.8 },
        },
    ])
    const [league] = facts({ entries: upsetLeague }).filter(
        ({ type }) => type === "biggest_upset"
    )

    // En liga no se cita un porcentaje: el empate vale 0,5.
    assert.doesNotMatch(league.text, /%/)
    assert.match(league.text, /rindió por encima de lo esperado/)
    assert.equal(league.importance, 4)
})

test("no upset at exactly the threshold or when the favorite wins", () => {
    const entries = entriesFrom([
        {
            p1: NICO,
            t1: T.nico,
            s1: 0,
            p2: MAX,
            t2: T.max,
            s2: 1,
            // Gana P2 con 1 - expectedP1 = 0,3: no es menor al umbral.
            event: { expectedP1: 1 - UPSET_WINNER_EXPECTED_MAX },
        },
        {
            p1: NICO,
            t1: T.nico,
            s1: 2,
            p2: MAX,
            t2: T.max,
            s2: 0,
            event: { expectedP1: 0.9 },
        },
    ])

    assert.equal(find(facts({ entries }), "biggest_upset"), undefined)
    assert.equal(find(facts({ entries }), "upsets"), undefined)
})

test("a match with a provisional side is never a biggest_upset or an upset", () => {
    const definition = (event) => ({
        p1: NICO,
        t1: T.nico,
        s1: 0,
        p2: MAX,
        t2: T.max,
        s2: 3,
        event,
    })
    const reliable = entriesFrom([definition({ expectedP1: 0.85 })])

    assert.ok(find(facts({ entries: reliable }), "biggest_upset"))

    // El match log sigue marcando la sorpresa; los hechos no la usan.
    for (const event of [
        { expectedP1: 0.85, games1: 3 },
        { expectedP1: 0.85, games2: 9 },
    ]) {
        const entries = entriesFrom([definition(event)])

        assert.equal(entries[0].upset, true)
        assert.equal(find(facts({ entries }), "biggest_upset"), undefined)
        assert.equal(find(facts({ entries }), "upsets"), undefined)
    }

    // Con dos sorpresas, la provisoria no cuenta ni como mayor ni en el total.
    const mixed = entriesFrom([
        definition({ expectedP1: 0.95, games1: 2 }),
        definition({ expectedP1: 0.85 }),
        definition({ expectedP1: 0.8 }),
    ])
    const list = facts({ entries: mixed })

    assert.equal(find(list, "biggest_upset").matchIds[0], mixed[1].matchId)
    assert.equal(find(list, "upsets").data.count, 2)
})

test("upsets summarizes two or more underdog wins", () => {
    const upset = {
        p1: NICO,
        t1: T.nico,
        s1: 0,
        p2: MAX,
        t2: T.max,
        s2: 2,
        event: { expectedP1: 0.8 },
    }
    const one = facts({ entries: entriesFrom([upset]) })
    const two = facts({ entries: entriesFrom([upset, upset]) })

    assert.equal(find(one, "upsets"), undefined)
    assert.equal(find(two, "upsets").data.count, 2)
    assert.equal(find(two, "upsets").importance, 3)
})

const unit = (player, teamRef, seed = "1") => ({
    player: { id: player.id, name: player.name },
    team: { id: teamRef.id, name: teamRef.name },
    seed,
})

const tie = (config) => ({
    round: "quarterfinal",
    playoffId: 9,
    units: [unit(NICO, T.nico), unit(MAX, T.max, "2")],
    winnerIndex: 0,
    decidedBy: "single_match",
    aggregate: null,
    entries: [],
    matchSeqs: [],
    ...config,
})

test("top_seed_early_exit needs the highest overall of the bracket to fall before the semifinals", () => {
    const entries = entriesFrom([
        ko({
            playoffId: 9,
            p1: NICO,
            t1: T.nico,
            s1: 1,
            p2: MAX,
            t2: T.max,
            s2: 0,
            event: { ovr1: 84, ovr2: 90 },
        }),
        ko({
            playoffId: 13,
            p1: NICO,
            t1: T.nico,
            s1: 1,
            p2: LEO,
            t2: T.leo,
            s2: 0,
            event: { ovr1: 84, ovr2: 80 },
        }),
    ])
    const early = facts({
        entries,
        ties: [tie({ round: "quarterfinal" })],
    })
    const fact = find(early, "top_seed_early_exit")

    assert.match(fact.text, /Chelsea \(Max\)/)
    assert.match(fact.text, /overall del cuadro \(90\)/)
    assert.match(fact.text, /cuartos de final/)
    assert.equal(fact.data.eliminatedBy, "Liverpool")

    // Si cae en semifinales ya no es una salida temprana.
    assert.equal(
        find(
            facts({ entries, ties: [tie({ round: "semifinal" })] }),
            "top_seed_early_exit"
        ),
        undefined
    )
    // Sin overall no hay favorito.
    assert.equal(
        find(
            facts({
                entries: entriesFrom([
                    ko({
                        p1: NICO,
                        t1: T.nico,
                        s1: 1,
                        p2: MAX,
                        t2: T.max,
                        s2: 0,
                    }),
                ]),
                ties: [tie()],
            }),
            "top_seed_early_exit"
        ),
        undefined
    )
})

test("cinderella_run needs the finalist to sit at least 5 overall points below the bracket average", () => {
    const run = (ovr) =>
        facts({
            entries: entriesFrom([
                ko({
                    p1: NICO,
                    t1: T.nico,
                    s1: 1,
                    p2: MAX,
                    t2: T.max,
                    s2: 0,
                    event: { ovr1: ovr, ovr2: 90 },
                }),
                ko({
                    p1: LEO,
                    t1: T.leo,
                    s1: 1,
                    p2: SANTI,
                    t2: T.santi,
                    s2: 0,
                    event: { ovr1: 90, ovr2: 90 },
                }),
            ]),
        })

    // Los otros tres equipos tienen 90: con 83 el promedio es 88,25 (5,3 por
    // encima); con 84, 88,5 (4,5 por encima).
    const fact = find(run(83), "cinderella_run")

    assert.match(
        fact.text,
        /Liverpool \(Nico\) llegó hasta el título con un overall de 83, 5.3 puntos por debajo/
    )
    assert.equal(fact.importance, 4)
    assert.equal(find(run(84), "cinderella_run"), undefined)
})

test("series_comeback only when the winner lost the first match", () => {
    const comeback = entriesFrom([
        ko({
            leg: 1,
            legDraw: true,
            p1: MAX,
            t1: T.max,
            s1: 2,
            p2: NICO,
            t2: T.nico,
            s2: 0,
            event: {},
        }),
        ko({
            leg: 2,
            legDraw: true,
            p1: NICO,
            t1: T.nico,
            s1: 3,
            p2: MAX,
            t2: T.max,
            s2: 0,
            event: {},
        }),
    ])
    const common = {
        round: "semifinal",
        units: [unit(MAX, T.max), unit(NICO, T.nico, "2")],
        aggregate: [2, 3],
    }
    const withComeback = facts({
        ties: [tie({ ...common, winnerIndex: 1, entries: comeback })],
    })
    const fact = find(withComeback, "series_comeback")

    assert.match(
        fact.text,
        /Liverpool \(Nico\) perdió el primer partido ante Chelsea \(Max\)/
    )
    assert.match(fact.text, /global 2-3/)
    assert.equal(fact.importance, 4)

    const withoutComeback = facts({
        ties: [tie({ ...common, winnerIndex: 0, entries: comeback })],
    })

    assert.equal(find(withoutComeback, "series_comeback"), undefined)
    // Un cruce de partido único no tiene "ida".
    assert.equal(
        find(facts({ ties: [tie({ entries: comeback })] }), "series_comeback"),
        undefined
    )
})

test("golden_goal_tiebreak for ties decided in the third match", () => {
    const list = facts({
        ties: [tie({ round: "final", decidedBy: "golden_goal" })],
    })

    assert.match(find(list, "golden_goal_tiebreak").text, /gol de oro/)
    assert.equal(
        find(
            facts({ ties: [tie({ decidedBy: "aggregate" })] }),
            "golden_goal_tiebreak"
        ),
        undefined
    )
})

test("penalty_shootout counts playoff and play-in shootouts but not regular ones", () => {
    const shootout = ko({
        p1: NICO,
        t1: T.nico,
        s1: 1,
        p2: MAX,
        t2: T.max,
        s2: 1,
        pens: [4, 3],
        event: {},
    })
    const one = find(
        facts({ entries: entriesFrom([shootout]) }),
        "penalty_shootout"
    )

    assert.match(one.text, /se definió por penales \(4-3\)/)
    assert.equal(one.importance, 4)

    const two = find(
        facts({
            entries: entriesFrom([shootout, { ...shootout, playoffId: 9 }]),
        }),
        "penalty_shootout"
    )

    assert.match(two.text, /2 definiciones por penales/)
    assert.equal(
        find(
            facts({
                entries: entriesFrom([
                    {
                        p1: NICO,
                        t1: T.nico,
                        s1: 1,
                        p2: MAX,
                        t2: T.max,
                        s2: 1,
                        event: {},
                    },
                ]),
            }),
            "penalty_shootout"
        ),
        undefined
    )
})

const finalTable = (qualification, teamId = 7) => [
    {
        group: "A",
        teams: [
            {
                position: 8,
                team: "Real Betis",
                teamId,
                player: "Santi",
                played: 18,
                points: 20,
                gf: 20,
                ga: 20,
                qualification,
            },
        ],
    },
]

test("late_qualification for play-in and best-third qualifiers who reach the semifinals", () => {
    const semifinal = tie({
        round: "semifinal",
        units: [unit(SANTI, team(7, "Real Betis")), unit(MAX, T.max)],
    })
    const standings = (qualification) => ({
        final: finalTable(qualification),
        leaderChanges: {},
        closeRace: [],
    })

    const playin = find(
        facts({ standings: standings("playin"), ties: [semifinal] }),
        "late_qualification"
    )

    assert.match(
        playin.text,
        /Real Betis \(Santi\) llegó a las semifinales después de clasificar por el play-in/
    )
    assert.match(
        find(
            facts({ standings: standings("best_third"), ties: [semifinal] }),
            "late_qualification"
        ).text,
        /como mejor tercero/
    )
    // Clasificado directo, o eliminado en cuartos: no es una clasificación tardía.
    assert.equal(
        find(
            facts({ standings: standings("direct"), ties: [semifinal] }),
            "late_qualification"
        ),
        undefined
    )
    assert.equal(
        find(
            facts({
                standings: standings("playin"),
                ties: [{ ...semifinal, round: "quarterfinal" }],
            }),
            "late_qualification"
        ),
        undefined
    )
    // Sin fase regular no se evalúa.
    assert.equal(
        find(facts({ ties: [semifinal] }), "late_qualification"),
        undefined
    )
})

test("leader_changes needs a regular phase and at least two changes", () => {
    const standings = (leaderChanges) => ({
        final: finalTable("direct"),
        leaderChanges,
        closeRace: [],
    })

    assert.match(
        find(facts({ standings: standings({ A: 3, B: 1 }) }), "leader_changes")
            .text,
        /del grupo A cambió de manos 3 veces/
    )
    assert.equal(
        find(facts({ standings: standings({ A: 1 }) }), "leader_changes"),
        undefined
    )
    assert.equal(find(facts(), "leader_changes"), undefined)
})

test("title_race_decided_on_last_matches for a close race in a league with big groups", () => {
    const row = (position, teamId, name) => ({
        position,
        team: name,
        teamId,
        player: "Nico",
        played: 18,
        points: 30,
        gf: 30,
        ga: 20,
        qualification: "direct",
    })
    const finalTables = [
        {
            group: "A",
            teams: Array.from({ length: 6 }, (_, i) =>
                row(i + 1, i + 1, `Equipo ${i + 1}`)
            ),
        },
    ]
    const withRace = (gapToSecond, leaderTeamId) => ({
        final: finalTables,
        leaderChanges: {},
        closeRace: [
            {
                group: "A",
                leader: "Equipo 1",
                leaderTeamId,
                gapToSecond,
                matchesPlayed: 80,
                matchesLeft: 10,
            },
        ],
    })

    const close = find(
        facts({ standings: withRace(2, 1) }),
        "title_race_decided_on_last_matches"
    )

    assert.match(close.text, /grupo A se definió sobre el final/)
    // El hecho usa el mismo último tramo que closeRace (10 partidos).
    assert.match(close.text, /a falta de solo 10 partidos/)
    assert.equal(close.data.matchesLeft, 10)
    assert.equal(close.data.matchesPlayed, 80)
    assert.equal("afterPct" in close.data, false)
    assert.equal(close.data.gapToSecond, 2)
    // Otro líder a falta del último tramo también cuenta.
    assert.ok(
        find(
            facts({ standings: withRace(6, 2) }),
            "title_race_decided_on_last_matches"
        )
    )
    // Ventaja cómoda y mismo líder: no.
    assert.equal(
        find(
            facts({ standings: withRace(6, 1) }),
            "title_race_decided_on_last_matches"
        ),
        undefined
    )
    // Grupos chicos o formato de mundial: no aplica.
    assert.equal(
        find(
            facts({
                standings: {
                    ...withRace(2, 1),
                    final: [
                        { group: "A", teams: finalTables[0].teams.slice(0, 4) },
                    ],
                },
            }),
            "title_race_decided_on_last_matches"
        ),
        undefined
    )
    assert.equal(
        find(
            facts({
                standings: withRace(2, 1),
                tournament: { name: "Mundial", format: "world_cup" },
            }),
            "title_race_decided_on_last_matches"
        ),
        undefined
    )
})

test("title_race_decided_on_last_matches uses the closeRace stretch built from real matches", () => {
    // Liga de 6 equipos, ida y vuelta (30 partidos): empates hasta el partido 20
    // y victorias locales en los últimos 10 (el líder de entonces puede perder el
    // primer puesto).
    const entries6 = Array.from({ length: 6 }, (_, i) => ({
        team: team(i + 1, `Equipo ${i + 1}`),
        player: NICO,
    }))
    const matches = []

    for (let round = 0; round < 2; round++) {
        for (let i = 0; i < 6; i++) {
            for (let j = i + 1; j < 6; j++) {
                matches.push(
                    mkMatch({
                        n: matches.length + 1,
                        p1: NICO,
                        t1: entries6[i].team,
                        s1: 1,
                        p2: MAX,
                        t2: entries6[j].team,
                        // Los últimos 10 partidos los gana el local.
                        s2: matches.length >= 20 ? 0 : 1,
                        legDraw: true,
                    })
                )
            }
        }
    }

    const { standings } = buildStandingsProgress({
        tournament: { format: "league", teams: entries6 },
        matches,
        rules: { stages: ["regular"] },
    })

    assert.equal(standings.closeRace[0].matchesLeft, TITLE_RACE_LAST_MATCHES)

    const race = find(
        facts({
            tournament: { name: "Liga de prueba", format: "league" },
            rules: { stages: ["regular"] },
            standings,
        }),
        "title_race_decided_on_last_matches"
    )

    assert.equal(race.data.matchesLeft, TITLE_RACE_LAST_MATCHES)
    assert.equal(race.data.matchesPlayed, 20)
    assert.equal(race.data.leaderThen, "Equipo 1")
    assert.equal(race.data.finalLeader, "Equipo 2")
    assert.match(race.text, /a falta de solo 10 partidos/)
})

test("best_attack and best_defence need a unique leader with enough matches", () => {
    const row = (name, gf, ga, played = 18) => ({
        position: 1,
        team: name,
        teamId: name,
        player: "Nico",
        played,
        points: 0,
        gf,
        ga,
        qualification: null,
    })
    const standings = (rows) => ({
        final: [{ group: null, teams: rows }],
        leaderChanges: {},
        closeRace: [],
    })
    const list = facts({
        standings: standings([
            row("Liverpool", 40, 10),
            row("Chelsea", 30, 15),
        ]),
    })

    assert.match(
        find(list, "best_attack").text,
        /Liverpool \(Nico\) con 40 goles en 18 partidos/
    )
    assert.match(
        find(list, "best_defence").text,
        /Liverpool \(Nico\) con 10 goles en contra/
    )

    // Empate en el mejor ataque: no hay un único mejor.
    assert.equal(
        find(
            facts({
                standings: standings([row("A", 30, 10), row("B", 30, 12)]),
            }),
            "best_attack"
        ),
        undefined
    )
    // Pocos partidos jugados: no se opina.
    assert.equal(
        find(
            facts({
                standings: standings([row("A", 9, 1, 3), row("B", 4, 2, 3)]),
            }),
            "best_attack"
        ),
        undefined
    )
})

const playerLine = (name, overrides = {}) => ({
    player: { id: name, name },
    overall: {
        cleanSheets: 0,
        expectedPoints: 0,
        expectedMatches: 0,
        actualPointsInRatedMatches: 0,
        ...overrides.overall,
    },
    performanceVsExpectedPct: null,
    ...overrides.top,
    bestWinStreak: { length: 0, fromSeq: null, toSeq: null },
    bestUnbeaten: { length: 0, fromSeq: null, toSeq: null },
    worstLosingStreak: { length: 0, fromSeq: null, toSeq: null },
    ...overrides.streaks,
})

test("streak facts need the configured minimum and a unique best player", () => {
    const streak = (length) => ({ length, fromSeq: 1, toSeq: length })
    const run = (key, length, other = 0) =>
        facts({
            playerStats: {
                players: [
                    playerLine("Nico", { streaks: { [key]: streak(length) } }),
                    playerLine("Max", { streaks: { [key]: streak(other) } }),
                ],
            },
        })

    assert.match(
        find(run("bestWinStreak", 5), "longest_win_streak").text,
        /Nico tuvo una racha de 5 victorias consecutivas/
    )
    assert.equal(find(run("bestWinStreak", 4), "longest_win_streak"), undefined)
    assert.match(
        find(run("bestUnbeaten", 8), "longest_unbeaten").text,
        /8 partidos sin perder/
    )
    assert.equal(find(run("bestUnbeaten", 7), "longest_unbeaten"), undefined)
    assert.match(
        find(run("worstLosingStreak", 4), "longest_losing_streak").text,
        /4 derrotas consecutivas/
    )
    assert.equal(
        find(run("worstLosingStreak", 3), "longest_losing_streak"),
        undefined
    )
    // Dos jugadores empatados: no hay un único dueño de la racha.
    assert.equal(
        find(run("bestWinStreak", 6, 6), "longest_win_streak"),
        undefined
    )
})

test("clean_sheets_leader and standings_overperformance respect their thresholds", () => {
    const players = (cleanSheets, actual) => ({
        players: [
            playerLine("Nico", {
                overall: {
                    cleanSheets,
                    expectedPoints: 30,
                    expectedMatches: 20,
                    actualPointsInRatedMatches: actual,
                },
                top: {
                    performanceVsExpectedPct: Math.round(
                        (actual / 30 - 1) * 100
                    ),
                },
            }),
            playerLine("Max", {
                overall: {
                    cleanSheets: 1,
                    expectedPoints: 30,
                    expectedMatches: 20,
                    actualPointsInRatedMatches: 30,
                },
            }),
        ],
    })

    assert.match(
        find(facts({ playerStats: players(5, 34) }), "clean_sheets_leader")
            .text,
        /Nico fue quien más veces dejó el arco en cero: 5 partidos/
    )
    const overperformance = find(
        facts({ playerStats: players(5, 34) }),
        "standings_overperformance"
    )

    // 34 reales contra 30 esperados: 13 % por encima, sin hablar de puntos.
    assert.match(
        overperformance.text,
        /Nico rindió un 13% por encima de lo esperado según las predicciones del Elo/
    )
    assert.doesNotMatch(overperformance.text, /puntos/)
    assert.equal(overperformance.data.performanceVsExpectedPct, 13)
    assert.equal(overperformance.data.actual, 34)
    assert.equal(
        find(facts({ playerStats: players(4, 33) }), "clean_sheets_leader"),
        undefined
    )
    assert.equal(
        find(
            facts({ playerStats: players(4, 33) }),
            "standings_overperformance"
        ),
        undefined
    )
})

test("biggest_win keeps the odds of the match and never emits highest_scoring_match", () => {
    const entries = entriesFrom(
        [
            {
                p1: NICO,
                t1: T.nico,
                s1: 5,
                p2: MAX,
                t2: T.max,
                s2: 0,
                event: { expectedP1: 0.9 },
            },
            // Muchos goles pero poca diferencia: no es una goleada ni un récord.
            {
                p1: LEO,
                t1: T.leo,
                s1: 7,
                p2: SANTI,
                t2: T.santi,
                s2: 6,
                event: {},
            },
        ],
        "league"
    )
    const list = facts({ entries })
    const fact = find(list, "biggest_win")

    assert.match(
        fact.text,
        /La mayor goleada: Nico \(Liverpool\) a Max \(Chelsea\) 5-0/
    )
    assert.equal(fact.data.margin, 5)
    assert.equal(fact.data.odds.kind, "expected_points")
    assert.ok(fact.data.odds.p1Win > 0.7)
    assert.equal(typesOf(list).includes("highest_scoring_match"), false)

    // Margen de 3: debajo del umbral.
    assert.equal(
        find(
            facts({
                entries: entriesFrom([
                    {
                        p1: NICO,
                        t1: T.nico,
                        s1: 3,
                        p2: MAX,
                        t2: T.max,
                        s2: 0,
                        event: {},
                    },
                ]),
            }),
            "biggest_win"
        ),
        undefined
    )
    // Una goleada igual a la otra no es única.
    assert.equal(
        find(
            facts({
                entries: entriesFrom([
                    {
                        p1: NICO,
                        t1: T.nico,
                        s1: 5,
                        p2: MAX,
                        t2: T.max,
                        s2: 0,
                        event: {},
                    },
                    {
                        p1: LEO,
                        t1: T.leo,
                        s1: 5,
                        p2: SANTI,
                        t2: T.santi,
                        s2: 0,
                        event: {},
                    },
                ]),
            }),
            "biggest_win"
        ),
        undefined
    )
})

const movement = (overrides) => ({
    players: [],
    biggestGainer: null,
    biggestLoser: null,
    overtakes: [],
    ...overrides,
})

const movementPlayer = (name, delta, extra = {}) => ({
    player: { id: name, name },
    delta,
    bestCumulativeDelta: Math.max(delta, 0),
    worstCumulativeDelta: Math.min(delta, 0),
    // Globales: a propósito lejos de 1500 + delta, como pasa con partidos de
    // otros torneos en el medio.
    globalRatingBeforeFirstMatch: 1600,
    globalRatingAfterLastMatch: 1650 + delta,
    globalPeakRating: 1700,
    leaderboard: { before: 2, after: 1, isNewAllTimePeak: false },
    ...extra,
})

test("rating facts: gainer, loser, overtakes and new peaks", () => {
    const players = [
        movementPlayer("Nico", 24.5, {
            leaderboard: { before: 2, after: 1, isNewAllTimePeak: true },
        }),
        movementPlayer("Max", -12.3),
    ]
    const list = facts({
        ratingMovement: movement({
            players,
            biggestGainer: players[0].player,
            biggestLoser: players[1].player,
            overtakes: [
                {
                    player: players[0].player,
                    passed: players[1].player,
                    atMatchId: "m1",
                },
                {
                    player: players[0].player,
                    passed: players[1].player,
                    atMatchId: "m2",
                },
            ],
        }),
    })

    assert.match(
        find(list, "rating_biggest_gainer").text,
        /Nico fue quien más Elo ganó en el torneo: \+24.5 \(suma de los cambios de Elo de los partidos del torneo\)/
    )
    // Los hechos de movimiento de Elo del torneo no citan ratings globales.
    for (const type of ["rating_biggest_gainer", "rating_biggest_loser"]) {
        const fact = find(list, type)

        assert.doesNotMatch(fact.text, /1600|1650|1674|1637|1700/)
        assert.deepEqual(Object.keys(fact.data), ["player", "delta"])
    }
    assert.match(
        find(list, "rating_biggest_loser").text,
        /Max fue quien más Elo perdió en el torneo: -12.3/
    )
    // Una sola mención por pareja, con el último partido.
    const overtake = find(list, "leaderboard_overtake")

    assert.match(overtake.text, /Nico pasó a Max/)
    assert.match(overtake.text, /cambios de Elo de los partidos del torneo/)
    assert.deepEqual(overtake.matchIds, ["m2"])
    const peak = find(list, "new_peak_rating")

    assert.match(
        peak.text,
        /Nico llegó a su máximo histórico de rating global \(1700\)/
    )
    // Es un dato global: el texto aclara que no es lo ganado en el torneo.
    assert.match(peak.text, /no es lo que ganó en este torneo/)
    assert.equal(peak.data.globalPeakRating, 1700)

    // Debajo de 10 puntos no se destaca a nadie.
    const small = [movementPlayer("Nico", 9.9), movementPlayer("Max", -9.9)]
    const quiet = facts({
        ratingMovement: movement({
            players: small,
            biggestGainer: small[0].player,
            biggestLoser: small[1].player,
        }),
    })

    assert.equal(find(quiet, "rating_biggest_gainer"), undefined)
    assert.equal(find(quiet, "rating_biggest_loser"), undefined)
    assert.equal(find(quiet, "leaderboard_overtake"), undefined)
    assert.equal(find(quiet, "new_peak_rating"), undefined)
})

test("valid false matches never feed upsets, shootouts, comebacks or golden goals", () => {
    const upset = entriesFrom([
        ko({
            p1: NICO,
            t1: T.nico,
            s1: 1,
            p2: MAX,
            t2: T.max,
            s2: 2,
            event: { expectedP1: 0.85 },
        }),
    ])
    const invalid = (entries) =>
        entries.map((entry) => ({ ...entry, valid: false }))

    assert.ok(find(facts({ entries: upset }), "biggest_upset"))
    assert.equal(
        find(facts({ entries: invalid(upset) }), "biggest_upset"),
        undefined
    )

    // Una tanda de penales de un partido valid:false (p. ej. entre dos equipos
    // del mismo jugador) no es una definición por penales del torneo.
    const shootout = ko({
        p1: NICO,
        t1: T.nico,
        s1: 1,
        p2: NICO,
        t2: T.max,
        s2: 1,
        pens: [4, 3],
        valid: false,
        event: null,
    })

    assert.equal(
        find(facts({ entries: entriesFrom([shootout]) }), "penalty_shootout"),
        undefined
    )

    // Un cruce con una pata valid:false no es una remontada ni un gol de oro.
    const leg = (leg, valid) =>
        entriesFrom([
            ko({
                leg,
                legDraw: true,
                p1: leg === 1 ? MAX : NICO,
                t1: leg === 1 ? T.max : T.nico,
                s1: leg === 1 ? 2 : 3,
                p2: leg === 1 ? NICO : MAX,
                t2: leg === 1 ? T.nico : T.max,
                s2: 0,
                valid,
                event: valid ? {} : null,
            }),
        ])[0]
    const common = {
        round: "semifinal",
        units: [unit(MAX, T.max), unit(NICO, T.nico, "2")],
        aggregate: [2, 3],
        winnerIndex: 1,
    }

    assert.ok(
        find(
            facts({
                ties: [
                    tie({ ...common, entries: [leg(1, true), leg(2, true)] }),
                ],
            }),
            "series_comeback"
        )
    )
    assert.equal(
        find(
            facts({
                ties: [
                    tie({ ...common, entries: [leg(1, true), leg(2, false)] }),
                ],
            }),
            "series_comeback"
        ),
        undefined
    )
    assert.equal(
        find(
            facts({
                ties: [
                    tie({
                        round: "final",
                        decidedBy: "golden_goal",
                        entries: [leg(2, false)],
                    }),
                ],
            }),
            "golden_goal_tiebreak"
        ),
        undefined
    )

    // Un cruce entre dos equipos del mismo jugador no deja "afuera" al favorito.
    const entries = entriesFrom([
        ko({
            playoffId: 9,
            p1: NICO,
            t1: T.nico,
            s1: 1,
            p2: MAX,
            t2: T.max,
            s2: 0,
            event: { ovr1: 84, ovr2: 90 },
        }),
    ])

    assert.equal(
        find(
            facts({
                entries,
                ties: [
                    tie({
                        round: "quarterfinal",
                        decidedBy: "same_player_pick",
                    }),
                ],
            }),
            "top_seed_early_exit"
        ),
        undefined
    )
})

test("h2h_final only for the pair that played the final", () => {
    const record = (isFinal) => ({
        players: [
            { id: "a", name: "Nico" },
            { id: "b", name: "Max" },
        ],
        inTournament: { matches: 2, aWins: 1, draws: 0, bWins: 1 },
        allTimeBefore: { matches: 10, aWins: 4, draws: 2, bWins: 4 },
        isFinal,
    })
    const fact = find(facts({ headToHead: [record(true)] }), "h2h_final")

    assert.match(fact.text, /Nico y Max se cruzaron 2 veces en el torneo/)
    assert.match(fact.text, /historial era 4-2-4/)
    assert.equal(
        find(facts({ headToHead: [record(false)] }), "h2h_final"),
        undefined
    )
})

test("facts are sorted by importance then id, capped, and deterministic", () => {
    const entries = entriesFrom(
        Array.from({ length: 60 }, () => ({
            p1: NICO,
            t1: T.nico,
            s1: 0,
            p2: MAX,
            t2: T.max,
            s2: 2,
            event: { expectedP1: 0.8 },
        }))
    )
    const many = {
        entries,
        ratingMovement: movement({
            players: Array.from({ length: 40 }, (_, i) =>
                movementPlayer(`Jugador ${i}`, 1, {
                    leaderboard: {
                        before: 2,
                        after: 1,
                        isNewAllTimePeak: true,
                    },
                })
            ),
        }),
    }
    const first = facts(many)
    const second = facts(many)

    assert.deepEqual(first, second)
    assert.equal(first.length, FACTS_MAX)

    for (let i = 1; i < first.length; i++) {
        const [a, b] = [first[i - 1], first[i]]

        assert.ok(
            a.importance > b.importance ||
                (a.importance === b.importance && a.id < b.id)
        )
    }
    for (const fact of first) {
        assert.ok(Number.isInteger(fact.importance))
        assert.ok(fact.importance >= 1 && fact.importance <= 5)
        assert.equal(typeof fact.text, "string")
        assert.equal(fact.text.includes("Maxi"), false)
    }
})

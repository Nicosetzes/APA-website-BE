process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
    buildBracket,
} = require("../controller/getTournamentRecapContext/bracket")
const {
    buildMatchEntries,
} = require("../controller/getTournamentRecapContext/matchLog")
const {
    buildStandingsProgress,
} = require("../controller/getTournamentRecapContext/standingsProgress")
const { describeTournamentFormat } = require("../config/tournamentFormatRules")
const {
    LEO,
    MAX,
    NICO,
    SANTI,
    mkMatch,
    mkTournament,
    stubEvent,
    stubTimeline,
    team,
} = require("./fixtures/tournamentRecap")

const T = {
    nico: team(1, "Liverpool"),
    max: team(2, "Chelsea"),
    leo: team(3, "Bayern"),
    santi: team(4, "Milan"),
    nico2: team(5, "Ajax"),
}

const build = ({ tournament, matches, champion, withStandings = false }) => {
    const rules = describeTournamentFormat(tournament)
    const timeline = stubTimeline(
        matches
            .filter(({ valid }) => valid !== false)
            .map((match) => stubEvent(match, { expectedP1: 0.6 }))
    )
    const entries = buildMatchEntries({ matches, timeline, tournament })
    const standings = withStandings
        ? buildStandingsProgress({
              tournament,
              matches: matches.filter(({ type }) => type === "regular"),
              rules,
          }).standings
        : null

    return {
        entries,
        bracket: buildBracket({
            tournament,
            rules,
            matches,
            entries,
            standings,
            champion,
        }),
    }
}

const ko = (n, playoffId, config) =>
    mkMatch({
        n,
        type: "playoff",
        playoffId,
        seeds: ["1", "2"],
        ...config,
    })

const championOf = (player, teamRef) => ({
    player: { id: player.id, name: player.name },
    team: { id: teamRef.id, name: teamRef.name },
})

test("league_playin_playoff: rounds, decidedBy, the final and the champion path through the play-in", () => {
    const tournament = mkTournament({
        format: "league_playin_playoff",
        teams: [
            { team: T.nico, player: NICO, group: "A" },
            { team: T.max, player: MAX, group: "A" },
            { team: T.leo, player: LEO, group: "A" },
            { team: T.santi, player: SANTI, group: "A" },
        ],
        groups: [{}],
    })
    const matches = [
        mkMatch({
            n: 1,
            group: "A",
            p1: NICO,
            t1: T.nico,
            s1: 1,
            p2: MAX,
            t2: T.max,
            s2: 0,
        }),
        // Play-in: Milan (Santi) gana y pasa a cuartos.
        mkMatch({
            n: 2,
            type: "playin",
            playoffId: 1,
            seeds: ["7", "10"],
            p1: SANTI,
            t1: T.santi,
            s1: 2,
            p2: LEO,
            t2: T.leo,
            s2: 1,
        }),
        ko(3, 9, {
            p1: NICO,
            t1: T.nico,
            s1: 3,
            p2: SANTI,
            t2: T.santi,
            s2: 1,
        }),
        ko(4, 10, {
            p1: MAX,
            t1: T.max,
            s1: 1,
            p2: LEO,
            t2: T.leo,
            s2: 1,
            pens: [4, 3],
        }),
        ko(5, 13, { p1: NICO, t1: T.nico, s1: 2, p2: MAX, t2: T.max, s2: 1 }),
        ko(6, 15, { p1: NICO, t1: T.nico, s1: 1, p2: MAX, t2: T.max, s2: 0 }),
    ]
    const { bracket, entries } = build({
        tournament,
        matches,
        champion: championOf(NICO, T.nico),
        withStandings: true,
    })

    assert.deepEqual(bracket.playin, { matchSeqs: [2] })
    assert.deepEqual(
        bracket.playoffs.rounds.map(({ round, ties }) => [round, ties.length]),
        [
            ["quarterfinal", 2],
            ["semifinal", 1],
            ["final", 1],
        ]
    )

    const quarterfinals = bracket.playoffs.rounds[0].ties

    assert.deepEqual(
        quarterfinals.map(({ playoffId, decidedBy }) => [playoffId, decidedBy]),
        [
            [9, "single_match"],
            [10, "penalties"],
        ]
    )
    assert.deepEqual(quarterfinals[1].winner, {
        player: "Max",
        team: "Chelsea",
    })
    assert.deepEqual(quarterfinals[0].teams[0], {
        player: "Nico",
        team: "Liverpool",
        seed: "1",
    })
    assert.equal(quarterfinals[0].aggregate, null)
    assert.deepEqual(quarterfinals[0].matchSeqs, [3])

    assert.equal(bracket.final.matchSeq, 6)
    assert.equal(bracket.final.winner, "p1")
    assert.deepEqual(bracket.final.score, [1, 0])
    assert.equal(bracket.final.decidedBy, "single_match")
    assert.equal(bracket.finalDecided, true)
    assert.equal(entries[5].round, "final")

    // El campeón salió 1° de su grupo, no jugó el play-in y ganó 3 cruces.
    assert.deepEqual(bracket.championPath.regular, {
        group: "A",
        position: 1,
        points: 3,
    })
    assert.deepEqual(bracket.championPath.playin, {
        played: false,
        matchSeqs: [],
    })
    assert.deepEqual(
        bracket.championPath.ties.map(({ round, wonTie }) => [round, wonTie]),
        [
            ["quarterfinal", true],
            ["semifinal", true],
            ["final", true],
        ]
    )
    assert.deepEqual(bracket.championPath.ties[0].opponent, {
        player: "Santi",
        team: "Milan",
    })
    assert.deepEqual(bracket.championPath.ties[0].score, [3, 1])
    assert.deepEqual(bracket.championPath.ties[0].odds, {
        kind: "advance",
        advance: 0.6,
    })
})

test("a champion who came from the play-in lists those matches in its path", () => {
    const tournament = mkTournament({
        format: "league_playin_playoff",
        teams: [
            { team: T.nico, player: NICO, group: "A" },
            { team: T.santi, player: SANTI, group: "A" },
        ],
        groups: [{}],
    })
    const matches = [
        mkMatch({
            n: 1,
            type: "playin",
            playoffId: 1,
            seeds: ["7", "10"],
            p1: SANTI,
            t1: T.santi,
            s1: 2,
            p2: LEO,
            t2: T.leo,
            s2: 1,
        }),
        ko(2, 15, { p1: SANTI, t1: T.santi, s1: 1, p2: MAX, t2: T.max, s2: 0 }),
    ]
    const { bracket } = build({
        tournament,
        matches,
        champion: championOf(SANTI, T.santi),
    })

    assert.deepEqual(bracket.championPath.playin, {
        played: true,
        matchSeqs: [1],
    })
    assert.deepEqual(bracket.championPath.regular, null)
})

test("a pure league has no playoffs, no play-in and no final", () => {
    const tournament = mkTournament({
        teams: [
            { team: T.nico, player: NICO },
            { team: T.max, player: MAX },
        ],
    })
    const matches = [
        mkMatch({
            n: 1,
            p1: NICO,
            t1: T.nico,
            s1: 1,
            p2: MAX,
            t2: T.max,
            s2: 0,
        }),
    ]
    const { bracket } = build({
        tournament,
        matches,
        champion: championOf(NICO, T.nico),
        withStandings: true,
    })

    assert.equal(bracket.playin, null)
    assert.equal(bracket.playoffs, null)
    assert.equal(bracket.final, null)
    assert.equal(bracket.finalDecided, false)
    assert.deepEqual(bracket.championPath.ties, [])
    assert.equal(bracket.championPath.playin, null)
    assert.equal(bracket.championPath.regular.position, 1)
})

test("playoff two_legged: aggregate, golden goal and comeback", () => {
    const tournament = mkTournament({
        _id: "cccccccccccccccccccccccc",
        format: "playoff",
        playoffMode: "two_legged",
        teams: [],
    })
    const leg = (n, playoffId, legNumber, config) =>
        mkMatch({
            n,
            type: "playoff",
            playoffId,
            leg: legNumber,
            seeds: ["1", "2"],
            legDraw: legNumber !== 3,
            tournamentId: tournament._id,
            ...config,
        })
    const matches = [
        // Semifinal 29: Nico pierde la ida 0-2 y gana la vuelta 3-0 (global 3-2).
        {
            ...leg(1, 29, 1, {
                p1: MAX,
                t1: T.max,
                s1: 2,
                p2: NICO,
                t2: T.nico,
                s2: 0,
            }),
            seriesRevision: 0,
        },
        leg(2, 29, 2, {
            p1: NICO,
            t1: T.nico,
            s1: 3,
            p2: MAX,
            t2: T.max,
            s2: 0,
        }),
        // Semifinal 30: global empatado 1-1 y la tercera pata define a gol de oro.
        {
            ...leg(3, 30, 1, {
                p1: LEO,
                t1: T.leo,
                s1: 1,
                p2: SANTI,
                t2: T.santi,
                s2: 1,
            }),
            seriesRevision: 0,
        },
        leg(4, 30, 2, {
            p1: SANTI,
            t1: T.santi,
            s1: 0,
            p2: LEO,
            t2: T.leo,
            s2: 0,
        }),
        leg(5, 30, 3, {
            p1: LEO,
            t1: T.leo,
            s1: 1,
            p2: SANTI,
            t2: T.santi,
            s2: 0,
        }),
        // Final 31: Nico gana el global 4-1.
        {
            ...leg(6, 31, 1, {
                p1: NICO,
                t1: T.nico,
                s1: 2,
                p2: LEO,
                t2: T.leo,
                s2: 1,
            }),
            seriesRevision: 0,
        },
        leg(7, 31, 2, {
            p1: LEO,
            t1: T.leo,
            s1: 0,
            p2: NICO,
            t2: T.nico,
            s2: 2,
        }),
    ]
    const { bracket } = build({
        tournament,
        matches,
        champion: championOf(NICO, T.nico),
    })
    const [semifinals, final] = bracket.playoffs.rounds

    assert.equal(semifinals.round, "semifinal")
    assert.deepEqual(
        semifinals.ties.map(({ playoffId, decidedBy, aggregate }) => [
            playoffId,
            decidedBy,
            aggregate,
        ]),
        [
            // El global va en el orden de los equipos del cruce: [Chelsea, Liverpool].
            [29, "aggregate", [2, 3]],
            [30, "golden_goal", [1, 1]],
        ]
    )
    assert.deepEqual(semifinals.ties[0].winner, {
        player: "Nico",
        team: "Liverpool",
    })
    assert.deepEqual(semifinals.ties[1].winner, {
        player: "Leo",
        team: "Bayern",
    })
    assert.deepEqual(semifinals.ties[1].matchSeqs, [3, 4, 5])
    assert.equal(final.round, "final")
    assert.equal(final.ties[0].decidedBy, "aggregate")
    assert.deepEqual(final.ties[0].aggregate, [4, 1])

    // La final se resume con el último partido de la serie.
    assert.equal(bracket.final.matchSeq, 7)
    assert.deepEqual(bracket.final.aggregate, [4, 1])

    // Camino del campeón orientado a Nico (el global va [Nico, rival]).
    assert.deepEqual(
        bracket.championPath.ties.map(({ round, aggregate }) => [
            round,
            aggregate,
        ]),
        [
            ["semifinal", [3, 2]],
            ["final", [4, 1]],
        ]
    )
})

test("champions_league: ida and vuelta share a round and are paired by team", () => {
    const tournament = mkTournament({
        format: "champions_league",
        teams: [],
    })
    const matches = [
        // Cuartos: ida (17) y vuelta (18) del mismo cruce, lados invertidos.
        ko(1, 17, {
            legDraw: true,
            p1: NICO,
            t1: T.nico,
            s1: 1,
            p2: LEO,
            t2: T.leo,
            s2: 1,
        }),
        ko(2, 18, {
            legDraw: true,
            p1: LEO,
            t1: T.leo,
            s1: 0,
            p2: NICO,
            t2: T.nico,
            s2: 2,
        }),
        // Final (29): partido único.
        ko(3, 29, { p1: NICO, t1: T.nico, s1: 1, p2: MAX, t2: T.max, s2: 0 }),
    ]
    const { bracket } = build({
        tournament,
        matches,
        champion: championOf(NICO, T.nico),
    })
    const [quarterfinals, final] = bracket.playoffs.rounds

    assert.equal(quarterfinals.round, "quarterfinal")
    assert.equal(quarterfinals.ties.length, 1)
    assert.deepEqual(quarterfinals.ties[0].aggregate, [3, 1])
    assert.equal(quarterfinals.ties[0].decidedBy, "aggregate")
    assert.deepEqual(quarterfinals.ties[0].matchSeqs, [1, 2])
    assert.equal(final.round, "final")
    assert.equal(final.ties[0].decidedBy, "single_match")
    assert.equal(bracket.final.matchSeq, 3)
})

test("a tie between two teams of the same player is decided by the player's pick", () => {
    const tournament = mkTournament({
        format: "league_playin_playoff",
        teams: [],
    })
    const matches = [
        ko(1, 15, { p1: MAX, t1: T.max, s1: 2, p2: MAX, t2: T.leo, s2: 1 }),
    ]
    const { bracket } = build({
        tournament,
        matches,
        champion: championOf(MAX, T.max),
    })

    assert.equal(
        bracket.playoffs.rounds[0].ties[0].decidedBy,
        "same_player_pick"
    )
    assert.equal(bracket.final.decidedBy, "same_player_pick")
})

test("a tie decided by a match with valid false is a walkover", () => {
    const tournament = mkTournament({
        format: "league_playin_playoff",
        teams: [],
    })
    const matches = [
        ko(1, 15, {
            p1: NICO,
            t1: T.nico,
            s1: 3,
            p2: MAX,
            t2: T.max,
            s2: 0,
            valid: false,
        }),
    ]
    const { bracket } = build({
        tournament,
        matches,
        champion: championOf(NICO, T.nico),
    })

    assert.equal(bracket.playoffs.rounds[0].ties[0].decidedBy, "walkover")
    assert.deepEqual(bracket.playoffs.rounds[0].ties[0].winner, {
        player: "Nico",
        team: "Liverpool",
    })
})

test("odds of the decisive match are oriented to the champion", () => {
    const tournament = mkTournament({
        format: "league_playin_playoff",
        teams: [],
    })
    // El campeón juega de visitante: sus odds salen de `advanceP2`.
    const matches = [
        ko(1, 15, { p1: MAX, t1: T.max, s1: 0, p2: NICO, t2: T.nico, s2: 1 }),
    ]
    const { bracket } = build({
        tournament,
        matches,
        champion: championOf(NICO, T.nico),
    })
    const [tie] = bracket.championPath.ties

    assert.deepEqual(tie.score, [1, 0])
    assert.deepEqual(tie.odds, { kind: "advance", advance: 0.4 })
})

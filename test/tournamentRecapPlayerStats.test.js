process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
    buildMatchEntries,
} = require("../controller/getTournamentRecapContext/matchLog")
const {
    buildPlayerStats,
} = require("../controller/getTournamentRecapContext/playerStats")
const {
    LEO,
    MAX,
    NICO,
    mkMatch,
    stubEvent,
    stubTimeline,
    team,
} = require("./fixtures/tournamentRecap")

const T = {
    nico: team(1, "Liverpool"),
    nico2: team(5, "Ajax"),
    max: team(2, "Chelsea"),
    leo: team(3, "Bayern"),
}

const stats = (matches, events, format = "league_playin_playoff") => {
    const entries = buildMatchEntries({
        matches,
        timeline: stubTimeline(events ?? matches.map((m) => stubEvent(m))),
        tournament: { format },
    })

    return buildPlayerStats({ entries, players: [NICO, MAX, LEO] })
}

const byName = (result, name) =>
    result.players.find(({ player }) => player.name === name)

const ko = (n, playoffId, config) =>
    mkMatch({ n, type: "playoff", playoffId, seeds: ["1", "2"], ...config })

test("W + D + L equals played in every stage and overall", () => {
    const matches = [
        mkMatch({
            n: 1,
            p1: NICO,
            t1: T.nico,
            s1: 2,
            p2: MAX,
            t2: T.max,
            s2: 0,
        }),
        mkMatch({
            n: 2,
            p1: NICO,
            t1: T.nico,
            s1: 1,
            p2: LEO,
            t2: T.leo,
            s2: 1,
        }),
        mkMatch({
            n: 3,
            p1: MAX,
            t1: T.max,
            s1: 3,
            p2: NICO,
            t2: T.nico,
            s2: 0,
        }),
        mkMatch({
            n: 4,
            type: "playin",
            playoffId: 1,
            seeds: ["7", "10"],
            p1: NICO,
            t1: T.nico,
            s1: 1,
            p2: LEO,
            t2: T.leo,
            s2: 0,
        }),
        ko(5, 15, { p1: NICO, t1: T.nico, s1: 0, p2: MAX, t2: T.max, s2: 1 }),
        ko(6, 13, {
            p1: LEO,
            t1: T.leo,
            s1: 2,
            p2: MAX,
            t2: T.max,
            s2: 2,
            pens: [3, 4],
        }),
    ]
    const result = stats(matches)

    for (const { overall, byStage } of result.players) {
        for (const line of [overall, ...Object.values(byStage)]) {
            assert.equal(line.W + line.D + line.L, line.P)
        }
        assert.equal(
            overall.P,
            byStage.regular.P + byStage.playin.P + byStage.playoff.P
        )
    }

    const nico = byName(result, "Nico")

    assert.deepEqual(
        [nico.overall.P, nico.overall.W, nico.overall.D, nico.overall.L],
        [5, 2, 1, 2]
    )
    assert.deepEqual(
        [nico.byStage.regular.P, nico.byStage.playin.P, nico.byStage.playoff.P],
        [3, 1, 1]
    )
    assert.equal(nico.overall.gf, 4)
    assert.equal(nico.overall.ga, 5)
    assert.equal(nico.overall.actualPoints, 7)
    assert.equal(nico.overall.effectiveness, 46.7)
})

test("a penalty win counts as a win, not a draw, and is reported apart", () => {
    const matches = [
        ko(1, 13, {
            p1: LEO,
            t1: T.leo,
            s1: 1,
            p2: MAX,
            t2: T.max,
            s2: 1,
            pens: [5, 4],
        }),
        ko(2, 15, {
            p1: LEO,
            t1: T.leo,
            s1: 0,
            p2: MAX,
            t2: T.max,
            s2: 0,
            pens: [2, 3],
        }),
    ]
    const result = stats(matches)
    const leo = byName(result, "Leo")
    const max = byName(result, "Max")

    assert.deepEqual([leo.overall.W, leo.overall.D, leo.overall.L], [1, 0, 1])
    assert.deepEqual([max.overall.W, max.overall.D, max.overall.L], [1, 0, 1])
    assert.deepEqual(leo.penaltyShootouts, { won: 1, lost: 1 })
    // Los goles son los del partido, no los de los penales.
    assert.equal(leo.overall.gf, 1)
    assert.match(result.criterion, /penales/)
})

test("valid false matches and matches between teams of the same player are excluded", () => {
    const matches = [
        mkMatch({
            n: 1,
            p1: NICO,
            t1: T.nico,
            s1: 3,
            p2: MAX,
            t2: T.max,
            s2: 0,
            valid: false,
        }),
        mkMatch({
            n: 2,
            p1: NICO,
            t1: T.nico,
            s1: 2,
            p2: NICO,
            t2: T.nico2,
            s2: 1,
        }),
        mkMatch({
            n: 3,
            p1: NICO,
            t1: T.nico,
            s1: 1,
            p2: MAX,
            t2: T.max,
            s2: 0,
        }),
    ]
    const result = stats(matches)

    assert.equal(byName(result, "Nico").overall.P, 1)
    assert.deepEqual(result.excluded, { invalid: 1, samePlayer: 1 })
})

test("clean sheets, streaks, best win and worst loss", () => {
    const results = [
        [2, 0], // W, valla
        [3, 1], // W
        [1, 1], // D
        [0, 4], // L
        [0, 1], // L
        [0, 2], // L
        [1, 0], // W, valla
    ]
    const matches = results.map(([s1, s2], index) =>
        mkMatch({
            n: index + 1,
            p1: NICO,
            t1: T.nico,
            s1,
            p2: MAX,
            t2: T.max,
            s2,
        })
    )
    const nico = byName(stats(matches), "Nico")

    assert.equal(nico.overall.cleanSheets, 2)
    assert.deepEqual(nico.bestWinStreak, { length: 2, fromSeq: 1, toSeq: 2 })
    assert.deepEqual(nico.bestUnbeaten, { length: 3, fromSeq: 1, toSeq: 3 })
    assert.deepEqual(nico.worstLosingStreak, {
        length: 3,
        fromSeq: 4,
        toSeq: 6,
    })
    assert.deepEqual(nico.bestWin, {
        seq: 1,
        matchId: matches[0]._id,
        stage: "regular",
        opponent: "Max",
        opponentTeam: "Chelsea",
        team: "Liverpool",
        score: [2, 0],
        margin: 2,
    })
    assert.equal(nico.worstLoss.margin, 4)
    assert.equal(nico.worstLoss.seq, 4)

    // Max tiene las rachas espejadas.
    const max = byName(stats(matches), "Max")

    assert.equal(max.bestWinStreak.length, 3)
    assert.equal(max.worstLosingStreak.length, 2)
})

test("expected points come from the odds of each match and only count rated matches", () => {
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
        ko(2, 15, { p1: NICO, t1: T.nico, s1: 1, p2: MAX, t2: T.max, s2: 0 }),
        mkMatch({
            n: 3,
            p1: NICO,
            t1: T.nico,
            s1: 1,
            p2: MAX,
            t2: T.max,
            s2: 0,
        }),
    ]
    // El tercero no tiene evento: no suma esperados ni reales "rateados".
    const result = stats(matches, [
        stubEvent(matches[0], { expectedP1: 0.6 }),
        stubEvent(matches[1], { expectedP1: 0.5 }),
    ])
    const nico = byName(result, "Nico")
    // Liga: 3 * 0,494 + 0,211 = 1,693. Cruce de partido único: 3 * 0,5 = 1,5.
    const expected = 3 * 0.494 + 0.211 + 3 * 0.5

    assert.equal(nico.overall.expectedMatches, 2)
    assert.equal(nico.overall.expectedPoints, Math.round(expected * 10) / 10)
    assert.equal(nico.overall.actualPoints, 9)
    assert.equal(nico.overall.actualPointsInRatedMatches, 6)

    const max = byName(result, "Max")

    // Lo esperado de ambos lados de una liga suma 3 * (1 - draw) + 2 * draw por
    // partido cuando hay empate posible; en el cruce, 3 en total.
    assert.ok(max.overall.expectedPoints > 0)
})

test("best and worst team need at least two matches and differ", () => {
    const matches = [
        mkMatch({
            n: 1,
            p1: NICO,
            t1: T.nico,
            s1: 2,
            p2: MAX,
            t2: T.max,
            s2: 0,
        }),
        mkMatch({
            n: 2,
            p1: NICO,
            t1: T.nico,
            s1: 1,
            p2: MAX,
            t2: T.max,
            s2: 0,
        }),
        mkMatch({
            n: 3,
            p1: NICO,
            t1: T.nico2,
            s1: 0,
            p2: MAX,
            t2: T.max,
            s2: 1,
        }),
        mkMatch({
            n: 4,
            p1: NICO,
            t1: T.nico2,
            s1: 0,
            p2: MAX,
            t2: T.max,
            s2: 2,
        }),
        mkMatch({ n: 5, p1: LEO, t1: T.leo, s1: 0, p2: MAX, t2: T.max, s2: 1 }),
    ]
    const result = stats(matches)
    const nico = byName(result, "Nico")

    assert.equal(nico.bestTeam.team, "Liverpool")
    assert.equal(nico.bestTeam.effectiveness, 100)
    assert.equal(nico.worstTeam.team, "Ajax")
    assert.equal(nico.worstTeam.effectiveness, 0)
    // Leo usó un solo equipo con un partido: no hay mejor ni peor.
    const leo = byName(result, "Leo")

    assert.equal(leo.bestTeam, null)
    assert.equal(leo.worstTeam, null)
    // Max usó un solo equipo: mejor sí, peor no.
    const max = byName(result, "Max")

    assert.equal(max.bestTeam.team, "Chelsea")
    assert.equal(max.worstTeam, null)
})

test("a player without matches has empty stages and null effectiveness", () => {
    const result = stats([
        mkMatch({
            n: 1,
            p1: NICO,
            t1: T.nico,
            s1: 1,
            p2: MAX,
            t2: T.max,
            s2: 0,
        }),
    ])
    const leo = byName(result, "Leo")

    assert.equal(leo.overall.P, 0)
    assert.equal(leo.overall.effectiveness, null)
    assert.deepEqual(leo.bestWinStreak, {
        length: 0,
        fromSeq: null,
        toSeq: null,
    })
})

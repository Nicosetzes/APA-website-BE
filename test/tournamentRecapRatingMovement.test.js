process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
    buildDataQuality,
} = require("../controller/getTournamentRecapContext/dataQuality")
const {
    buildRatingMovement,
} = require("../controller/getTournamentRecapContext/ratingMovement")
const {
    LEO,
    LUCHO,
    MAX,
    NICO,
    buildTimeline,
    mkMatch,
    team,
} = require("./fixtures/tournamentRecap")

const T = {
    nico: team(1, "Liverpool"),
    max: team(2, "Chelsea"),
    leo: team(3, "Bayern"),
    lucho: team(4, "Milan"),
}

// Historial previo: Leo le gana 7 de 10 a Nico (que gana los últimos tres, así
// que su pico sigue siendo el rating inicial) y Max juega 9 partidos contra
// Leo. Después, un torneo en el que Nico le gana a todos.
const previousMatches = () => {
    const matches = []
    let n = 0

    for (let i = 0; i < 10; i++) {
        n += 1
        const nicoWins = i >= 7
        matches.push(
            mkMatch({
                n,
                tournamentId: "previo",
                p1: NICO,
                t1: T.nico,
                s1: nicoWins ? 2 : 0,
                p2: LEO,
                t2: T.leo,
                s2: nicoWins ? 0 : 1,
            })
        )
    }
    for (let i = 0; i < 9; i++) {
        n += 1
        matches.push(
            mkMatch({
                n,
                tournamentId: "previo",
                p1: MAX,
                t1: T.max,
                s1: i % 2 === 0 ? 1 : 0,
                p2: LEO,
                t2: T.leo,
                s2: i % 2 === 0 ? 0 : 1,
            })
        )
    }

    return matches
}

const tournamentMatches = () => [
    ...[100, 101, 102, 103, 104, 105].map((n) =>
        mkMatch({
            n,
            tournamentId: "actual",
            p1: NICO,
            t1: T.nico,
            s1: 2,
            p2: LEO,
            t2: T.leo,
            s2: 0,
        })
    ),
    mkMatch({
        n: 106,
        tournamentId: "actual",
        p1: MAX,
        t1: T.max,
        s1: 0,
        p2: NICO,
        t2: T.nico,
        s2: 1,
    }),
    mkMatch({
        n: 107,
        tournamentId: "actual",
        p1: LUCHO,
        t1: T.lucho,
        s1: 1,
        p2: MAX,
        t2: T.max,
        s2: 1,
    }),
]

const nameOf = ({ name }) => name

const movement = (matches = tournamentMatches()) => {
    const timeline = buildTimeline([...previousMatches(), ...matches])

    return {
        timeline,
        result: buildRatingMovement({
            timeline,
            matchIds: new Set(matches.map(({ _id }) => String(_id))),
            nameOf,
        }),
    }
}

const byName = (result, name) =>
    result.players.find(({ player }) => player.name === name)

test("the tournament deltas are zero-sum and equal the sum of the signed match deltas", () => {
    const { timeline, result } = movement()
    const ids = new Set(tournamentMatches().map(({ _id }) => String(_id)))
    const expected = new Map()

    for (const event of timeline.events.filter(({ matchId }) =>
        ids.has(matchId)
    )) {
        expected.set(
            event.p1.id,
            (expected.get(event.p1.id) ?? 0) + event.delta
        )
        expected.set(
            event.p2.id,
            (expected.get(event.p2.id) ?? 0) - event.delta
        )
    }

    const total = result.players.reduce((sum, { delta }) => sum + delta, 0)

    assert.ok(Math.abs(total) <= 0.05 * result.players.length)

    for (const player of result.players) {
        assert.ok(
            Math.abs(player.delta - expected.get(player.player.id)) < 0.06,
            player.player.name
        )
        // Sin partidos de otros torneos en el medio, el rating global cierra con
        // el delta (todo redondeado a 1 decimal).
        assert.ok(
            Math.abs(
                player.globalRatingBeforeFirstMatch +
                    player.delta -
                    player.globalRatingAfterLastMatch
            ) <= 0.11
        )
    }
})

test("the global ratings match the snapshots around the tournament", () => {
    const { timeline, result } = movement()
    const before = timeline.snapshotAt(
        tournamentMatches()[0].playedAt.getTime()
    )
    const after = timeline.snapshotAt(
        tournamentMatches()[7].playedAt.getTime() + 1
    )

    for (const player of result.players) {
        const id = player.player.id

        assert.equal(
            player.globalRatingBeforeFirstMatch,
            Math.round((before.get(id)?.rating ?? 1500) * 10) / 10
        )
        assert.equal(
            player.globalRatingAfterLastMatch,
            Math.round(after.get(id).rating * 10) / 10
        )
    }
})

test("matches, cumulative delta extremes and biggest gainer and loser", () => {
    const { result } = movement()
    const nico = byName(result, "Nico")

    assert.equal(nico.matches, 7)
    assert.ok(nico.delta > 0)
    // El camino acumulado arranca en 0: el mejor punto nunca queda por debajo
    // del final ni del inicio, y el peor nunca por encima.
    assert.ok(nico.bestCumulativeDelta >= nico.delta)
    assert.ok(nico.bestCumulativeDelta >= 0)
    assert.ok(nico.worstCumulativeDelta <= 0)
    assert.ok(nico.worstCumulativeDelta <= nico.delta)
    assert.deepEqual(result.biggestGainer, nico.player)
    assert.deepEqual(result.biggestLoser, byName(result, "Leo").player)
    // Ordenados de mayor a menor delta.
    const deltas = result.players.map(({ delta }) => delta)

    assert.deepEqual(
        deltas,
        [...deltas].sort((a, b) => b - a)
    )
    assert.match(result.scope, /otros torneos/)
    // Nada del contexto usa los nombres viejos, ambiguos entre torneo y global.
    for (const field of [
        "start",
        "end",
        "peakInTournament",
        "lowInTournament",
    ]) {
        assert.equal(field in nico, false, field)
    }
})

test("the cumulative delta path is built from the tournament events only", () => {
    const { timeline, result } = movement()
    const ids = new Set(tournamentMatches().map(({ _id }) => String(_id)))
    const nico = byName(result, "Nico")
    let running = 0
    let best = 0
    let worst = 0

    for (const event of timeline.events.filter(({ matchId }) =>
        ids.has(matchId)
    )) {
        if (event.p1.id === NICO.id) running += event.delta
        else if (event.p2.id === NICO.id) running -= event.delta
        else continue
        best = Math.max(best, running)
        worst = Math.min(worst, running)
    }

    assert.ok(Math.abs(nico.bestCumulativeDelta - best) < 0.06)
    assert.ok(Math.abs(nico.worstCumulativeDelta - worst) < 0.06)
})

test("a new all-time peak needs history and a rating above the previous peak", () => {
    const { result } = movement()

    assert.equal(byName(result, "Nico").leaderboard.isNewAllTimePeak, true)
    assert.equal(byName(result, "Leo").leaderboard.isNewAllTimePeak, false)
    // Lucho debuta: su primer torneo no cuenta como récord.
    assert.equal(byName(result, "Lucho").leaderboard.isNewAllTimePeak, false)
})

test("leaderboard positions before and after, null for a debut", () => {
    const { result } = movement()
    const nico = byName(result, "Nico")
    const leo = byName(result, "Leo")
    const lucho = byName(result, "Lucho")

    assert.ok(nico.leaderboard.before > leo.leaderboard.before)
    assert.ok(nico.leaderboard.after < leo.leaderboard.after)
    assert.equal(lucho.leaderboard.before, null)
    assert.equal(typeof lucho.leaderboard.after, "number")
})

test("overtakes list who passed whom and at which match", () => {
    const { result } = movement()
    const nicoPassedLeo = result.overtakes.find(
        ({ player, passed }) => player.name === "Nico" && passed.name === "Leo"
    )

    assert.ok(nicoPassedLeo)
    assert.ok(
        tournamentMatches().some(
            ({ _id }) => String(_id) === nicoPassedLeo.atMatchId
        )
    )
    // Nadie adelanta a quien sigue por debajo.
    assert.equal(
        result.overtakes.some(
            ({ player, passed }) =>
                player.name === "Leo" && passed.name === "Nico"
        ),
        false
    )
})

test("a player is provisional with fewer than 10 previous games", () => {
    const { result } = movement()

    // Antes del torneo: Nico 10 partidos, Max 9, Leo 19, Lucho 0.
    assert.equal(byName(result, "Nico").ratingProvisional, false)
    assert.equal(byName(result, "Max").ratingProvisional, true)
    assert.equal(byName(result, "Leo").ratingProvisional, false)
    assert.equal(byName(result, "Lucho").ratingProvisional, true)
})

test("a tournament without rated matches has an empty movement", () => {
    const { result } = movement([])

    assert.deepEqual(result.players, [])
    assert.equal(result.biggestGainer, null)
    assert.equal(result.biggestLoser, null)
    assert.deepEqual(result.overtakes, [])
})

test("matches from other tournaments played in the middle never add to the tournament delta", () => {
    const extra = mkMatch({
        n: 102.5,
        tournamentId: "otro",
        p1: LEO,
        t1: T.leo,
        s1: 5,
        p2: NICO,
        t2: T.nico,
        s2: 0,
    })
    const ids = new Set(tournamentMatches().map(({ _id }) => String(_id)))
    const timeline = buildTimeline([
        ...previousMatches(),
        ...tournamentMatches(),
        extra,
    ])
    const result = buildRatingMovement({ timeline, matchIds: ids, nameOf })
    const nico = byName(result, "Nico")
    const expected = timeline.events
        .filter(({ matchId }) => ids.has(matchId))
        .reduce((sum, event) => {
            if (event.p1.id === NICO.id) return sum + event.delta
            if (event.p2.id === NICO.id) return sum - event.delta
            return sum
        }, 0)

    assert.equal(nico.matches, 7)
    assert.ok(Math.abs(nico.delta - expected) < 0.06)
    // Los ratings globales sí lo incluyen, y por eso están rotulados como
    // globales: ya no cierran con el delta.
    assert.ok(
        Math.abs(
            nico.globalRatingAfterLastMatch -
                nico.globalRatingBeforeFirstMatch -
                nico.delta
        ) > 1
    )
})

test("overtakes replay only the tournament deltas on top of the rating before the tournament", () => {
    // Un partido ajeno en el medio mueve el rating global de Leo y de Max, pero
    // los adelantamientos se calculan solo con los deltas del torneo.
    const extra = mkMatch({
        n: 102.5,
        tournamentId: "otro",
        p1: LEO,
        t1: T.leo,
        s1: 5,
        p2: MAX,
        t2: T.max,
        s2: 0,
    })
    const matches = tournamentMatches()
    const ids = new Set(matches.map(({ _id }) => String(_id)))
    const timeline = buildTimeline([...previousMatches(), ...matches, extra])
    const result = buildRatingMovement({ timeline, matchIds: ids, nameOf })
    const events = timeline.events.filter(({ matchId }) => ids.has(matchId))
    const ratings = new Map(
        [...timeline.snapshotAt(events[0].time).values()].map(
            ({ id, rating }) => [id, rating]
        )
    )
    let expectedMatchId = null

    for (const event of events) {
        const wasBelow = ratings.get(NICO.id) < ratings.get(LEO.id)

        ratings.set(
            event.p1.id,
            (ratings.get(event.p1.id) ?? event.p1.before) + event.delta
        )
        ratings.set(
            event.p2.id,
            (ratings.get(event.p2.id) ?? event.p2.before) - event.delta
        )

        if (
            expectedMatchId === null &&
            wasBelow &&
            ratings.get(NICO.id) > ratings.get(LEO.id)
        ) {
            expectedMatchId = event.matchId
        }
    }

    const nicoPassedLeo = result.overtakes.find(
        ({ player, passed }) => player.name === "Nico" && passed.name === "Leo"
    )

    assert.ok(expectedMatchId)
    assert.equal(nicoPassedLeo.atMatchId, expectedMatchId)
})

test("the data quality warning counts the other-tournament matches and says what they affect", () => {
    const { warnings } = buildDataQuality({
        tournament: {},
        entries: [],
        ratingMovement: { players: [] },
        overlappingEvents: 3,
    })
    const warning = warnings.find((text) => text.includes("otros torneos"))

    assert.match(warning, /Se jugaron 3 partido\(s\) de otros torneos/)
    assert.match(warning, /globalRating/)
    assert.match(warning, /El delta del torneo no los incluye/)
})

test("the provisional warning says the players STARTED the tournament provisional", () => {
    const { warnings } = buildDataQuality({
        tournament: {},
        entries: [],
        ratingMovement: {
            players: [
                { player: { name: "Max" }, ratingProvisional: true },
                { player: { name: "Nico" }, ratingProvisional: false },
                { player: { name: "Lucho" }, ratingProvisional: true },
            ],
        },
        provisionalMatches: 10,
    })
    const warning = warnings.find((text) => text.includes("provisorio"))

    assert.equal(
        warning,
        "Jugadores que empezaron este torneo con rating provisorio (menos de 10 partidos previos): Max, Lucho. Solo afecta a sus primeros partidos; los partidos marcados provisional:true tienen probabilidades poco confiables."
    )
})

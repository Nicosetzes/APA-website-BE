process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
    createGetTournamentRecapContext,
} = require("../controller/getTournamentRecapContext")
const {
    BACKFILL_EXCLUDED_TOURNAMENTS,
    COMPACT_REGULAR_MATCH_LIMIT,
    CONTEXT_COMPACT_MAX_CHARS,
    CONTEXT_VERSION,
} = require("../config/tournamentRecap")
const {
    LEO,
    MAX,
    NICO,
    SANTI,
    buildTimeline,
    generateLeaguePlayinPlayoff,
    id24,
    mkMatch,
    mkTournament,
    team,
} = require("./fixtures/tournamentRecap")

const T = {
    nico: team(1, "Liverpool"),
    max: team(2, "Chelsea"),
    leo: team(3, "Bayern"),
    santi: team(4, "Milan"),
}

const leagueFixture = () => {
    const tournamentId = id24(800)
    const rows = [
        [NICO, T.nico, 2, MAX, T.max, 0],
        [LEO, T.leo, 1, SANTI, T.santi, 1],
        [NICO, T.nico, 0, LEO, T.leo, 1],
        [MAX, T.max, 3, SANTI, T.santi, 1],
        [NICO, T.nico, 1, SANTI, T.santi, 0],
        [MAX, T.max, 2, LEO, T.leo, 0],
    ]
    const matches = rows.map(([p1, t1, s1, p2, t2, s2], index) =>
        mkMatch({ n: index + 1, tournamentId, p1, t1, s1, p2, t2, s2 })
    )
    const tournament = mkTournament({
        _id: tournamentId,
        format: "league",
        teams: [
            { team: T.nico, player: NICO },
            { team: T.max, player: MAX },
            { team: T.leo, player: LEO },
            { team: T.santi, player: SANTI },
        ],
        champion: { team: T.max, player: MAX },
        finalist: { team: T.nico, player: NICO },
    })

    return { tournament, matches }
}

const makeHandler = ({ tournament, matches }, overrides = {}) => {
    const calls = []
    const track =
        (name, value) =>
        async (...args) => {
            calls.push(name)
            return typeof value === "function" ? value(...args) : value
        }
    const timeline = buildTimeline(matches)
    const handler = createGetTournamentRecapContext({
        retrieveTournamentById: track("tournament", tournament),
        retrieveTournamentMatchesForRecap: track("matches", matches),
        retrieveRatingsTimeline: track("timeline", timeline),
        retrieveRatingMatches: track("ratingMatches", matches),
        retrieveTournamentsForStatistics: track("tournaments", [tournament]),
        retrieveAllUsers: track("users", []),
        ...overrides,
    })

    return { handler, calls }
}

const call = async (handler, query) => {
    let body

    await handler(
        { query: { detail: "compact", ...query } },
        {
            json(payload) {
                body = payload
                return this
            },
        }
    )

    return body
}

const rejection = async (promise) => {
    try {
        await promise
    } catch (error) {
        return error
    }
    throw new Error("expected a rejection")
}

test("404 when the tournament does not exist, without reading anything else", async () => {
    const { handler, calls } = makeHandler(leagueFixture(), {
        retrieveTournamentById: async () => null,
    })
    const error = await rejection(call(handler, { tournamentId: id24(9) }))

    assert.equal(error.status, 404)
    assert.equal(error.code, "TOURNAMENT_NOT_FOUND")
    assert.deepEqual(calls, [])
})

test("409 for an ongoing tournament or one without a champion", async () => {
    const fixture = leagueFixture()

    for (const patch of [
        { ongoing: true },
        { ongoing: false, outcome: undefined },
    ]) {
        const { handler, calls } = makeHandler(fixture, {
            retrieveTournamentById: async () => ({
                ...fixture.tournament,
                ...patch,
            }),
        })
        const error = await rejection(
            call(handler, { tournamentId: fixture.tournament._id })
        )

        assert.equal(error.status, 409)
        assert.equal(error.code, "TOURNAMENT_NOT_FINISHED")
        assert.deepEqual(calls, [])
    }
})

test("422 for a tournament without played matches (legacy) and never reads ratings", async () => {
    const fixture = leagueFixture()
    const { handler, calls } = makeHandler(
        { ...fixture, matches: [] },
        {
            retrieveTournamentById: async () => ({
                ...fixture.tournament,
                legacy: true,
            }),
        }
    )
    const error = await rejection(
        call(handler, { tournamentId: fixture.tournament._id })
    )

    assert.equal(error.status, 422)
    assert.equal(error.code, "TOURNAMENT_WITHOUT_MATCHES")
    assert.deepEqual(calls, ["matches"])

    // Solo partidos `valid: false` tampoco alcanzan.
    const invalidOnly = makeHandler(
        { ...fixture, matches: [{ ...fixture.matches[0], valid: false }] },
        {
            retrieveTournamentMatchesForRecap: async () => [
                { ...fixture.matches[0], valid: false },
            ],
        }
    )

    assert.equal(
        (
            await rejection(
                call(invalidOnly.handler, {
                    tournamentId: fixture.tournament._id,
                })
            )
        ).code,
        "TOURNAMENT_WITHOUT_MATCHES"
    )
})

test("a failing source fails the endpoint instead of returning an empty context", async () => {
    const fixture = leagueFixture()

    for (const dependency of [
        "retrieveRatingsTimeline",
        "retrieveRatingMatches",
        "retrieveTournamentsForStatistics",
        "retrieveAllUsers",
        "retrieveTournamentMatchesForRecap",
    ]) {
        const { handler } = makeHandler(fixture, {
            [dependency]: async () => {
                throw new Error("boom")
            },
        })
        const error = await rejection(
            call(handler, { tournamentId: fixture.tournament._id })
        )

        assert.equal(error.message, "boom", dependency)
    }
})

test("the context of a pure league has the documented keys and null stage blocks", async () => {
    const fixture = leagueFixture()
    const { handler } = makeHandler(fixture)
    const body = await call(handler, { tournamentId: fixture.tournament._id })

    assert.equal(body.success, true)
    assert.equal(body.contextVersion, CONTEXT_VERSION)
    assert.equal(body.detail, "compact")
    assert.deepEqual(Object.keys(body.meta), [
        "ratingVersion",
        "drawModelVersion",
        "contextHash",
    ])
    assert.equal(body.meta.ratingVersion, "2.0")
    assert.equal(body.meta.drawModelVersion, "draw-1")
    assert.match(body.meta.contextHash, /^[a-f0-9]{64}$/)
    assert.deepEqual(Object.keys(body.data), [
        "tournament",
        "participants",
        "result",
        "standings",
        "playin",
        "playoffs",
        "championPath",
        "matches",
        "matchesOmitted",
        "ratingMovement",
        "playerStats",
        "headToHead",
        "titleContext",
        "facts",
        "dataQuality",
    ])

    const { data } = body

    assert.equal(data.playin, null)
    assert.equal(data.playoffs, null)
    assert.notEqual(data.standings, null)
    assert.equal(data.result.final, null)
    assert.equal(data.result.source, "table")
    assert.deepEqual(data.tournament.matchCounts, {
        regular: 6,
        playin: 0,
        playoff: 0,
        total: 6,
        validFalse: 0,
    })
    // La familia sale del formato (`league`), no del nombre del torneo.
    assert.deepEqual(data.tournament.competition, {
        key: "league",
        label: "Liga",
    })
    assert.equal(body.contextVersion, "tournament-recap-5")
    assert.deepEqual(Object.keys(data.ratingMovement), [
        "scope",
        "players",
        "biggestGainer",
        "biggestLoser",
        "overtakes",
    ])
    assert.deepEqual(Object.keys(data.ratingMovement.players[0]), [
        "player",
        "matches",
        "delta",
        "bestCumulativeDelta",
        "worstCumulativeDelta",
        "ratingProvisional",
        "globalRatingBeforeFirstMatch",
        "globalRatingAfterLastMatch",
        "globalPeakRating",
        "leaderboard",
    ])
    assert.match(data.standings.criterion, /TODOS los partidos regulares/)
    assert.equal(data.tournament.durationDays, 17)
    // Compact: solo los regulares destacados; el resto figura como omitido.
    assert.equal(data.matches.length + data.matchesOmitted, 6)
    assert.ok(data.matchesOmitted > 0)
})

test("the context of a league_playin_playoff has every block filled", async () => {
    const fixture = generateLeaguePlayinPlayoff({
        teamsPerGroup: 8,
        rounds: 1,
        playinMatches: 2,
    })
    const { handler } = makeHandler(fixture)
    const { data } = await call(handler, {
        tournamentId: fixture.tournament._id,
    })

    assert.ok(data.standings)
    assert.deepEqual(
        data.standings.final.map(({ group }) => group),
        ["A", "B"]
    )
    assert.ok(data.playin)
    assert.equal(data.playin.matchSeqs.length, 2)
    assert.deepEqual(
        data.playoffs.rounds.map(({ round }) => round),
        ["round_of_16", "quarterfinal", "semifinal", "final"]
    )
    assert.ok(data.result.final)
    assert.equal(data.result.source, "final")
    assert.ok(data.titleContext)
    assert.ok(data.facts.length > 0)
    assert.ok(data.participants.length > 0)
    assert.deepEqual(data.tournament.rules.stages, [
        "regular",
        "playin",
        "playoff",
    ])
})

test("result matches tournament.outcome", async () => {
    const fixture = generateLeaguePlayinPlayoff({
        teamsPerGroup: 8,
        rounds: 1,
        playinMatches: 2,
    })
    const { handler } = makeHandler(fixture)
    const { data } = await call(handler, {
        tournamentId: fixture.tournament._id,
    })
    const { champion, finalist } = fixture.tournament.outcome

    assert.deepEqual(data.result.champion, {
        player: { id: champion.player.id, name: champion.player.name },
        team: { id: champion.team.id, name: champion.team.name },
    })
    assert.deepEqual(data.result.runnerUp, {
        player: { id: finalist.player.id, name: finalist.player.name },
        team: { id: finalist.team.id, name: finalist.team.name },
    })
    assert.equal(data.titleContext.champion.player.id, champion.player.id)
    // Contadores a la fecha de cierre, este torneo incluido.
    assert.equal(data.titleContext.countsIncludeThisTournament, true)
    assert.ok(data.titleContext.champion.titles >= 1)
    assert.equal(
        data.titleContext.champion.beforeThisTournament.titles,
        data.titleContext.champion.titles - 1
    )
    assert.equal(
        data.titleContext.champion.titlesAndRunnerUps,
        data.titleContext.champion.titles + data.titleContext.champion.runnerUps
    )
    assert.equal("finals" in data.titleContext.ranking[0], false)
    assert.ok(
        data.playerStats.players.every(
            (player) => "performanceVsExpectedPct" in player
        )
    )
})

test("the context hash is stable across calls and changes with one score", async () => {
    const fixture = leagueFixture()
    const hashOf = async (matches) => {
        const { handler } = makeHandler({ ...fixture, matches })
        const body = await call(handler, {
            tournamentId: fixture.tournament._id,
        })

        return body.meta.contextHash
    }
    const first = await hashOf(fixture.matches)
    const second = await hashOf(fixture.matches)
    const changed = await hashOf(
        fixture.matches.map((match, index) =>
            index === 2
                ? mkMatch({
                      n: 3,
                      tournamentId: fixture.tournament._id,
                      p1: NICO,
                      t1: T.nico,
                      s1: 1,
                      p2: LEO,
                      t2: T.leo,
                      s2: 1,
                  })
                : match
        )
    )

    assert.equal(first, second)
    assert.notEqual(first, changed)
})

test("the nickname index renames players across the whole context", async () => {
    const fixture = leagueFixture()
    const { handler } = makeHandler(fixture, {
        retrieveAllUsers: async () => [
            { id: MAX.id, nickname: "Max" },
            { id: NICO.id, nickname: "El Nico" },
        ],
    })
    const body = await call(handler, { tournamentId: fixture.tournament._id })
    const text = JSON.stringify(body.data)

    assert.match(text, /El Nico/)
    assert.equal(text.includes('"Nico"'), false)
    assert.equal(text.includes("Maxi"), false)
    assert.equal(body.data.result.champion.player.name, "Max")
})

test("without a user the stored name is used", async () => {
    const fixture = leagueFixture()
    const { handler } = makeHandler(fixture)
    const body = await call(handler, { tournamentId: fixture.tournament._id })

    assert.equal(body.data.result.runnerUp.player.name, "Nico")
    assert.ok(
        body.data.participants.some(({ player }) => player.name === "Max")
    )
})

test("compact mode keeps a 200-match tournament under the size cap", async () => {
    const fixture = generateLeaguePlayinPlayoff()
    const total = fixture.matches.length

    assert.equal(total, 201)
    assert.equal(
        fixture.matches.filter(({ type }) => type === "regular").length,
        180
    )

    const { handler } = makeHandler(fixture)
    const compact = await call(handler, {
        tournamentId: fixture.tournament._id,
        detail: "compact",
    })
    const full = await call(handler, {
        tournamentId: fixture.tournament._id,
        detail: "full",
    })
    const stages = (body) =>
        body.data.matches.reduce(
            (count, { stage }) => ({
                ...count,
                [stage]: (count[stage] ?? 0) + 1,
            }),
            {}
        )

    assert.ok(
        JSON.stringify(compact.data).length < CONTEXT_COMPACT_MAX_CHARS,
        `compact context has ${JSON.stringify(compact.data).length} chars`
    )
    // Todo el play-in y el playoff, y a lo sumo los regulares destacados.
    assert.equal(stages(compact).playin, 6)
    assert.equal(stages(compact).playoff, 15)
    assert.ok(stages(compact).regular <= COMPACT_REGULAR_MATCH_LIMIT)
    assert.equal(
        compact.data.matches.length + compact.data.matchesOmitted,
        total
    )
    assert.equal(compact.data.tournament.matchCounts.total, total)

    // `full` trae los 201.
    assert.equal(full.data.matches.length, total)
    assert.equal(full.data.matchesOmitted, 0)
    assert.equal(full.detail, "full")
    assert.ok(
        JSON.stringify(full.data).length > JSON.stringify(compact.data).length
    )
    // Lo que no es la lista de partidos es igual en ambos modos.
    assert.deepEqual(full.data.facts, compact.data.facts)
    assert.deepEqual(full.data.standings, compact.data.standings)
})

test("every play-in and playoff match is referenced by seq and present in compact", async () => {
    const fixture = generateLeaguePlayinPlayoff()
    const { handler } = makeHandler(fixture)
    const { data } = await call(handler, {
        tournamentId: fixture.tournament._id,
    })
    const present = new Set(data.matches.map(({ seq }) => seq))
    const referenced = [
        ...data.playin.matchSeqs,
        ...data.playoffs.rounds.flatMap(({ ties }) =>
            ties.flatMap(({ matchSeqs }) => matchSeqs)
        ),
    ]

    assert.equal(referenced.length, 21)
    for (const seq of referenced) assert.ok(present.has(seq), `seq ${seq}`)
})

test("data quality reports unrated matches (valid false) and provisional players", async () => {
    const fixture = leagueFixture()
    const matches = [
        ...fixture.matches,
        mkMatch({
            n: 7,
            tournamentId: fixture.tournament._id,
            p1: NICO,
            t1: T.nico,
            s1: 3,
            p2: MAX,
            t2: T.max,
            s2: 0,
            valid: false,
        }),
    ]
    const { handler } = makeHandler({ ...fixture, matches })
    const { data } = await call(handler, {
        tournamentId: fixture.tournament._id,
    })

    assert.equal(data.dataQuality.ratedMatches, 6)
    assert.deepEqual(data.dataQuality.unratedMatchIds, [String(matches[6]._id)])
    assert.equal(data.tournament.matchCounts.validFalse, 1)
    assert.ok(
        data.dataQuality.warnings.some((warning) =>
            warning.includes("sin evento de rating")
        )
    )
    assert.equal(data.dataQuality.provisionalPlayers.length, 4)
    // Un `valid: false` no se destaca entre los regulares del compact...
    assert.equal(
        data.matches.some(({ seq }) => seq === 7),
        false
    )
    // ...pero está en el detalle completo, sin odds ni cambio de Elo.
    const full = await call(handler, {
        tournamentId: fixture.tournament._id,
        detail: "full",
    })
    const invalid = full.data.matches.at(-1)

    assert.equal(invalid.valid, false)
    assert.equal(invalid.ratingDelta, null)
    assert.equal(invalid.odds, null)
    // La tabla cuenta ese partido y lo aclara; playerStats no.
    assert.match(data.standings.criterion, /valid:false/)
    assert.match(data.standings.criterion, /playerStats/)
    assert.equal(data.playerStats.excluded.invalid, 1)
})

test("a late valid false match does not stretch the tournament window", async () => {
    const fixture = leagueFixture()
    const tournamentId = fixture.tournament._id
    const otherMatch = (n) =>
        mkMatch({
            n,
            tournamentId: id24(801),
            p1: LEO,
            t1: T.leo,
            s1: 4,
            p2: SANTI,
            t2: T.santi,
            s2: 0,
        })
    // Un W.O. cargado mucho después de que terminó el torneo.
    const late = mkMatch({
        n: 500,
        tournamentId,
        p1: NICO,
        t1: T.nico,
        s1: 3,
        p2: MAX,
        t2: T.max,
        s2: 0,
        valid: false,
    })
    const warningOf = async (matches, other) => {
        const { handler } = makeHandler(
            { ...fixture, matches: [...matches, other] },
            { retrieveTournamentMatchesForRecap: async () => matches }
        )
        const { data } = await call(handler, { tournamentId })

        return data.dataQuality.warnings.find((text) =>
            text.includes("otros torneos")
        )
    }
    const withLate = [...fixture.matches, late]

    // Un partido ajeno entre el último partido válido y el W.O. tardío no
    // ocurrió "en el medio" del torneo.
    assert.equal(await warningOf(withLate, otherMatch(100)), undefined)
    // Uno dentro del rango de los partidos válidos sí se informa.
    assert.match(
        await warningOf(withLate, otherMatch(3.5)),
        /Se jugaron 1 partido\(s\) de otros torneos/
    )
})

test("the context only exposes JSON-safe, deterministic values", async () => {
    const fixture = generateLeaguePlayinPlayoff({
        teamsPerGroup: 8,
        rounds: 1,
        playinMatches: 2,
    })
    const { handler } = makeHandler(fixture)
    const { data } = await call(handler, {
        tournamentId: fixture.tournament._id,
    })

    assert.deepEqual(JSON.parse(JSON.stringify(data)), data)
    assert.equal(JSON.stringify(data).includes("undefined"), false)
    assert.equal(JSON.stringify(data).includes("NaN"), false)
})

test("matches from other tournaments in the middle never enter the delta and are reported", async () => {
    const fixture = leagueFixture()
    const extra = mkMatch({
        n: 2.5,
        tournamentId: id24(801),
        p1: LEO,
        t1: T.leo,
        s1: 4,
        p2: SANTI,
        t2: T.santi,
        s2: 0,
    })
    const { handler } = makeHandler(
        { ...fixture, matches: [...fixture.matches, extra] },
        { retrieveTournamentMatchesForRecap: async () => fixture.matches }
    )
    const { data } = await call(handler, {
        tournamentId: fixture.tournament._id,
        detail: "full",
    })
    const sumOf = new Map()

    for (const match of data.matches) {
        if (!match.ratingDelta) continue
        sumOf.set(
            match.p1.player,
            (sumOf.get(match.p1.player) ?? 0) + match.ratingDelta.p1
        )
        sumOf.set(
            match.p2.player,
            (sumOf.get(match.p2.player) ?? 0) + match.ratingDelta.p2
        )
    }

    // El delta es la suma de los cambios de Elo de los partidos del torneo...
    for (const entry of data.ratingMovement.players) {
        assert.ok(
            Math.abs(entry.delta - sumOf.get(entry.player.name)) <=
                0.05 * entry.matches,
            entry.player.name
        )
    }

    // ...y el rating global de Leo incluye el partido ajeno, por eso no cierra.
    const leo = data.ratingMovement.players.find(
        ({ player }) => player.name === "Leo"
    )

    assert.ok(
        Math.abs(
            leo.globalRatingAfterLastMatch -
                leo.globalRatingBeforeFirstMatch -
                leo.delta
        ) > 1
    )
    assert.ok(
        data.dataQuality.warnings.some((warning) =>
            warning.includes("1 partido(s) de otros torneos")
        )
    )
    assert.match(data.ratingMovement.scope, /otros torneos/)
})

test("the context of a tournament excluded from the backfill listing is still served", async () => {
    const fixture = leagueFixture()
    const excludedId = Object.keys(BACKFILL_EXCLUDED_TOURNAMENTS)[0]
    const tournament = { ...fixture.tournament, _id: excludedId }
    const { handler } = makeHandler(
        { ...fixture, tournament },
        { retrieveTournamentById: async () => tournament }
    )
    const body = await call(handler, { tournamentId: excludedId })

    assert.equal(body.success, true)
    assert.equal(body.data.tournament.id, excludedId)
})

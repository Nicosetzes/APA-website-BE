process.env.LOG_LEVEL = "silent"
const assert = require("node:assert/strict")
const test = require("node:test")
const { FAVORITE_LEVELS, MAX_PENDING_LIMIT } = require("../config/assistant")
const {
    createGetAssistantPendingMatches,
} = require("../controller/getAssistantPendingMatches")
const {
    WARN_TOKENS,
    estimateTokens,
} = require("../scripts/measureAssistantTools")
const retrieveAssistantPendingMatches = require("../service/retrieveAssistantPendingMatches")
const {
    attachFavorites,
    buildFavorite,
    favoriteLevelForScore,
} = require("../service/retrieveAssistantPendingMatches/favorite")
const {
    createRetrieveStoredPredictionIndex,
} = require("../service/ratingsReadModel")
const {
    FINGERPRINT,
    fakeReadDaos,
    storedDocsFrom,
} = require("./fixtures/ratingsReadModel")
const { match: playedMatch } = require("./fixtures/ratingsStore")
const NOW = new Date("2026-10-26T12:00:00.000Z")
const LEAGUE_ID = "aaaaaaaaaaaaaaaaaaaaaaaa"
const CUP_ID = "bbbbbbbbbbbbbbbbbbbbbbbb"
const TWO_LEGGED_ID = "cccccccccccccccccccccccc"
const CHAMPIONS_ID = "dddddddddddddddddddddddd"
const NICO = { id: "u-nico", name: "Nico" }
const MAX = { id: "u-max", name: "Max" }
const LEO = { id: "u-leo", name: "Leo" }
const SANTI = { id: "u-santi", name: "Santi" }
const DANI = { id: "u-dani", name: "Dani" }
const users = [NICO, MAX, LEO, SANTI, DANI].map(({ id, name }) => ({
    id,
    nickname: name,
}))
const league = {
    _id: LEAGUE_ID,
    name: "Liga APA",
    format: "league_playin_playoff",
    ongoing: true,
}
const cup = {
    _id: CUP_ID,
    name: "Copa APA",
    format: "playoff",
    playoffMode: "single",
    ongoing: true,
}
const twoLegged = {
    _id: TWO_LEGGED_ID,
    name: "Copa ida y vuelta",
    format: "playoff",
    playoffMode: "two_legged",
    ongoing: true,
}
const champions = {
    _id: CHAMPIONS_ID,
    name: "Champions APA",
    format: "champions_league",
    ongoing: true,
}
let sequence = 0
const mkMatch = ({
    tournament = league,
    type = "regular",
    p1,
    p2,
    group,
    playoff_id: playoffId,
    leg,
} = {}) => {
    sequence += 1
    return {
        _id: `${String(sequence).padStart(24, "0")}`.slice(-24),
        tournament: { id: String(tournament._id), name: tournament.name },
        type,
        ...(group === undefined ? {} : { group }),
        ...(playoffId === undefined ? {} : { playoff_id: playoffId }),
        ...(leg === undefined ? {} : { leg }),
        playerP1: p1 ? { id: p1.id, name: p1.name } : null,
        teamP1: p1 ? { id: 1, name: `Equipo de ${p1.name}` } : null,
        playerP2: p2 ? { id: p2.id, name: p2.name } : null,
        teamP2: p2 ? { id: 2, name: `Equipo de ${p2.name}` } : null,
    }
}
// ---------------------------------------------------------------------------
// A. buildFavorite
// ---------------------------------------------------------------------------
const NAMES = { p1Name: "Nico", p2Name: "Max" }
const advance = (p1, extra = {}) => ({
    p1,
    p2: Math.round((1 - p1) * 1000) / 1000,
    basis: "current",
    teamAdjusted: false,
    provisional: false,
    ratingVersion: "2.0",
    ...extra,
})
const outcomes = (p1Win, extra = {}) => ({
    kind: "outcomes",
    p1Win,
    draw: 0.22,
    p2Win: Math.round((1 - p1Win - 0.22) * 1000) / 1000,
    basis: "current",
    teamAdjusted: false,
    provisional: false,
    ratingVersion: "2.0",
    drawModelVersion: "draw-1",
    ...extra,
})
const labelOf = (prediction) => buildFavorite(prediction, NAMES)?.label ?? null
test("the favorite levels are ordered from the highest to the lowest threshold", () => {
    assert.deepEqual(
        FAVORITE_LEVELS.map(({ label, minScore }) => [label, minScore]),
        [
            ["gran favorito", 795],
            ["favorito", 645],
            ["levemente favorito", 525],
        ]
    )
})
test("advance labels change exactly at 53, 65 and 80 percent", () => {
    assert.equal(labelOf(advance(0.524)), null)
    assert.equal(labelOf(advance(0.525)), "levemente favorito")
    assert.equal(labelOf(advance(0.644)), "levemente favorito")
    assert.equal(labelOf(advance(0.645)), "favorito")
    assert.equal(labelOf(advance(0.794)), "favorito")
    assert.equal(labelOf(advance(0.795)), "gran favorito")
    assert.equal(labelOf(advance(0.95)), "gran favorito")
})
test("favoriteLevelForScore labels an expected score with the same levels", () => {
    assert.equal(favoriteLevelForScore(0.524), null)
    assert.equal(favoriteLevelForScore(0.525), "levemente favorito")
    assert.equal(favoriteLevelForScore(0.644), "levemente favorito")
    assert.equal(favoriteLevelForScore(0.645), "favorito")
    assert.equal(favoriteLevelForScore(0.794), "favorito")
    assert.equal(favoriteLevelForScore(0.795), "gran favorito")
    assert.equal(favoriteLevelForScore(1), "gran favorito")
    assert.equal(favoriteLevelForScore(0.5), null)
    assert.equal(favoriteLevelForScore(null), null)
    assert.equal(favoriteLevelForScore(Number.NaN), null)
})
test("outcomes labels use the expected score (win plus half the draw)", () => {
    assert.equal(labelOf(outcomes(0.414)), null)
    assert.equal(labelOf(outcomes(0.415)), "levemente favorito")
    assert.equal(labelOf(outcomes(0.534)), "levemente favorito")
    assert.equal(labelOf(outcomes(0.535)), "favorito")
    assert.equal(labelOf(outcomes(0.684)), "favorito")
    assert.equal(labelOf(outcomes(0.685)), "gran favorito")
})
test("the favorite is p1 or p2 for both kinds of prediction", () => {
    const p1Advance = buildFavorite(advance(0.7), NAMES)
    const p2Advance = buildFavorite(advance(0.3), NAMES)
    assert.equal(p1Advance.player, "Nico")
    assert.equal(p2Advance.player, "Max")
    assert.equal(p1Advance.probabilityPercent, 70)
    assert.equal(p2Advance.probabilityPercent, 70)
    const p1Win = buildFavorite(outcomes(0.608), NAMES)
    // p1 gana 17 %, empate 22 %, p2 gana 61 %.
    const p2Win = buildFavorite(outcomes(0.17), NAMES)
    assert.equal(p1Win.player, "Nico")
    assert.equal(p2Win.player, "Max")
    assert.equal(p2Win.probabilityPercent, 61)
})
test("outcome says win for outcomes and advance otherwise, with the favorite's own percentage", () => {
    const win = buildFavorite(outcomes(0.608), NAMES)
    assert.equal(win.outcome, "win")
    // La cifra es la de ganar del favorito, no su puntaje esperado (0,718).
    assert.equal(win.probabilityPercent, 61)
    const advancing = buildFavorite(
        { p1: 0.305, p2: 0.695, provisional: false },
        NAMES
    )
    assert.equal(advancing.outcome, "advance")
    assert.equal(advancing.player, "Max")
    assert.equal(advancing.probabilityPercent, 70)
    // Redondeo half-up de la milésima: 55,5 % se muestra 56.
    assert.equal(
        buildFavorite({ p1: 0.555, p2: 0.445 }, NAMES).probabilityPercent,
        56
    )
})
test("an even duel or equal probabilities have no favorite", () => {
    assert.equal(buildFavorite(advance(0.5), NAMES), null)
    assert.equal(buildFavorite(advance(0.51), NAMES), null)
    assert.equal(
        buildFavorite(
            { kind: "outcomes", p1Win: 0.39, draw: 0.22, p2Win: 0.39 },
            NAMES
        ),
        null
    )
    assert.equal(buildFavorite(outcomes(0.39), NAMES), null)
})
test("provisional is copied from the prediction and defaults to false", () => {
    assert.equal(
        buildFavorite(advance(0.7, { provisional: true }), NAMES).provisional,
        true
    )
    assert.equal(
        buildFavorite(advance(0.7, { provisional: false }), NAMES).provisional,
        false
    )
    const { provisional, ...withoutFlag } = advance(0.7)
    assert.equal(provisional, false)
    assert.equal(buildFavorite(withoutFlag, NAMES).provisional, false)
})
test("invalid input answers null without throwing", () => {
    const invalid = [
        null,
        undefined,
        {},
        "70",
        { p1: Number.NaN, p2: 0.3 },
        { p1: Number.POSITIVE_INFINITY, p2: 0 },
        { p1: -0.2, p2: 1.2 },
        { p1: 0.7, p2: 1.3 },
        { p1: "0.7", p2: "0.3" },
        { kind: "outcomes", p1Win: 0.6, draw: Number.NaN, p2Win: 0.2 },
        { kind: "outcomes", p1Win: 0.6, p2Win: 0.2 },
    ]
    for (const prediction of invalid) {
        assert.equal(buildFavorite(prediction, NAMES), null)
    }
    assert.equal(buildFavorite(advance(0.7)), null)
    assert.equal(buildFavorite(advance(0.7), { p2Name: "Max" }), null)
    assert.equal(buildFavorite(advance(0.7), { p1Name: "  " }), null)
    assert.equal(buildFavorite(advance(0.3), { p1Name: "Nico" }), null)
    assert.equal(
        buildFavorite(advance(0.3), { p1Name: "Nico", p2Name: "" }),
        null
    )
})
test("the favorite exposes exactly five keys and nothing of the model", () => {
    const everything = {
        ...outcomes(0.608),
        matchId: "m1",
        playerId: "u-nico",
        id: 7,
    }
    for (const prediction of [everything, advance(0.7)]) {
        const favorite = buildFavorite(prediction, NAMES)
        assert.deepEqual(Object.keys(favorite).sort(), [
            "label",
            "outcome",
            "player",
            "probabilityPercent",
            "provisional",
        ])
        const json = JSON.stringify(favorite)
        for (const forbidden of [
            "draw",
            "p1Win",
            "p2Win",
            "ratingVersion",
            "drawModelVersion",
            "basis",
            "teamAdjusted",
            "m1",
            "u-nico",
        ]) {
            assert.ok(!json.includes(forbidden), forbidden)
        }
    }
})
// ---------------------------------------------------------------------------
// B. Servicio con addPredictions simulado
// ---------------------------------------------------------------------------
// Predicción simulada: p1 siempre favorito de partido único, con 70 %.
const stubPredictions = (calls = []) => ({
    calls,
    addPredictions: async ({ matches, tournament }) => {
        calls.push({ matches, tournament })
        return matches.map((match) => ({ ...match, prediction: advance(0.7) }))
    },
})
const runService = (filters, { matches = [], tournaments, ...dependencies }) =>
    retrieveAssistantPendingMatches(filters, {
        findAllUsers: async () => users,
        findTournamentsForAssistant: async () => tournaments ?? [league, cup],
        findPendingMatchesForAssistant: async () => matches,
        now: () => NOW,
        ...dependencies,
    })
test("only the returned matches are decorated, at most 20", async () => {
    const matches = Array.from({ length: 25 }, () =>
        mkMatch({ p1: NICO, p2: MAX, group: "A" })
    )
    const { addPredictions, calls } = stubPredictions()
    const result = await runService(
        { players: [NICO.id], scope: "involving", limit: 25 },
        { matches, addPredictions }
    )
    const decorated = calls.reduce((sum, call) => sum + call.matches.length, 0)
    assert.equal(result.totalPending, 25)
    assert.equal(result.returned, MAX_PENDING_LIMIT)
    assert.equal(decorated, MAX_PENDING_LIMIT)
    assert.equal(result.remaining, 5)
    assert.equal(
        result.matches.every((item) => item.favorite !== undefined),
        true
    )
    const byDefault = stubPredictions()
    await runService(
        { players: [NICO.id], scope: "involving" },
        { matches, addPredictions: byDefault.addPredictions }
    )
    assert.equal(
        byDefault.calls.reduce((sum, call) => sum + call.matches.length, 0),
        10
    )
})
test("empty sides and same-owner ties never reach the decoration", async () => {
    const matches = [
        mkMatch({ p1: NICO, p2: MAX, group: "A" }),
        mkMatch({ p1: NICO, p2: NICO, group: "A" }),
        mkMatch({ tournament: cup, type: "playoff", playoff_id: 25, p1: NICO }),
    ]
    const { addPredictions, calls } = stubPredictions()
    const result = await runService(
        { players: [NICO.id], scope: "involving" },
        { matches, addPredictions }
    )
    const sent = calls.flatMap((call) => call.matches.map(({ _id }) => _id))
    assert.deepEqual(sent, [matches[0]._id])
    assert.equal(result.matches.length, 1)
    assert.equal(result.excluded.sameOwnerTies, 1)
    assert.equal(result.awaitingOpponent.count, 1)
    assert.equal(
        Object.hasOwn(result.awaitingOpponent.matches[0], "favorite"),
        false
    )
})
test("the decoration runs once per tournament with the whole tournament and pending matches", async () => {
    const matches = [
        mkMatch({ p1: NICO, p2: MAX, group: "A" }),
        mkMatch({
            tournament: cup,
            type: "playoff",
            playoff_id: 25,
            p1: LEO,
            p2: NICO,
        }),
        mkMatch({ p1: MAX, p2: LEO, group: "A" }),
    ]
    const { addPredictions, calls } = stubPredictions()
    await runService({ scope: "involving" }, { matches, addPredictions })
    assert.equal(calls.length, 2)
    const forCup = calls.find((call) => String(call.tournament._id) === CUP_ID)
    const forLeague = calls.find(
        (call) => String(call.tournament._id) === LEAGUE_ID
    )
    assert.equal(forCup.tournament.format, "playoff")
    assert.equal(forCup.tournament.playoffMode, "single")
    assert.equal(forLeague.tournament.format, "league_playin_playoff")
    assert.equal(forLeague.matches.length, 2)
    for (const sent of [...forCup.matches, ...forLeague.matches]) {
        assert.equal(sent.played, false)
        assert.ok(sent.teamP1)
        assert.ok(sent.teamP2)
        assert.ok(sent.tournament)
    }
    // Los partidos originales del DAO no se tocan.
    assert.equal(Object.hasOwn(matches[0], "played"), false)
})
test("a missing prediction becomes an explicit favorite null", async () => {
    const matches = [mkMatch({ p1: NICO, p2: MAX, group: "A" })]
    const result = await runService(
        { scope: "involving" },
        {
            matches,
            addPredictions: async ({ matches: sent }) =>
                sent.map((match) => ({ ...match, prediction: null })),
        }
    )
    assert.equal(Object.hasOwn(result.matches[0], "favorite"), true)
    assert.equal(result.matches[0].favorite, null)
})
test("the favorite is built from the prediction with the nicknames of the match", async () => {
    const matches = [
        mkMatch({ p1: NICO, p2: MAX, group: "A" }),
        mkMatch({
            tournament: cup,
            type: "playoff",
            playoff_id: 25,
            p1: LEO,
            p2: SANTI,
        }),
    ]
    const result = await runService(
        { scope: "involving" },
        {
            matches,
            addPredictions: async ({ matches: sent, tournament }) =>
                sent.map((match) => ({
                    ...match,
                    prediction:
                        String(tournament._id) === LEAGUE_ID
                            ? outcomes(0.608)
                            : advance(0.15),
                })),
        }
    )
    const [first, second] = result.matches
    assert.deepEqual(first.favorite, {
        player: "Nico",
        label: "favorito",
        probabilityPercent: 61,
        outcome: "win",
        provisional: false,
    })
    assert.deepEqual(second.favorite, {
        player: "Santi",
        label: "gran favorito",
        probabilityPercent: 85,
        outcome: "advance",
        provisional: false,
    })
})
test("a failing decoration leaves the matches without favorite and the rest untouched", async () => {
    const matches = [
        mkMatch({ p1: NICO, p2: MAX, group: "A" }),
        mkMatch({
            tournament: cup,
            type: "playoff",
            playoff_id: 25,
            p1: LEO,
            p2: SANTI,
        }),
    ]
    const baseline = await runService({ scope: "involving" }, { matches })
    const warnings = []
    const failures = [
        async () => {
            throw new Error("boom")
        },
        async () => "no es un arreglo",
        async () => [],
        async ({ matches: sent }) => sent.map(({ _id, ...rest }) => rest),
    ]
    for (const addPredictions of failures) {
        const result = await runService(
            { scope: "involving" },
            {
                matches,
                addPredictions,
                logger: { warn: (event) => warnings.push(event) },
            }
        )
        assert.deepEqual(result, baseline)
        for (const item of result.matches) {
            assert.equal(Object.hasOwn(item, "favorite"), false)
        }
    }
    assert.ok(warnings.includes("assistant_favorites_unavailable"))
})
test("when one tournament fails only its matches lose the favorite", async () => {
    const matches = [
        mkMatch({ p1: NICO, p2: MAX, group: "A" }),
        mkMatch({
            tournament: cup,
            type: "playoff",
            playoff_id: 25,
            p1: LEO,
            p2: SANTI,
        }),
    ]
    const result = await runService(
        { scope: "involving" },
        {
            matches,
            addPredictions: async ({ matches: sent, tournament }) => {
                if (String(tournament._id) === CUP_ID) throw new Error("boom")
                return sent.map((match) => ({
                    ...match,
                    prediction: advance(0.7),
                }))
            },
        }
    )
    const byTournament = Object.fromEntries(
        result.matches.map((item) => [item.tournamentId, item])
    )
    assert.equal(byTournament[LEAGUE_ID].favorite.player, "Nico")
    assert.equal(Object.hasOwn(byTournament[CUP_ID], "favorite"), false)
})
test("without addPredictions the answer has no favorite key", async () => {
    const matches = [mkMatch({ p1: NICO, p2: MAX, group: "A" })]
    const result = await runService({ scope: "involving" }, { matches })
    assert.equal(result.matches.length, 1)
    assert.equal(Object.hasOwn(result.matches[0], "favorite"), false)
})
test("nothing is decorated when there is no match to show", async () => {
    const { addPredictions, calls } = stubPredictions()
    await runService(
        { players: ["u-fantasma"], scope: "involving" },
        { addPredictions }
    )
    await runService({ players: [NICO.id], scope: "among" }, { addPredictions })
    await runService(
        { players: [NICO.id], scope: "involving" },
        { addPredictions, matches: [] }
    )
    assert.equal(calls.length, 0)
})
test("attachFavorites does not mutate its items", async () => {
    const raw = mkMatch({ p1: NICO, p2: MAX, group: "A" })
    const items = [
        {
            matchId: String(raw._id),
            tournamentId: LEAGUE_ID,
            p1: { id: NICO.id, name: "Nico" },
            p2: { id: MAX.id, name: "Max" },
        },
    ]
    const snapshot = JSON.stringify(items)
    const result = await attachFavorites({
        items,
        rawById: new Map([[String(raw._id), raw]]),
        tournamentsById: new Map([[LEAGUE_ID, league]]),
        addPredictions: stubPredictions().addPredictions,
    })
    assert.equal(JSON.stringify(items), snapshot)
    assert.notEqual(result[0], items[0])
    assert.equal(result[0].favorite.player, "Nico")
})
// ---------------------------------------------------------------------------
// C. Cadena completa por DI: controlador + servicio + decoración real
// ---------------------------------------------------------------------------
// Nico le ganó 14 veces a Max, Leo y Santi quedaron parejos (12 partidos cada
// uno) y Dani jugó uno solo (provisorio). Equipos sin overall: sin ajuste.
const buildHistory = () => {
    const history = []
    let n = 0
    const day = () => String(n).padStart(2, "0")
    const add = (p1, score1, p2, score2) => {
        n += 1
        history.push(
            playedMatch(n, p1, score1, p2, score2, `2026-01-${day()}T15:00:00Z`)
        )
    }
    for (let i = 0; i < 14; i += 1) add(NICO, 3, MAX, 0)
    for (let i = 0; i < 12; i += 1) {
        if (i % 2) add(LEO, 0, SANTI, 1)
        else add(LEO, 1, SANTI, 0)
    }
    add(DANI, 1, LEO, 0)
    return history
}
const HISTORY = buildHistory()
const createResponse = () => ({
    statusCode: null,
    body: null,
    status(code) {
        this.statusCode = code
        return this
    },
    json(body) {
        this.body = body
        return this
    },
})
const createLogger = () => {
    const calls = []
    return {
        calls,
        info: (event, fields) => calls.push({ level: "info", event, fields }),
        warn: (event, fields) => calls.push({ level: "warn", event, fields }),
    }
}
const counting = (read) => {
    const calls = []
    const wrapped = async (...args) => {
        calls.push(args)
        return read(...args)
    }
    wrapped.calls = calls
    return wrapped
}
const createStoredReader = (calls = []) =>
    createRetrieveStoredPredictionIndex({
        ...fakeReadDaos({ docs: storedDocsFrom(HISTORY), calls }),
        getCurrentFingerprint: () => FINGERPRINT,
    })
const callRoute = async ({
    matches,
    tournaments = [league, cup, twoLegged, champions],
    query = { scope: "involving", favorites: true },
    ...dependencies
}) => {
    const logger = dependencies.logger ?? createLogger()
    const handler = createGetAssistantPendingMatches({
        retrieveAssistantPendingMatches: (filters, injected) =>
            retrieveAssistantPendingMatches(filters, {
                findAllUsers: async () => users,
                findTournamentsForAssistant: async () => tournaments,
                findPendingMatchesForAssistant: async () => matches,
                now: () => NOW,
                ...injected,
            }),
        ...dependencies,
        logger,
    })
    const res = createResponse()
    await handler({ query }, res)
    return { res, logger, data: res.body.data }
}
const favoriteOf = (data, index = 0) => data.matches[index].favorite
test("read-model path: league is win, single-leg cup is advance, and the live history is not read", async () => {
    const matches = [
        mkMatch({ p1: NICO, p2: MAX, group: "A" }),
        mkMatch({
            tournament: cup,
            type: "playoff",
            playoff_id: 25,
            p1: NICO,
            p2: MAX,
        }),
    ]
    const retrieveAllMatches = counting(async () => HISTORY)
    const { res, data } = await callRoute({
        matches,
        retrieveStoredPredictionIndex: createStoredReader(),
        retrieveAllMatches,
        readModelEnabled: () => true,
    })
    assert.equal(res.statusCode, 200)
    assert.equal(retrieveAllMatches.calls.length, 0)
    const byTournament = Object.fromEntries(
        data.matches.map((item) => [item.tournamentId, item.favorite])
    )
    assert.deepEqual(byTournament[LEAGUE_ID], {
        player: "Nico",
        label: "favorito",
        probabilityPercent: 59,
        outcome: "win",
        provisional: false,
    })
    assert.deepEqual(byTournament[CUP_ID], {
        player: "Nico",
        label: "favorito",
        probabilityPercent: 69,
        outcome: "advance",
        provisional: false,
    })
})
test("the favorite is the same player when he is on either side", async () => {
    const matches = [
        mkMatch({ p1: NICO, p2: MAX, group: "A" }),
        mkMatch({ p1: MAX, p2: NICO, group: "B" }),
    ]
    const { data } = await callRoute({
        matches,
        retrieveStoredPredictionIndex: createStoredReader(),
        readModelEnabled: () => true,
    })
    assert.equal(data.matches.length, 2)
    for (const item of data.matches) {
        assert.equal(item.favorite.player, "Nico")
        assert.equal(item.favorite.probabilityPercent, 59)
    }
})
test("the stored index is read once per request even with several tournaments", async () => {
    const matches = [
        mkMatch({ p1: NICO, p2: MAX, group: "A" }),
        mkMatch({
            tournament: cup,
            type: "playoff",
            playoff_id: 25,
            p1: NICO,
            p2: MAX,
        }),
        mkMatch({
            tournament: twoLegged,
            type: "playoff",
            playoff_id: 25,
            leg: 1,
            p1: NICO,
            p2: MAX,
        }),
    ]
    const daoCalls = []
    const stored = counting(createStoredReader(daoCalls))
    await callRoute({
        matches,
        retrieveStoredPredictionIndex: stored,
        readModelEnabled: () => true,
    })
    assert.equal(stored.calls.length, 1)
    assert.deepEqual(stored.calls[0], [{ matchIds: [] }])
    assert.deepEqual(daoCalls.map(({ dao }) => dao).sort(), [
        "findPlayerRatings",
        "findRatingSourceStats",
    ])
})
test("a stale stored index falls back to the live history and gives the same answer", async () => {
    const matches = [
        mkMatch({ p1: NICO, p2: MAX, group: "A" }),
        mkMatch({
            tournament: cup,
            type: "playoff",
            playoff_id: 25,
            p1: MAX,
            p2: NICO,
        }),
    ]
    const fromStored = await callRoute({
        matches,
        retrieveStoredPredictionIndex: createStoredReader(),
        readModelEnabled: () => true,
    })
    const retrieveAllMatches = counting(async () => HISTORY)
    const fromLive = await callRoute({
        matches,
        retrieveStoredPredictionIndex: async () => ({
            stale: "fingerprint_mismatch",
        }),
        retrieveAllMatches,
        readModelEnabled: () => true,
    })
    assert.equal(retrieveAllMatches.calls.length, 1)
    assert.deepEqual(fromLive.data.matches, fromStored.data.matches)
    assert.equal(favoriteOf(fromLive.data).player, "Nico")
    const log = fromLive.logger.calls.filter(
        ({ event }) => event === "rating_read_model"
    )
    assert.equal(log.length, 2)
    assert.equal(log[0].fields.source, "live")
    assert.equal(log[0].fields.reason, "fingerprint_mismatch")
})
test("the off switch skips the stored reader and calculates live", async () => {
    const matches = [mkMatch({ p1: NICO, p2: MAX, group: "A" })]
    const stored = counting(createStoredReader())
    const retrieveAllMatches = counting(async () => HISTORY)
    const { data } = await callRoute({
        matches,
        retrieveStoredPredictionIndex: stored,
        retrieveAllMatches,
        readModelEnabled: () => false,
    })
    assert.equal(stored.calls.length, 0)
    assert.equal(retrieveAllMatches.calls.length, 1)
    assert.equal(favoriteOf(data).player, "Nico")
})
test("a failing stored reader falls back to live and logs the error", async () => {
    const matches = [mkMatch({ p1: NICO, p2: MAX, group: "A" })]
    const { data, logger } = await callRoute({
        matches,
        retrieveStoredPredictionIndex: async () => {
            throw new TypeError("db caída")
        },
        retrieveAllMatches: async () => HISTORY,
        readModelEnabled: () => true,
    })
    assert.equal(favoriteOf(data).player, "Nico")
    const warning = logger.calls.find(
        ({ level, event }) => level === "warn" && event === "rating_read_model"
    )
    assert.equal(warning.fields.reason, "error")
    assert.equal(warning.fields.errorName, "TypeError")
})
test("if every reader fails the matches still come back with favorite null", async () => {
    const matches = [mkMatch({ p1: NICO, p2: MAX, group: "A" })]
    const { res, data, logger } = await callRoute({
        matches,
        retrieveStoredPredictionIndex: async () => {
            throw new Error("db caída")
        },
        retrieveAllMatches: async () => {
            throw new Error("db caída")
        },
        readModelEnabled: () => true,
    })
    assert.equal(res.statusCode, 200)
    assert.equal(data.matches.length, 1)
    assert.equal(Object.hasOwn(data.matches[0], "favorite"), true)
    assert.equal(favoriteOf(data), null)
    assert.ok(
        logger.calls.some(
            ({ event }) => event === "match_predictions_unavailable"
        )
    )
})
test("a decoration that throws never rejects the answer", async () => {
    const matches = [mkMatch({ p1: NICO, p2: MAX, group: "A" })]
    const handler = createGetAssistantPendingMatches({
        retrieveAssistantPendingMatches: (filters, injected) =>
            retrieveAssistantPendingMatches(filters, {
                findAllUsers: async () => users,
                findTournamentsForAssistant: async () => [league],
                findPendingMatchesForAssistant: async () => matches,
                now: () => NOW,
                ...injected,
                addPredictions: async () => {
                    throw new Error("boom")
                },
            }),
        logger: createLogger(),
    })
    const res = createResponse()
    await handler({ query: { scope: "involving", favorites: true } }, res)
    assert.equal(res.statusCode, 200)
    assert.equal(Object.hasOwn(res.body.data.matches[0], "favorite"), false)
})
test("matches without a prediction kind or an opponent come back with favorite null", async () => {
    const matches = [
        // Desempate (pata 3) de un cruce a dos piernas.
        mkMatch({
            tournament: twoLegged,
            type: "playoff",
            playoff_id: 25,
            leg: 3,
            p1: NICO,
            p2: MAX,
        }),
        // Play-in de la Champions.
        mkMatch({ tournament: champions, type: "playin", p1: NICO, p2: MAX }),
    ]
    const { data } = await callRoute({
        matches,
        retrieveStoredPredictionIndex: createStoredReader(),
        readModelEnabled: () => true,
    })
    assert.equal(data.matches.length, 2)
    for (const item of data.matches) {
        assert.equal(Object.hasOwn(item, "favorite"), true)
        assert.equal(item.favorite, null)
    }
})
test("two-legged and Champions playoff legs give the chance of winning that match", async () => {
    const matches = [
        mkMatch({
            tournament: twoLegged,
            type: "playoff",
            playoff_id: 25,
            leg: 1,
            p1: NICO,
            p2: MAX,
        }),
        mkMatch({
            tournament: twoLegged,
            type: "playoff",
            playoff_id: 25,
            leg: 2,
            p1: MAX,
            p2: NICO,
        }),
        mkMatch({
            tournament: champions,
            type: "playoff",
            playoff_id: 25,
            p1: NICO,
            p2: MAX,
        }),
    ]
    const { data } = await callRoute({
        matches,
        retrieveStoredPredictionIndex: createStoredReader(),
        readModelEnabled: () => true,
    })
    assert.equal(data.matches.length, 3)
    for (const item of data.matches) {
        assert.equal(item.favorite.outcome, "win")
        assert.equal(item.favorite.player, "Nico")
    }
})
test("a young player makes the favorite provisional and an even duel has no favorite", async () => {
    const matches = [
        mkMatch({ p1: NICO, p2: DANI, group: "A" }),
        mkMatch({ p1: NICO, p2: LEO, group: "A" }),
        mkMatch({ p1: LEO, p2: SANTI, group: "A" }),
    ]
    const { data } = await callRoute({
        matches,
        retrieveStoredPredictionIndex: createStoredReader(),
        readModelEnabled: () => true,
    })
    const byPair = Object.fromEntries(
        data.matches.map((item) => [
            `${item.p1.name}-${item.p2.name}`,
            item.favorite,
        ])
    )
    assert.equal(byPair["Nico-Dani"].player, "Nico")
    assert.equal(byPair["Nico-Dani"].provisional, true)
    assert.equal(byPair["Nico-Leo"].provisional, false)
    assert.equal(byPair["Nico-Leo"].label, "levemente favorito")
    assert.equal(byPair["Leo-Santi"], null)
})
test("the answer never carries the draw, the rival's chance or ids of the model", async () => {
    const matches = [
        mkMatch({ p1: NICO, p2: MAX, group: "A" }),
        mkMatch({
            tournament: cup,
            type: "playoff",
            playoff_id: 25,
            p1: NICO,
            p2: MAX,
        }),
    ]
    const { data } = await callRoute({
        matches,
        retrieveStoredPredictionIndex: createStoredReader(),
        readModelEnabled: () => true,
    })
    for (const item of data.matches) {
        assert.deepEqual(Object.keys(item.favorite).sort(), [
            "label",
            "outcome",
            "player",
            "probabilityPercent",
            "provisional",
        ])
        // El rival (Max, 0,314 / 0,219) y el empate (0,19) no aparecen.
        const json = JSON.stringify(item.favorite)
        for (const hidden of ["Max", "u-max", "u-nico", "0.19", "0.31"]) {
            assert.ok(!json.includes(hidden), hidden)
        }
    }
})
// ---------------------------------------------------------------------------
// D2. Favoritos solo a pedido (favorites) y resumen (summaryOnly)
// ---------------------------------------------------------------------------
const spyController = async (query) => {
    const seen = []
    const handler = createGetAssistantPendingMatches({
        retrieveAssistantPendingMatches: async (filters, injected) => {
            seen.push({ filters, injected })
            return { matches: [] }
        },
        logger: createLogger(),
    })
    const res = createResponse()
    await handler({ query }, res)
    return { seen: seen[0], res }
}
test("the controller hands addPredictions to the service only with favorites=true and without summaryOnly", async () => {
    const cases = [
        [{ scope: "involving" }, false],
        [{ scope: "involving", favorites: false }, false],
        [{ scope: "involving", favorites: false, summaryOnly: false }, false],
        [{ scope: "involving", favorites: true }, true],
        [{ scope: "involving", favorites: true, summaryOnly: false }, true],
        [{ scope: "involving", favorites: true, summaryOnly: true }, false],
        [{ scope: "involving", summaryOnly: true }, false],
    ]
    for (const [query, expected] of cases) {
        const { seen, res } = await spyController(query)
        assert.equal(
            typeof seen.injected.addPredictions,
            expected ? "function" : "undefined",
            JSON.stringify(query)
        )
        assert.equal(res.statusCode, 200)
    }
})
test("the controller passes summaryOnly to the service filters", async () => {
    const summary = await spyController({
        scope: "involving",
        summaryOnly: true,
    })
    const detail = await spyController({ scope: "involving" })
    assert.equal(summary.seen.filters.summaryOnly, true)
    assert.notEqual(detail.seen.filters.summaryOnly, true)
})
test("without favorites the full chain reads no ratings and returns no favorite key", async () => {
    const matches = [
        mkMatch({ p1: NICO, p2: MAX, group: "A" }),
        mkMatch({
            tournament: cup,
            type: "playoff",
            playoff_id: 25,
            p1: NICO,
            p2: MAX,
        }),
    ]
    const queries = [
        { scope: "involving" },
        { scope: "involving", favorites: false },
        { scope: "involving", favorites: true, summaryOnly: true },
    ]
    for (const query of queries) {
        const stored = counting(createStoredReader())
        const retrieveAllMatches = counting(async () => HISTORY)
        const { res, data } = await callRoute({
            matches,
            query,
            retrieveStoredPredictionIndex: stored,
            retrieveAllMatches,
            readModelEnabled: () => true,
        })
        assert.equal(res.statusCode, 200)
        assert.equal(stored.calls.length, 0, JSON.stringify(query))
        assert.equal(retrieveAllMatches.calls.length, 0, JSON.stringify(query))
        for (const item of data.matches)
            assert.equal(Object.hasOwn(item, "favorite"), false)
    }
})
test("with favorites=true the full chain reads the ratings and returns the favorite", async () => {
    const matches = [mkMatch({ p1: NICO, p2: MAX, group: "A" })]
    const stored = counting(createStoredReader())
    const { data } = await callRoute({
        matches,
        query: { scope: "involving", favorites: true },
        retrieveStoredPredictionIndex: stored,
        readModelEnabled: () => true,
    })
    assert.equal(stored.calls.length, 1)
    assert.equal(favoriteOf(data).player, "Nico")
})
test("the controller keeps the same answer shape with and without favorites, apart from the favorite key", async () => {
    const matches = [
        mkMatch({ p1: NICO, p2: MAX, group: "A" }),
        mkMatch({ p1: LEO, p2: SANTI, group: "A" }),
    ]
    const plain = await callRoute({
        matches,
        query: { scope: "involving" },
        retrieveStoredPredictionIndex: createStoredReader(),
        readModelEnabled: () => true,
    })
    const withFavorites = await callRoute({
        matches,
        retrieveStoredPredictionIndex: createStoredReader(),
        readModelEnabled: () => true,
    })
    const withoutFavorite = withFavorites.data.matches.map((item) => {
        const copy = { ...item }
        delete copy.favorite
        return copy
    })
    assert.ok(withFavorites.data.matches.every((item) => "favorite" in item))
    assert.deepEqual(plain.data, {
        ...withFavorites.data,
        matches: withoutFavorite,
    })
})
test("the controller builds with defaults", () => {
    assert.equal(typeof createGetAssistantPendingMatches(), "function")
    assert.equal(
        typeof require("../controller/getAssistantPendingMatches"),
        "function"
    )
})
// ---------------------------------------------------------------------------
// E. Tamaño de la respuesta
// ---------------------------------------------------------------------------
const twentyPendingMatches = () => {
    const pairs = [
        [NICO, MAX],
        [LEO, SANTI],
        [MAX, DANI],
        [SANTI, NICO],
    ]
    return Array.from({ length: 20 }, (_, position) => {
        const [p1, p2] = pairs[position % pairs.length]
        return position % 2
            ? mkMatch({
                  tournament: cup,
                  type: "playoff",
                  playoff_id: 25,
                  p1,
                  p2,
              })
            : mkMatch({ p1, p2, group: "A" })
    })
}
const addMixedPredictions = async ({ matches: sent, tournament }) =>
    sent.map((match, position) => ({
        ...match,
        prediction:
            position % 4 === 3
                ? null
                : String(tournament._id) === LEAGUE_ID
                ? outcomes(0.62, { provisional: position === 0 })
                : advance(0.18),
    }))
test("the summary-only answer is much smaller than the detailed one with favorites", async () => {
    const matches = twentyPendingMatches()
    const detailed = await runService(
        { scope: "involving", limit: 20 },
        { matches, addPredictions: addMixedPredictions }
    )
    const summary = await runService(
        { scope: "involving", limit: 20, summaryOnly: true },
        { matches, addPredictions: addMixedPredictions }
    )
    const sizeOf = (data) =>
        estimateTokens(JSON.stringify({ success: true, data }))
    assert.equal(summary.totalPending, 20)
    assert.equal(summary.matches.length, 0)
    assert.ok(
        sizeOf(summary) < sizeOf(detailed) / 2,
        `${sizeOf(summary)} vs ${sizeOf(detailed)} tokens`
    )
})
test("20 detailed matches with favorite stay far below the heavy-tool threshold", async () => {
    const matches = twentyPendingMatches()
    const result = await runService(
        { scope: "involving", limit: 20 },
        { matches, addPredictions: addMixedPredictions }
    )
    assert.equal(result.matches.length, 20)
    const favorites = result.matches.map((item) => item.favorite)
    assert.ok(favorites.some((favorite) => favorite?.outcome === "win"))
    assert.ok(favorites.some((favorite) => favorite?.outcome === "advance"))
    assert.ok(favorites.some((favorite) => favorite === null))
    for (const favorite of favorites.filter(Boolean)) {
        assert.ok(JSON.stringify(favorite).length < 140)
    }
    const tokens = estimateTokens(
        JSON.stringify({ success: true, data: result })
    )
    assert.ok(tokens < WARN_TOKENS, `${tokens} tokens`)
})

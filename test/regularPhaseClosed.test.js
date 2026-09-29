const assert = require("node:assert/strict")
const test = require("node:test")

const matchesModel = require("../dao/models/matches")
const existsMatchByTournamentId = require("../dao/existsMatchByTournamentId")
const {
    createRequireRegularPhaseOpen,
} = require("../middleware/requireRegularPhaseOpen")

// El id tal como queda guardado en `match.tournament.id`.
const TOURNAMENT_ID = "aaaaaaaaaaaaaaaaaaaaaaaa"

const regularMatch = (overrides = {}) => ({
    type: "regular",
    group: "A",
    tournament: { id: TOURNAMENT_ID, name: "Tournament" },
    ...overrides,
})

// `existing` son los partidos de eliminatoria que "hay" en la base.
const createMiddleware = (existing = []) => {
    const queries = []
    const middleware = createRequireRegularPhaseOpen({
        existsMatchByTournamentId: async (tournamentId, filter) => {
            queries.push({ tournamentId, filter })
            return existing.some((match) =>
                Object.entries(filter).every(
                    ([key, value]) => match[key] === value
                )
            )
        },
    })

    return { middleware, queries }
}

const run = (middleware, { format, match }) =>
    new Promise((resolve) => {
        middleware({ tournament: { format }, match }, {}, (error) =>
            resolve(error)
        )
    })

test("league_playin_playoff closes a zone once its play-in exists", async () => {
    const { middleware, queries } = createMiddleware([
        { type: "playin", group: "A" },
    ])

    const error = await run(middleware, {
        format: "league_playin_playoff",
        match: regularMatch({ group: "A" }),
    })

    assert.equal(error.status, 409)
    assert.equal(error.code, "REGULAR_PHASE_CLOSED")
    assert.match(error.message, /zona A/)
    assert.deepEqual(queries, [
        { tournamentId: TOURNAMENT_ID, filter: { type: "playin", group: "A" } },
    ])
})

test("the other zone keeps playing while only one play-in was generated", async () => {
    const { middleware } = createMiddleware([{ type: "playin", group: "A" }])

    const error = await run(middleware, {
        format: "league_playin_playoff",
        match: regularMatch({ group: "B" }),
    })

    assert.equal(error, undefined)
})

test("a play-in regular match without group falls back to any play-in", async () => {
    const { middleware, queries } = createMiddleware([
        { type: "playin", group: "B" },
    ])

    const error = await run(middleware, {
        format: "league_playin_playoff",
        match: regularMatch({ group: undefined }),
    })

    assert.equal(error.code, "REGULAR_PHASE_CLOSED")
    assert.deepEqual(queries[0].filter, { type: "playin" })
})

test("group formats close the whole regular phase once the playoff exists", async () => {
    for (const format of [
        "world_cup",
        "world_cup_2026",
        "champions_league",
        "super_cup",
    ]) {
        const { middleware, queries } = createMiddleware([{ type: "playoff" }])

        const error = await run(middleware, {
            format,
            match: regularMatch({ group: "C" }),
        })

        assert.equal(error.code, "REGULAR_PHASE_CLOSED", format)
        assert.match(error.message, /playoff/)
        assert.deepEqual(queries[0].filter, { type: "playoff" }, format)
    }
})

test("regular results stay open while the knockout stage does not exist", async () => {
    const { middleware } = createMiddleware([])

    for (const format of ["league", "world_cup", "league_playin_playoff"]) {
        assert.equal(
            await run(middleware, { format, match: regularMatch() }),
            undefined,
            format
        )
    }
})

test("knockout matches are never blocked and skip the lookup", async () => {
    const { middleware, queries } = createMiddleware([
        { type: "playin", group: "A" },
        { type: "playoff" },
    ])

    const playin = await run(middleware, {
        format: "league_playin_playoff",
        match: regularMatch({ type: "playin" }),
    })
    const playoff = await run(middleware, {
        format: "world_cup",
        match: regularMatch({ type: "playoff" }),
    })
    // Partido histórico sin `type`: los seeds persistidos lo marcan como
    // eliminatoria, igual que en `validateMatchResult`.
    const legacyKnockout = await run(middleware, {
        format: "world_cup",
        match: regularMatch({ type: undefined, seedP1: "1A", seedP2: "2B" }),
    })

    assert.equal(playin, undefined)
    assert.equal(playoff, undefined)
    assert.equal(legacyKnockout, undefined)
    assert.deepEqual(queries, [])
})

test("a failed lookup answers 500 instead of letting the result through", async () => {
    const middleware = createRequireRegularPhaseOpen({
        existsMatchByTournamentId: async () => {
            throw new Error("database down")
        },
    })

    const error = await run(middleware, {
        format: "world_cup",
        match: regularMatch(),
    })

    assert.equal(error.status, 500)
    assert.equal(error.code, "MATCH_PHASE_CHECK_ERROR")
})

test("the existence DAO scopes the query to the tournament", async (t) => {
    const originalExists = matchesModel.exists
    let received

    t.after(() => {
        matchesModel.exists = originalExists
    })

    matchesModel.exists = async (filter) => {
        received = filter
        return { _id: "match" }
    }

    const found = await existsMatchByTournamentId(TOURNAMENT_ID, {
        type: "playin",
        group: "A",
    })

    assert.equal(found, true)
    assert.deepEqual(received, {
        "tournament.id": TOURNAMENT_ID,
        type: "playin",
        group: "A",
    })

    matchesModel.exists = async () => null
    assert.equal(await existsMatchByTournamentId(TOURNAMENT_ID), false)
})

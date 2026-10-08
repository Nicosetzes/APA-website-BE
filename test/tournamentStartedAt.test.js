// `startedAt` del torneo = `playedAt` del primer partido jugado.
// Cubre los DAO (writer y recompute), sus services y los caminos legacy de
// carga y borrado de resultados. Los caminos de series están en
// test/playoffSeriesServices.test.js.

const assert = require("node:assert/strict")
const test = require("node:test")

const matchesModel = require("../dao/models/matches")
const tournamentsModel = require("../dao/models/tournaments")
const updateTournamentStartedAt = require("../dao/updateTournamentStartedAt")
const recomputeTournamentStartedAt = require("../dao/recomputeTournamentStartedAt")
const dao = require("../dao")
const service = require("../service")
const {
    createPutMatchByTournamentId,
} = require("../controller/putMatchByTournamentId")
const {
    createPutRemoveMatchByTournamentId,
} = require("../controller/putRemoveMatchByTournamentId")
const { resolvePlayedAtOnResult } = require("../utils/playedAt")

const TOURNAMENT_ID = "640000000000000000000001"
const TOURNAMENT_REF = { id: TOURNAMENT_ID, name: "Liga" }
const SESSION = { id: "session" }

const playerP1 = { id: "player-1", name: "Nico" }
const playerP2 = { id: "player-2", name: "Santi" }
const teamP1 = { id: 1, name: "Racing" }
const teamP2 = { id: 2, name: "Boca" }

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
    send(body) {
        this.body = body
        return this
    },
})

// Reemplaza los métodos de modelo que usan los DAO de startedAt.
const stubModels = (t, stubs) => {
    const originals = {
        tournamentsUpdateOne: tournamentsModel.updateOne,
        tournamentsFindOne: tournamentsModel.findOne,
        matchesFindOne: matchesModel.findOne,
    }
    t.after(() => {
        tournamentsModel.updateOne = originals.tournamentsUpdateOne
        tournamentsModel.findOne = originals.tournamentsFindOne
        matchesModel.findOne = originals.matchesFindOne
    })
    if (stubs.tournamentsUpdateOne)
        tournamentsModel.updateOne = stubs.tournamentsUpdateOne
    if (stubs.tournamentsFindOne)
        tournamentsModel.findOne = stubs.tournamentsFindOne
    if (stubs.matchesFindOne) matchesModel.findOne = stubs.matchesFindOne
}

const unexpected = (name) => async () => {
    throw new Error(`no debe llamarse ${name}`)
}

// --- DAO y services -----------------------------------------------------------

test("startedAt DAOs and services are registered", () => {
    assert.equal(dao.updateTournamentStartedAt, updateTournamentStartedAt)
    assert.equal(dao.recomputeTournamentStartedAt, recomputeTournamentStartedAt)
    assert.equal(typeof service.modifyTournamentStartedAt, "function")
    assert.equal(
        typeof service.modifyTournamentStartedAtAfterRemoval,
        "function"
    )
})

test("the writer filters by startedAt null and copies date and precision", async (t) => {
    const calls = []
    stubModels(t, {
        tournamentsUpdateOne: async (...args) => {
            calls.push(args)
            return { modifiedCount: 1 }
        },
    })
    const playedAt = new Date("2026-03-01T20:00:00.000Z")

    await service.modifyTournamentStartedAt(
        TOURNAMENT_ID,
        { playedAt, playedAtPrecision: "day" },
        { session: SESSION }
    )

    assert.deepEqual(calls, [
        [
            { _id: TOURNAMENT_ID, startedAt: null },
            { $set: { startedAt: playedAt, startedAtPrecision: "day" } },
            { session: SESSION },
        ],
    ])
})

test("the writer does not write without playedAt", async (t) => {
    stubModels(t, { tournamentsUpdateOne: unexpected("updateOne") })

    assert.equal(await updateTournamentStartedAt(TOURNAMENT_ID, {}), null)
    assert.equal(await updateTournamentStartedAt(TOURNAMENT_ID, null), null)
})

test("recompute after a later removal only checks the tournament", async (t) => {
    const finds = []
    stubModels(t, {
        tournamentsFindOne: async (...args) => {
            finds.push(args)
            return null
        },
        matchesFindOne: unexpected("matchesModel.findOne"),
        tournamentsUpdateOne: unexpected("updateOne"),
    })
    const removedPlayedAt = new Date("2026-03-05T20:00:00.000Z")

    const result = await service.modifyTournamentStartedAtAfterRemoval(
        TOURNAMENT_ID,
        removedPlayedAt,
        { session: SESSION }
    )

    assert.equal(result, null)
    assert.deepEqual(finds, [
        [
            { _id: TOURNAMENT_ID, startedAt: { $gte: removedPlayedAt } },
            { _id: 1 },
            { session: SESSION, lean: true },
        ],
    ])
})

test("recompute without a removed playedAt does nothing", async (t) => {
    stubModels(t, {
        tournamentsFindOne: unexpected("tournamentsModel.findOne"),
        matchesFindOne: unexpected("matchesModel.findOne"),
        tournamentsUpdateOne: unexpected("updateOne"),
    })

    assert.equal(await recomputeTournamentStartedAt(TOURNAMENT_ID, null), null)
})

test("removing the first result sets the next oldest date and precision", async (t) => {
    const calls = { matches: [], updates: [] }
    const next = {
        playedAt: new Date("2026-03-02T00:00:00.000Z"),
        playedAtPrecision: "day",
    }
    stubModels(t, {
        tournamentsFindOne: async () => ({ _id: TOURNAMENT_ID }),
        matchesFindOne: async (...args) => {
            calls.matches.push(args)
            return next
        },
        tournamentsUpdateOne: async (...args) => {
            calls.updates.push(args)
            return { modifiedCount: 1 }
        },
    })

    await recomputeTournamentStartedAt(
        TOURNAMENT_ID,
        new Date("2026-03-01T20:00:00.000Z"),
        { session: SESSION }
    )

    assert.deepEqual(calls.matches, [
        [
            {
                "tournament.id": TOURNAMENT_ID,
                played: true,
                playedAt: { $ne: null },
            },
            { playedAt: 1, playedAtPrecision: 1 },
            {
                session: SESSION,
                sort: { playedAt: 1, _id: 1 },
                lean: true,
            },
        ],
    ])
    assert.deepEqual(calls.updates, [
        [
            { _id: TOURNAMENT_ID },
            {
                $set: {
                    startedAt: next.playedAt,
                    startedAtPrecision: "day",
                },
            },
            { session: SESSION },
        ],
    ])
})

test("removing the only result unsets startedAt and its precision", async (t) => {
    const updates = []
    stubModels(t, {
        tournamentsFindOne: async () => ({ _id: TOURNAMENT_ID }),
        matchesFindOne: async () => null,
        tournamentsUpdateOne: async (...args) => {
            updates.push(args)
            return { modifiedCount: 1 }
        },
    })

    await recomputeTournamentStartedAt(
        TOURNAMENT_ID,
        new Date("2026-03-01T20:00:00.000Z"),
        { session: SESSION }
    )

    assert.deepEqual(updates, [
        [
            { _id: TOURNAMENT_ID },
            { $unset: { startedAt: 1, startedAtPrecision: 1 } },
            { session: SESSION },
        ],
    ])
})

// --- Caminos legacy de resultado -------------------------------------------

const createResultRequest = (match, scores = {}) => ({
    params: { tournament: TOURNAMENT_ID, match: match._id },
    body: {
        playerP1,
        teamP1,
        scoreP1: scores.scoreP1 ?? 1,
        playerP2,
        teamP2,
        scoreP2: scores.scoreP2 ?? 0,
        valid: true,
    },
    match: { playerP1, teamP1, playerP2, teamP2, ...match },
})

test("a legacy result calls the writer inside the transaction", async () => {
    const calls = []
    let inTransaction = false
    const updatedMatch = {
        _id: "match",
        type: "regular",
        tournament: TOURNAMENT_REF,
        playedAt: new Date("2026-03-01T20:00:00.000Z"),
        playedAtPrecision: "exact",
    }
    const controller = createPutMatchByTournamentId({
        modifyMatchResult: async () => updatedMatch,
        modifyTournamentStartedAt: async (...args) => {
            calls.push({ args, inTransaction })
        },
        withTransaction: async (work) => {
            inTransaction = true
            try {
                return await work(SESSION)
            } finally {
                inTransaction = false
            }
        },
    })

    await controller(
        createResultRequest({ _id: "match", type: "regular", played: false }),
        createResponse()
    )

    assert.deepEqual(calls, [
        {
            args: [TOURNAMENT_ID, updatedMatch, { session: SESSION }],
            inTransaction: true,
        },
    ])
})

test("a legacy result without tournament does not call the writer", async () => {
    const controller = createPutMatchByTournamentId({
        modifyMatchResult: async () => ({
            _id: "match",
            type: "regular",
            tournament: null,
            playedAt: new Date(),
            playedAtPrecision: "exact",
        }),
        modifyTournamentStartedAt: unexpected("modifyTournamentStartedAt"),
        withTransaction: async (work) => work(SESSION),
    })

    const response = createResponse()
    await controller(
        createResultRequest({ _id: "match", type: "regular", played: false }),
        response
    )
    assert.equal(response.statusCode, 200)
})

test("legacy remove runs in a transaction and recomputes with the removed playedAt", async () => {
    const calls = []
    let inTransaction = false
    const removedPlayedAt = new Date("2026-03-01T20:00:00.000Z")
    const cleaned = { _id: "match", played: false, tournament: TOURNAMENT_REF }
    const controller = createPutRemoveMatchByTournamentId({
        modifyMatchResultToRemoveIt: async (...args) => {
            calls.push(["remove", args, inTransaction])
            return cleaned
        },
        modifyTournamentStartedAtAfterRemoval: async (...args) => {
            calls.push(["recompute", args, inTransaction])
        },
        withTransaction: async (work) => {
            inTransaction = true
            try {
                return await work(SESSION)
            } finally {
                inTransaction = false
            }
        },
    })
    const response = createResponse()

    await controller(
        {
            params: { tournament: TOURNAMENT_ID, match: "match" },
            body: {},
            match: { _id: "match", type: "regular", playedAt: removedPlayedAt },
        },
        response
    )

    assert.equal(response.body, cleaned)
    assert.deepEqual(calls, [
        ["remove", ["match", { session: SESSION }], true],
        [
            "recompute",
            [TOURNAMENT_ID, removedPlayedAt, { session: SESSION }],
            true,
        ],
    ])
})

test("legacy remove without playedAt does not recompute", async () => {
    let transactions = 0
    const controller = createPutRemoveMatchByTournamentId({
        modifyMatchResultToRemoveIt: async () => ({
            _id: "match",
            played: false,
            tournament: TOURNAMENT_REF,
        }),
        modifyTournamentStartedAtAfterRemoval: unexpected("recompute"),
        withTransaction: async (work) => {
            transactions += 1
            return work(SESSION)
        },
    })

    await controller(
        {
            params: { tournament: TOURNAMENT_ID, match: "match" },
            body: {},
            match: { _id: "match", type: "regular" },
        },
        createResponse()
    )

    assert.equal(transactions, 1)
})

// --- Escenario en memoria con los DAO reales -------------------------------

// Store mínimo: un torneo y sus partidos. Los stubs de modelo respetan los
// filtros que usan los DAO de startedAt.
const createStore = () => {
    const tournament = { _id: TOURNAMENT_ID }
    const matches = []
    const time = (value) => new Date(value).getTime()

    const stubs = {
        tournamentsUpdateOne: async (filter, update) => {
            if (String(filter._id) !== TOURNAMENT_ID)
                return { modifiedCount: 0 }
            if ("startedAt" in filter && tournament.startedAt != null)
                return { modifiedCount: 0 }
            for (const key of Object.keys(update.$unset || {}))
                delete tournament[key]
            Object.assign(tournament, update.$set || {})
            return { modifiedCount: 1 }
        },
        tournamentsFindOne: async (filter) => {
            const since = filter.startedAt?.$gte
            if (tournament.startedAt == null) return null
            if (since && time(tournament.startedAt) < time(since)) return null
            return { _id: tournament._id }
        },
        matchesFindOne: async (filter) => {
            const candidates = matches
                .filter(
                    (match) =>
                        String(match.tournament.id) ===
                            filter["tournament.id"] &&
                        match.played === true &&
                        match.playedAt != null
                )
                .sort(
                    (a, b) =>
                        time(a.playedAt) - time(b.playedAt) ||
                        (a._id < b._id ? -1 : 1)
                )
            return candidates[0] ?? null
        },
    }

    const addMatch = (_id, extra = {}) => {
        const match = {
            _id,
            type: "regular",
            tournament: TOURNAMENT_REF,
            played: false,
            playerP1,
            teamP1,
            playerP2,
            teamP2,
            ...extra,
        }
        matches.push(match)
        return match
    }

    return { tournament, matches, stubs, addMatch }
}

const createScenario = (t) => {
    const store = createStore()
    stubModels(t, store.stubs)
    let clock = Date.UTC(2026, 2, 1, 20)

    const putController = createPutMatchByTournamentId({
        // Como el DAO real: `resolvePlayedAtOnResult` decide playedAt.
        modifyMatchResult: async (
            id,
            scoreP1,
            scoreP2,
            outcome,
            valid,
            opts
        ) => {
            const match = store.matches.find(({ _id }) => _id === id)
            clock += 24 * 60 * 60 * 1000
            Object.assign(match, {
                scoreP1,
                scoreP2,
                outcome,
                played: true,
                ...resolvePlayedAtOnResult(opts.previous, new Date(clock)),
            })
            return match
        },
        withTransaction: async (work) => work(SESSION),
    })
    const removeController = createPutRemoveMatchByTournamentId({
        modifyMatchResultToRemoveIt: async (id) => {
            const match = store.matches.find(({ _id }) => _id === id)
            for (const key of [
                "scoreP1",
                "scoreP2",
                "outcome",
                "playedAt",
                "playedAtPrecision",
            ])
                delete match[key]
            match.played = false
            return match
        },
        withTransaction: async (work) => work(SESSION),
    })

    const load = (match) =>
        putController(createResultRequest({ ...match }), createResponse())
    const remove = (match) =>
        removeController(
            {
                params: { tournament: TOURNAMENT_ID, match: match._id },
                body: {},
                match: { ...match },
            },
            createResponse()
        )

    return { store, load, remove }
}

test("first result starts the tournament; later results and edits keep it", async (t) => {
    const { store, load } = createScenario(t)
    const first = store.addMatch("m1")
    const second = store.addMatch("m2")
    // Partido histórico con fecha anterior al inicio (p. ej. fecha corregida).
    const older = store.addMatch("m0", {
        played: true,
        scoreP1: 0,
        scoreP2: 0,
        playedAt: new Date("2025-12-01T00:00:00.000Z"),
        playedAtPrecision: "day",
    })

    await load(first)
    assert.ok(first.playedAt)
    assert.equal(store.tournament.startedAt, first.playedAt)
    assert.equal(store.tournament.startedAtPrecision, "exact")
    const startedAt = store.tournament.startedAt

    await load(second)
    assert.ok(second.playedAt > first.playedAt)
    assert.equal(store.tournament.startedAt, startedAt)

    // Editar un partido con playedAt anterior no mueve playedAt ni startedAt.
    await load(older)
    assert.equal(older.playedAt.toISOString(), "2025-12-01T00:00:00.000Z")
    assert.equal(store.tournament.startedAt, startedAt)
})

test("removing the first result moves startedAt and removing the last unsets it", async (t) => {
    const { store, load, remove } = createScenario(t)
    const first = store.addMatch("m1")
    const second = store.addMatch("m2")

    await load(first)
    await load(second)
    const secondPlayedAt = second.playedAt

    // Borrar el segundo (posterior al inicio) no cambia startedAt.
    await remove(second)
    assert.equal(store.tournament.startedAt, first.playedAt)

    await load(second)
    const startedAt = first.playedAt
    assert.notEqual(second.playedAt, secondPlayedAt)

    await remove(first)
    assert.notEqual(store.tournament.startedAt, startedAt)
    assert.equal(store.tournament.startedAt, second.playedAt)
    assert.equal(store.tournament.startedAtPrecision, "exact")

    await remove(second)
    assert.equal("startedAt" in store.tournament, false)
    assert.equal("startedAtPrecision" in store.tournament, false)
})

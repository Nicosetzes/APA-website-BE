process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
    createGetTournamentRecapsPending,
} = require("../controller/getTournamentRecapsPending")
const { BACKFILL_EXCLUDED_TOURNAMENTS } = require("../config/tournamentRecap")
const findFinishedTournamentsForRecap = require("../dao/findFinishedTournamentsForRecap")
const findTournamentIdsWithPlayedMatches = require("../dao/findTournamentIdsWithPlayedMatches")
const findTournamentRecapIds = require("../dao/findTournamentRecapIds")
const matchesModel = require("../dao/models/matches")
const tournamentRecapsModel = require("../dao/models/tournamentRecaps")
const tournamentsModel = require("../dao/models/tournaments")
const requireRecapSecret = require("../middleware/requireRecapSecret")
const { recapRateLimit } = require("../middleware/rateLimits")
const retrieveTournamentsPendingRecap = require("../service/retrieveTournamentsPendingRecap")
const {
    partitionPendingTournaments,
} = require("../service/retrieveTournamentsPendingRecap")
const requestSchemas = require("../validation/requestSchemas")
const { root } = require("../router/router")

const NOW = new Date("2026-10-21T12:00:00.000Z") // 2026-10-21 en Argentina

const id24 = (n) => n.toString(16).padStart(24, "0")

const tournament = (n, overrides = {}) => ({
    _id: id24(n),
    name: `Torneo ${n}`,
    format: "league_playin_playoff",
    playoffMode: undefined,
    closedAt: new Date("2026-10-18T20:00:00.000Z"),
    closedAtPrecision: "exact",
    outcome: {
        champion: {
            player: { id: "p1", name: "Nico" },
            team: { id: 1, name: "Liverpool" },
        },
        finalist: {
            player: { id: "p2", name: "Max" },
            team: { id: 2, name: "Chelsea" },
        },
    },
    ...overrides,
})

const partition = (input) =>
    partitionPendingTournaments({
        recapIds: [],
        limit: 3,
        now: NOW,
        ...input,
        withMatches: input.withMatches ?? input.tournaments.map((t) => t._id),
    })

// Evalúa el filtro del DAO sobre documentos en memoria (solo los operadores
// que usa: igualdad, `$ne` y `$exists`, con rutas anidadas).
const matchesFilter = (document, filter) =>
    Object.entries(filter).every(([path, condition]) => {
        const value = path
            .split(".")
            .reduce((current, key) => current?.[key], document)

        if (condition === null || typeof condition !== "object") {
            return value === condition
        }
        if (
            "$exists" in condition &&
            Boolean(value !== undefined) !== condition.$exists
        ) {
            return false
        }
        if ("$ne" in condition && value === condition.$ne) return false

        return true
    })

test("the finished-tournaments filter keeps only valid, non-legacy, finished tournaments with a champion", () => {
    const { FILTER } = findFinishedTournamentsForRecap
    const eligible = tournament(1, { ongoing: false })
    const excluded = {
        ongoing: tournament(2, { ongoing: true }),
        invalid: tournament(3, { ongoing: false, valid: false }),
        legacy: tournament(4, { ongoing: false, legacy: true }),
        noChampion: tournament(5, { ongoing: false, outcome: undefined }),
        nullChampionId: tournament(6, {
            ongoing: false,
            outcome: { champion: { player: { id: null } } },
        }),
    }

    assert.equal(matchesFilter(eligible, FILTER), true)
    assert.equal(matchesFilter({ ...eligible, legacy: false }, FILTER), true)
    assert.equal(matchesFilter({ ...eligible, valid: true }, FILTER), true)

    for (const [reason, document] of Object.entries(excluded)) {
        assert.equal(matchesFilter(document, FILTER), false, reason)
    }
})

test("the DAOs are read-only lean queries with explicit projections", async (t) => {
    const calls = []
    t.mock.method(tournamentsModel, "find", (filter, projection) => {
        calls.push(["find", filter, projection])
        return { lean: async () => [] }
    })
    t.mock.method(tournamentRecapsModel, "distinct", async (field) => {
        calls.push(["recaps.distinct", field])
        return ["a"]
    })
    t.mock.method(matchesModel, "distinct", async (field, filter) => {
        calls.push(["matches.distinct", field, filter])
        return [id24(1)]
    })

    await findFinishedTournamentsForRecap()
    assert.deepEqual(await findTournamentRecapIds(), ["a"])
    assert.deepEqual(await findTournamentIdsWithPlayedMatches([id24(1), 7]), [
        id24(1),
    ])
    assert.deepEqual(await findTournamentIdsWithPlayedMatches([]), [])

    assert.equal(calls[0][0], "find")
    assert.equal(calls[0][2], findFinishedTournamentsForRecap.PROJECTION)
    assert.deepEqual(calls[1], ["recaps.distinct", "tournamentId"])
    assert.deepEqual(calls[2], [
        "matches.distinct",
        "tournament.id",
        {
            "tournament.id": { $in: [id24(1), "7"] },
            played: true,
            valid: { $ne: false },
        },
    ])
    // Con lista vacía no consulta.
    assert.equal(calls.length, 3)
})

test("pending returns tournaments closed inside [closedAfter, today) in closing order", () => {
    const result = partition({
        tournaments: [
            tournament(1, { closedAt: new Date("2026-10-19T15:00:00.000Z") }),
            tournament(2, { closedAt: new Date("2026-10-15T15:00:00.000Z") }),
            tournament(3, { closedAt: new Date("2026-10-17T15:00:00.000Z") }),
        ],
    })

    assert.deepEqual(
        result.data.map(({ tournamentId }) => tournamentId),
        [id24(2), id24(3), id24(1)]
    )
    assert.equal(result.closedAfter, "2026-10-14")
    assert.equal(result.before, "2026-10-21")
    assert.equal(result.limit, 3)
})

test("pending uses a seven Argentine day window by default and honors closedAfter", () => {
    const tournaments = [
        tournament(1, { closedAt: new Date("2026-10-14T02:59:59.999Z") }), // 13/10 ART
        tournament(2, { closedAt: new Date("2026-10-14T03:00:00.000Z") }), // 14/10 ART
    ]
    const byDefault = partition({ tournaments })

    assert.deepEqual(
        byDefault.data.map(({ tournamentId }) => tournamentId),
        [id24(2)]
    )
    assert.equal(byDefault.closedAfter, "2026-10-14")

    const explicit = partition({ tournaments, closedAfter: "2026-10-13" })

    assert.deepEqual(
        explicit.data.map(({ tournamentId }) => tournamentId),
        [id24(1), id24(2)]
    )
    assert.equal(explicit.closedAfter, "2026-10-13")
})

test("pending excludes a tournament closed today (it enters tomorrow)", () => {
    const tournaments = [
        tournament(1, { closedAt: new Date("2026-10-21T03:00:00.000Z") }), // hoy ART
        tournament(2, { closedAt: new Date("2026-10-21T02:59:59.999Z") }), // ayer ART
    ]
    const result = partition({ tournaments })

    assert.deepEqual(
        result.data.map(({ tournamentId }) => tournamentId),
        [id24(2)]
    )

    // Un instante después, el día argentino cambia y entra el de ayer también.
    const tomorrow = partitionPendingTournaments({
        tournaments,
        recapIds: [],
        withMatches: tournaments.map((item) => item._id),
        limit: 3,
        now: new Date("2026-10-22T03:00:00.000Z"),
    })

    assert.equal(tomorrow.data.length, 2)
})

test("pending subtracts tournaments that already have a recap", () => {
    const result = partition({
        tournaments: [tournament(1), tournament(2), tournament(3)],
        recapIds: [id24(2)],
    })

    assert.deepEqual(
        result.data.map(({ tournamentId }) => tournamentId),
        [id24(1), id24(3)]
    )
    assert.equal(result.counts.withRecap, 1)
    assert.equal(result.counts.finishedEligible, 3)
    assert.equal(result.counts.inWindowWithoutRecap, 2)
})

test("pending cuts to the limit after ordering and keeps the rest in the counts", () => {
    const tournaments = [4, 3, 2, 1].map((n) =>
        tournament(n, {
            closedAt: new Date(`2026-10-1${n + 4}T20:00:00.000Z`),
        })
    )
    const result = partition({ tournaments, limit: 2 })

    assert.deepEqual(
        result.data.map(({ tournamentId }) => tournamentId),
        [id24(1), id24(2)]
    )
    assert.equal(result.counts.returned, 2)
    assert.equal(result.counts.inWindowWithoutRecap, 4)
})

test("pending counts tournaments without closedAt instead of dropping them silently", () => {
    const result = partition({
        tournaments: [
            tournament(1, { closedAt: undefined }),
            tournament(2, { closedAt: null }),
            tournament(3),
        ],
    })

    assert.deepEqual(
        result.data.map(({ tournamentId }) => tournamentId),
        [id24(3)]
    )
    assert.equal(result.counts.skippedWithoutClosedAt, 2)
    // Los que tienen recap no cuentan como salteados.
    const withRecap = partition({
        tournaments: [tournament(1, { closedAt: undefined })],
        recapIds: [id24(1)],
    })

    assert.equal(withRecap.counts.skippedWithoutClosedAt, 0)
})

test("pending drops in-window tournaments without played matches and counts them", () => {
    const result = partition({
        tournaments: [tournament(1), tournament(2)],
        withMatches: [id24(2)],
    })

    assert.deepEqual(
        result.data.map(({ tournamentId }) => tournamentId),
        [id24(2)]
    )
    assert.equal(result.counts.skippedWithoutMatches, 1)
    assert.equal(result.counts.inWindowWithoutRecap, 2)
})

test("pending backlog ignores the window and the limit and lists ids only", () => {
    const tournaments = [
        tournament(1, { closedAt: new Date("2023-05-10T20:00:00.000Z") }),
        tournament(2, { closedAt: new Date("2025-12-29T20:00:00.000Z") }),
        tournament(3), // dentro de la ventana
        tournament(4, { closedAt: undefined }),
        tournament(5, { closedAt: new Date("2024-01-10T20:00:00.000Z") }),
        tournament(6, { closedAt: new Date("2022-04-19T20:00:00.000Z") }),
    ]
    const result = partition({
        tournaments,
        recapIds: [id24(6)],
        withMatches: [1, 2, 3, 5, 6].map(id24),
        limit: 1,
    })

    assert.equal(result.data.length, 1)
    // Sin recap y con partidos, de más viejo a más nuevo; el que no tiene
    // `closedAt` queda afuera por no tener partidos y el que tiene recap, también.
    assert.deepEqual(
        result.backlog.tournaments.map(({ tournamentId }) => tournamentId),
        [id24(1), id24(5), id24(2), id24(3)]
    )
    assert.equal(result.backlog.count, 4)
    assert.deepEqual(Object.keys(result.backlog.tournaments[0]), [
        "tournamentId",
        "name",
        "format",
        "closedAt",
    ])
})

test("pending items expose the champion and the runner-up", () => {
    const [item] = partition({ tournaments: [tournament(1)] }).data

    assert.deepEqual(item, {
        tournamentId: id24(1),
        name: "Torneo 1",
        format: "league_playin_playoff",
        playoffMode: null,
        closedAt: new Date("2026-10-18T20:00:00.000Z"),
        closedAtPrecision: "exact",
        champion: {
            player: { id: "p1", name: "Nico" },
            team: { id: 1, name: "Liverpool" },
        },
        runnerUp: {
            player: { id: "p2", name: "Max" },
            team: { id: 2, name: "Chelsea" },
        },
    })
})

test("retrieveTournamentsPendingRecap only asks for matches of tournaments without recap", async () => {
    const asked = []
    const result = await retrieveTournamentsPendingRecap({
        now: NOW,
        findFinished: async () => [tournament(1), tournament(2)],
        findRecapIds: async () => [id24(1)],
        findIdsWithMatches: async (ids) => {
            asked.push(ids)
            return ids
        },
    })

    assert.deepEqual(asked, [[id24(2)]])
    assert.deepEqual(
        result.data.map(({ tournamentId }) => tournamentId),
        [id24(2)]
    )
    assert.equal(result.limit, 3)
})

test("the pending controller forwards the validated query and wraps the result", async () => {
    const received = []
    const handler = createGetTournamentRecapsPending({
        retrieveTournamentsPendingRecap: async (options) => {
            received.push(options)
            return { closedAfter: "2026-10-14", data: [] }
        },
        now: () => NOW,
    })
    let body

    await handler(
        { query: { closedAfter: "2026-10-01", limit: 5 } },
        { json: (payload) => (body = payload) }
    )

    assert.deepEqual(received, [
        { closedAfter: "2026-10-01", limit: 5, now: NOW },
    ])
    assert.deepEqual(body, {
        success: true,
        closedAfter: "2026-10-14",
        data: [],
    })
})

test("the pending schema applies defaults and rejects bad input", () => {
    const { query } = requestSchemas.getTournamentRecapsPending

    assert.equal(query.validate({}).value.limit, 3)
    assert.equal(query.validate({ limit: "20" }).value.limit, 20)
    for (const bad of [
        { limit: 0 },
        { limit: 21 },
        { limit: 1.5 },
        { closedAfter: "21-10-2026" },
        { closedAfter: "2026-02-30" },
        { unexpected: "1" },
    ]) {
        assert.ok(query.validate(bad).error, JSON.stringify(bad))
    }
})

test("pending is wired behind the rate limiter, the secret and validation", () => {
    const route = root.stack.find(
        (layer) =>
            layer.route?.path === "/tournament-recaps/pending" &&
            layer.route.methods.get
    )
    const handlers = route.route.stack.map((layer) => layer.handle)

    assert.equal(handlers[0], recapRateLimit)
    assert.equal(handlers[1], requireRecapSecret)
    assert.equal(handlers.length, 4)
})

test("recap routes are declared so none shadows another", () => {
    const paths = root.stack
        .filter((layer) => layer.route)
        .map(
            (layer) =>
                `${Object.keys(layer.route.methods)[0]} ${layer.route.path}`
        )
    const index = (entry) => paths.indexOf(entry)

    assert.ok(index("get /tournament-recaps/pending") >= 0)
    assert.ok(index("get /tournament-recaps/context") >= 0)
    assert.ok(index("post /tournament-recaps") >= 0)
    // Los recaps diarios siguen en su lugar: `:date` va último.
    assert.ok(index("get /recaps/latest") < index("get /recaps/:date"))
    assert.equal(
        paths.filter((entry) => entry.includes("/tournament-recaps/:")).length,
        0
    )
})

test("pending backlog leaves out the tournaments excluded from the backfill, only there", () => {
    const excludedId = Object.keys(BACKFILL_EXCLUDED_TOURNAMENTS)[0]
    const tournaments = [
        tournament(1, { closedAt: new Date("2023-05-10T20:00:00.000Z") }),
        tournament(2, { _id: excludedId, name: "Chempions 2019/20" }),
        tournament(3, { closedAt: new Date("2024-01-10T20:00:00.000Z") }),
    ]
    const result = partition({ tournaments })

    // Fuera del backlog...
    assert.deepEqual(
        result.backlog.tournaments.map(({ tournamentId }) => tournamentId),
        [id24(1), id24(3)]
    )
    assert.equal(result.backlog.count, 2)
    // ...pero la ventana diaria y los conteos no cambian: el excluido, que cerró
    // dentro de la ventana, se sigue procesando.
    assert.deepEqual(
        result.data.map(({ tournamentId }) => tournamentId),
        [excludedId]
    )
    assert.equal(result.counts.finishedEligible, 3)
    assert.equal(result.counts.inWindowWithoutRecap, 1)
    // Sin la lista, vuelve a aparecer.
    assert.equal(
        partition({ tournaments, excludedFromBacklog: {} }).backlog.count,
        3
    )
})

test("the pending service applies the configured exclusion to a PROD-like backlog", async () => {
    const excludedId = Object.keys(BACKFILL_EXCLUDED_TOURNAMENTS)[0]
    const old = new Date("2023-05-20T20:00:00.000Z")
    const result = await retrieveTournamentsPendingRecap({
        now: NOW,
        findFinished: async () => [
            tournament(1, { closedAt: old }),
            tournament(2, { _id: excludedId, closedAt: old }),
        ],
        findRecapIds: async () => [],
        findIdsWithMatches: async (ids) => ids,
    })

    assert.equal(result.backlog.count, 1)
    assert.deepEqual(
        result.backlog.tournaments.map(({ tournamentId }) => tournamentId),
        [id24(1)]
    )
    assert.equal(result.limit, 3)
    assert.equal(result.closedAfter, "2026-10-14")
})

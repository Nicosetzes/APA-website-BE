const assert = require("node:assert/strict")
const test = require("node:test")

const {
    createGetFixtureByTournamentId,
} = require("../controller/getFixtureByTournamentId")
const {
    createGetPlayinMatchesByTournamentId,
} = require("../controller/getPlayinMatchesByTournamentId")
const {
    createGetPlayoffMatchesByTournamentId,
} = require("../controller/getPlayoffMatchesByTournamentId")
const {
    createRetrieveStoredPredictionIndex,
} = require("../service/ratingsReadModel")
const {
    ANA,
    BETO,
    FINGERPRINT,
    NEWCOMER,
    SOURCE_STATS,
    fakeReadDaos,
    realTeamIds,
    storedDocsFrom,
    syntheticHistory,
} = require("./fixtures/ratingsReadModel")
const { match } = require("./fixtures/ratingsStore")

// Cableado de los tres endpoints con el índice guardado (etapa 2): el body con
// lo persistido es idéntico al del cálculo en vivo. Todo con fakes, sin base.

const HISTORY = syntheticHistory()
const REAL = realTeamIds()

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

const createLogger = () => {
    const calls = []
    return {
        calls,
        info: (event, fields) => calls.push({ level: "info", event, fields }),
        warn: (event, fields) => calls.push({ level: "warn", event, fields }),
    }
}

const readModelLines = (logger) =>
    logger.calls.filter((call) => call.event === "rating_read_model")

const counting = (fn) => {
    const wrapped = async (...args) => {
        wrapped.calls += 1
        return fn(...args)
    }
    wrapped.calls = 0
    return wrapped
}

const createRetriever = ({ sourceStats } = {}) =>
    counting(
        createRetrieveStoredPredictionIndex({
            ...fakeReadDaos({ docs: storedDocsFrom(HISTORY), sourceStats }),
            getCurrentFingerprint: () => FINGERPRINT,
        })
    )

const pendingMatch = (n, playerP1, playerP2, extra = {}) =>
    match(n, playerP1, null, playerP2, null, "2026-03-01T15:00:00Z", {
        played: false,
        teamP1: REAL.teamA,
        teamP2: REAL.teamB,
        tournament: { id: REAL.tournamentId, name: "Torneo real" },
        ...extra,
    })

const NOT_FOUND = "TOURNAMENT_NOT_FOUND"

// Cada caso arma el controller con las dependencias dadas y lo invoca. Los
// partidos mezclan jugados (con evento guardado) y pendientes, con ids de
// equipos reales.
const playoffMatches = () => [
    HISTORY[4],
    HISTORY[14],
    pendingMatch(101, ANA, BETO, { type: "playoff" }),
    pendingMatch(102, BETO, NEWCOMER, { type: "playoff" }),
]
const twoLeggedMatches = () => [
    { ...HISTORY[4], leg: 1 },
    { ...HISTORY[9], leg: 2 },
    pendingMatch(103, ANA, BETO, { type: "playoff", leg: 1 }),
    pendingMatch(104, ANA, BETO, { type: "playoff", leg: 3 }),
]
const playinMatches = () => [
    { ...HISTORY[4], type: "playin" },
    { ...HISTORY[14], type: "playin" },
    pendingMatch(105, ANA, BETO, { type: "playin" }),
]
const fixtureMatches = () => [
    HISTORY[0],
    HISTORY[1],
    HISTORY[3],
    pendingMatch(106, ANA, BETO, { type: "regular" }),
    pendingMatch(107, BETO, NEWCOMER, { type: "regular" }),
]

const bracketCase = (name, create, retrieveKey, tournament, matches, kind) => ({
    name,
    kind,
    run: async (dependencies) => {
        const controller = create({
            retrieveTournamentById: async () => tournament,
            [retrieveKey]: async () => matches(),
            ...dependencies,
        })
        const response = createResponse()
        await controller({ params: { tournament: "tournament" } }, response)
        assert.equal(response.statusCode, 200)
        return response.body
    },
    runEmpty: async (dependencies) => {
        const controller = create({
            retrieveTournamentById: async () => tournament,
            [retrieveKey]: async () => [],
            ...dependencies,
        })
        const response = createResponse()
        await controller({ params: { tournament: "tournament" } }, response)
        assert.equal(response.statusCode, 200)
        return response.body
    },
    runNotFound: async (dependencies) => {
        const controller = create({
            retrieveTournamentById: async () => null,
            [retrieveKey]: async () => matches(),
            ...dependencies,
        })
        return controller(
            { params: { tournament: "tournament" } },
            createResponse()
        ).catch((error) => error)
    },
    predictionsOf: (body) => body.matches.map((item) => item.prediction),
})

const CASES = [
    bracketCase(
        "playoff de partido único",
        createGetPlayoffMatchesByTournamentId,
        "retrievePlayoffMatchesByTournamentId",
        { _id: "tournament", format: "world_cup" },
        playoffMatches,
        undefined
    ),
    bracketCase(
        "playoff a dos piernas",
        createGetPlayoffMatchesByTournamentId,
        "retrievePlayoffMatchesByTournamentId",
        { _id: "tournament", format: "playoff", playoffMode: "two_legged" },
        twoLeggedMatches,
        "outcomes"
    ),
    bracketCase(
        "play-in",
        createGetPlayinMatchesByTournamentId,
        "retrievePlayinMatchesByTournamentId",
        { _id: "tournament", format: "world_cup" },
        playinMatches,
        undefined
    ),
    {
        name: "fixture",
        kind: "outcomes",
        run: async (dependencies) => {
            const controller = createGetFixtureByTournamentId({
                retrieveFixtureByTournamentId: async () => ({
                    matches: fixtureMatches(),
                    totalPages: 1,
                    currentPage: 1,
                }),
                ...dependencies,
            })
            const response = createResponse()
            await controller(
                { params: { tournament: "tournament" }, query: { page: 1 } },
                response
            )
            assert.equal(response.statusCode, 200)
            return response.body
        },
        runEmpty: async (dependencies) => {
            const controller = createGetFixtureByTournamentId({
                retrieveFixtureByTournamentId: async () => ({
                    matches: [],
                    totalPages: 0,
                }),
                ...dependencies,
            })
            const response = createResponse()
            await controller(
                { params: { tournament: "tournament" }, query: {} },
                response
            )
            assert.equal(response.statusCode, 200)
            return response.body
        },
        predictionsOf: (body) => body.matches.map((item) => item.prediction),
    },
]

for (const testCase of CASES) {
    const live = async () => {
        const reader = counting(async () => HISTORY)
        const logger = createLogger()
        const body = await testCase.run({
            retrieveAllMatches: reader,
            logger,
        })
        return { body, reader, logger }
    }

    test(`${testCase.name}: el body guardado es idéntico al del camino en vivo`, async () => {
        const baseline = await live()
        const reader = counting(async () => HISTORY)
        const retriever = createRetriever()
        const logger = createLogger()

        const body = await testCase.run({
            retrieveAllMatches: reader,
            retrieveStoredPredictionIndex: retriever,
            logger,
        })

        assert.deepEqual(body, baseline.body)
        const predictions = testCase.predictionsOf(body)
        assert.ok(predictions.filter((item) => item !== null).length >= 3)
        if (testCase.kind) {
            assert.ok(predictions.some((item) => item?.kind === testCase.kind))
        }
        assert.equal(reader.calls, 0)
        assert.equal(retriever.calls, 1)
        assert.equal(logger.calls.length, 1)
        assert.equal(logger.calls[0].level, "info")
        assert.equal(logger.calls[0].fields.source, "stored")
        assert.equal(logger.calls[0].fields.reason, "ok")
        // El camino en vivo sin retriever guardado no emite la línea.
        assert.equal(baseline.logger.calls.length, 0)
        assert.equal(baseline.reader.calls, 1)
    })

    test(`${testCase.name}: con lo guardado desactualizado el body sigue idéntico`, async () => {
        const baseline = await live()
        const reader = counting(async () => HISTORY)
        const logger = createLogger()

        const body = await testCase.run({
            retrieveAllMatches: reader,
            retrieveStoredPredictionIndex: createRetriever({
                sourceStats: {
                    ...SOURCE_STATS,
                    ratedMatches: SOURCE_STATS.ratedMatches + 1,
                },
            }),
            logger,
        })

        assert.deepEqual(body, baseline.body)
        assert.equal(reader.calls, 1)
        assert.equal(readModelLines(logger).length, 1)
        assert.equal(logger.calls[0].fields.source, "live")
        assert.equal(logger.calls[0].fields.reason, "stale_count")
    })

    test(`${testCase.name}: el interruptor (dependencies.readModelEnabled) fuerza el camino en vivo`, async () => {
        const baseline = await live()
        const reader = counting(async () => HISTORY)
        const retriever = createRetriever()
        const logger = createLogger()

        const body = await testCase.run({
            retrieveAllMatches: reader,
            retrieveStoredPredictionIndex: retriever,
            readModelEnabled: () => false,
            logger,
        })

        assert.deepEqual(body, baseline.body)
        assert.equal(retriever.calls, 0)
        assert.equal(reader.calls, 1)
        assert.equal(logger.calls[0].fields.source, "live")
        assert.equal(logger.calls[0].fields.reason, "disabled")
    })

    test(`${testCase.name}: inyectar solo retrieveAllMatches no activa lo guardado`, async () => {
        const reader = counting(async () => HISTORY)
        const logger = createLogger()

        await testCase.run({ retrieveAllMatches: reader, logger })

        assert.equal(reader.calls, 1)
        assert.equal(readModelLines(logger).length, 0)
        assert.equal(logger.calls.length, 0)
    })

    test(`${testCase.name}: sin partidos no lee nada ni loguea`, async () => {
        const reader = counting(async () => HISTORY)
        const retriever = createRetriever()
        const logger = createLogger()

        const body = await testCase.runEmpty({
            retrieveAllMatches: reader,
            retrieveStoredPredictionIndex: retriever,
            logger,
        })

        assert.equal(body.matches.length, 0)
        assert.equal(reader.calls, 0)
        assert.equal(retriever.calls, 0)
        assert.equal(logger.calls.length, 0)
    })

    if (testCase.runNotFound) {
        test(`${testCase.name}: torneo inexistente (404) no lee ningún historial`, async () => {
            const reader = counting(async () => HISTORY)
            const retriever = createRetriever()
            const logger = createLogger()

            const error = await testCase.runNotFound({
                retrieveAllMatches: reader,
                retrieveStoredPredictionIndex: retriever,
                logger,
            })

            assert.equal(error.status, 404)
            assert.equal(error.code, NOT_FOUND)
            assert.equal(reader.calls, 0)
            assert.equal(retriever.calls, 0)
            assert.equal(logger.calls.length, 0)
        })
    }
}

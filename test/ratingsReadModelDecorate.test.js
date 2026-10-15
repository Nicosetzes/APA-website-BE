const assert = require("node:assert/strict")
const test = require("node:test")

const {
    collectRequiredEventIds,
    decorateMatchesWithPrediction,
} = require("../service/playerRatings/prediction")
const {
    createRetrieveStoredPredictionIndex,
} = require("../service/ratingsReadModel")
const {
    ANA,
    BETO,
    FINGERPRINT,
    NEWCOMER,
    fakeReadDaos,
    objectId,
    realTeamIds,
    storedDocsFrom,
    syntheticHistory,
} = require("./fixtures/ratingsReadModel")
const { match } = require("./fixtures/ratingsStore")

// Cableado de decorateMatchesWithPrediction con el índice guardado (etapa 2):
// camino guardado, fallback al cálculo en vivo, fail-soft y línea de log
// `rating_read_model`. Todo con fakes, sin base.

const HISTORY = syntheticHistory()
const REAL = realTeamIds()
const TOURNAMENT = { _id: "tournament", format: "world_cup" }

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

// Lector del historial en vivo que cuenta sus llamadas.
const createLiveReader = (history = HISTORY) => {
    const reader = async () => {
        reader.calls += 1
        return history
    }
    reader.calls = 0
    return reader
}

// Retriever guardado real (motor + adaptador + frescura) con DAOs en memoria.
const createRetriever = ({
    history = HISTORY,
    docs,
    sourceStats,
    calls,
} = {}) =>
    createRetrieveStoredPredictionIndex({
        ...fakeReadDaos({
            docs: docs ?? storedDocsFrom(history),
            sourceStats,
            calls,
        }),
        getCurrentFingerprint: () => FINGERPRINT,
    })

// Envuelve un retriever para registrar los argumentos con que lo llaman.
const spyOn = (retriever) => {
    const spy = async (args) => {
        spy.calls.push(args)
        return retriever(args)
    }
    spy.calls = []
    return spy
}

const pendingMatch = (n, playerP1, playerP2, extra = {}) =>
    match(n, playerP1, null, playerP2, null, "2026-03-01T15:00:00Z", {
        played: false,
        teamP1: REAL.teamA,
        teamP2: REAL.teamB,
        tournament: { id: REAL.tournamentId, name: "Torneo real" },
        ...extra,
    })

// Playoff de partido único ("advance") y liga ("outcomes"): jugados con evento
// guardado, un jugado sin goles (el motor no lo rate), pendientes (uno con un
// jugador sin historial) y uno con un lado vacío.
const buildCandidates = () => [
    HISTORY[4],
    HISTORY[9],
    HISTORY[14],
    HISTORY[0],
    match(50, ANA, null, BETO, null, "2026-02-10T15:00:00Z", {
        type: "playoff",
    }),
    pendingMatch(101, ANA, BETO, { type: "playoff" }),
    pendingMatch(102, BETO, NEWCOMER, { type: "regular" }),
    pendingMatch(103, ANA, BETO, { type: "playoff", teamP2: null }),
]

const nonNullPredictions = (decorated) =>
    decorated.filter((item) => item.prediction !== null).length

const decorateLive = (matches, extra = {}) =>
    decorateMatchesWithPrediction({
        matches,
        tournament: TOURNAMENT,
        retrieveAllMatches: createLiveReader(),
        logger: createLogger(),
        ...extra,
    })

const REQUIRED_IDS = [4, 9, 14, 0].map((position) =>
    String(HISTORY[position]._id)
)

test("collectRequiredEventIds devuelve solo los jugados rateables, sin duplicados", () => {
    const plain = [
        { ...HISTORY[0] },
        { ...HISTORY[0] },
        { ...HISTORY[1] },
        { ...HISTORY[2], played: false },
        { ...HISTORY[3], scoreP1: null, scoreP2: null },
        { ...HISTORY[4], valid: false },
        { ...HISTORY[5] },
    ]
    const kinds = [
        "outcomes",
        "outcomes",
        "advance",
        "outcomes",
        "outcomes",
        "outcomes",
        null,
    ]

    assert.deepEqual(collectRequiredEventIds(plain, kinds), [
        String(HISTORY[0]._id),
        String(HISTORY[1]._id),
    ])
    assert.deepEqual(collectRequiredEventIds([], []), [])
})

test("con el índice guardado fresco usa lo persistido y no lee el historial", async () => {
    const candidates = buildCandidates()
    const live = await decorateLive(candidates)
    const reader = createLiveReader()
    const retrieve = spyOn(createRetriever())
    const logger = createLogger()

    const stored = await decorateMatchesWithPrediction({
        matches: candidates,
        tournament: TOURNAMENT,
        retrieveAllMatches: reader,
        retrieveStoredIndex: retrieve,
        logger,
    })

    assert.deepEqual(stored, live)
    // Que no sea vacío: hay predicciones reales y también nulos.
    assert.ok(nonNullPredictions(stored) >= 5)
    assert.ok(stored.some((item) => item.prediction === null))
    assert.equal(reader.calls, 0)
    assert.equal(retrieve.calls.length, 1)
    assert.equal(logger.calls.length, 1)
    assert.equal(logger.calls[0].level, "info")
    assert.equal(logger.calls[0].fields.source, "stored")
    assert.equal(logger.calls[0].fields.reason, "ok")
})

test("el índice guardado se pide solo con los ids que exigen evento", async () => {
    const retrieve = spyOn(createRetriever())

    await decorateMatchesWithPrediction({
        matches: buildCandidates(),
        tournament: TOURNAMENT,
        retrieveAllMatches: createLiveReader(),
        retrieveStoredIndex: retrieve,
        logger: createLogger(),
    })

    // Ni los pendientes ni el jugado sin goles ni el de lado vacío pendiente.
    assert.deepEqual(retrieve.calls, [{ matchIds: REQUIRED_IDS }])
})

for (const reason of [
    "no_players",
    "version_mismatch",
    "inconsistent_players",
    "fingerprint_mismatch",
    "missing_source",
    "stale_count",
    "stale_updated_at",
    "missing_event",
]) {
    test(`stale ${reason}: cae al camino en vivo con el mismo resultado`, async () => {
        const candidates = buildCandidates()
        const live = await decorateLive(candidates)
        const reader = createLiveReader()
        const logger = createLogger()

        const decorated = await decorateMatchesWithPrediction({
            matches: candidates,
            tournament: TOURNAMENT,
            retrieveAllMatches: reader,
            retrieveStoredIndex: async () => ({ stale: reason }),
            logger,
        })

        assert.deepEqual(decorated, live)
        assert.equal(reader.calls, 1)
        assert.equal(logger.calls.length, 1)
        assert.equal(logger.calls[0].level, "info")
        assert.equal(logger.calls[0].event, "rating_read_model")
        assert.equal(logger.calls[0].fields.source, "live")
        assert.equal(logger.calls[0].fields.reason, reason)
        assert.equal(logger.calls[0].fields.matches, candidates.length)
    })
}

test("con el retriever real, un evento que falta es missing_event y cae a en vivo", async () => {
    const candidates = buildCandidates()
    const live = await decorateLive(candidates)
    const docs = storedDocsFrom(HISTORY)
    const missing = String(HISTORY[9]._id)
    docs.events = docs.events.filter(
        (event) => String(event.matchId) !== missing
    )
    const reader = createLiveReader()
    const logger = createLogger()

    const decorated = await decorateMatchesWithPrediction({
        matches: candidates,
        tournament: TOURNAMENT,
        retrieveAllMatches: reader,
        retrieveStoredIndex: createRetriever({ docs }),
        logger,
    })

    assert.deepEqual(decorated, live)
    assert.equal(reader.calls, 1)
    assert.equal(readModelLines(logger).length, 1)
    assert.equal(logger.calls[0].fields.source, "live")
    assert.equal(logger.calls[0].fields.reason, "missing_event")
})

test("si el retriever guardado lanza, cae a en vivo y avisa con warn sin el mensaje", async () => {
    const candidates = buildCandidates()
    const live = await decorateLive(candidates)
    const reader = createLiveReader()
    const logger = createLogger()

    const decorated = await decorateMatchesWithPrediction({
        matches: candidates,
        tournament: TOURNAMENT,
        retrieveAllMatches: reader,
        retrieveStoredIndex: async () => {
            throw new TypeError("secreto de la base 12345")
        },
        logger,
    })

    assert.deepEqual(decorated, live)
    assert.equal(reader.calls, 1)
    assert.equal(logger.calls.length, 1)
    const [{ level, event, fields }] = logger.calls
    assert.equal(level, "warn")
    assert.equal(event, "rating_read_model")
    assert.deepEqual(Object.keys(fields).sort(), [
        "durationMs",
        "errorName",
        "matches",
        "reason",
        "source",
    ])
    assert.equal(fields.source, "live")
    assert.equal(fields.reason, "error")
    assert.equal(fields.errorName, "TypeError")
    assert.ok(!JSON.stringify(fields).includes("secreto"))
})

test("una respuesta sin forma conocida del retriever se trata como error", async () => {
    const candidates = buildCandidates()
    const live = await decorateLive(candidates)

    for (const response of [undefined, null, {}, { index: {} }]) {
        const logger = createLogger()
        const decorated = await decorateMatchesWithPrediction({
            matches: candidates,
            tournament: TOURNAMENT,
            retrieveAllMatches: createLiveReader(),
            retrieveStoredIndex: async () => response,
            logger,
        })

        assert.deepEqual(decorated, live)
        assert.equal(logger.calls.length, 1)
        assert.equal(logger.calls[0].level, "warn")
        assert.equal(logger.calls[0].fields.reason, "error")
        assert.ok(logger.calls[0].fields.errorName)
    }
})

test("el interruptor apagado fuerza el camino en vivo sin leer lo guardado", async () => {
    const candidates = buildCandidates()
    const live = await decorateLive(candidates)
    const reader = createLiveReader()
    const retrieve = spyOn(createRetriever())
    const logger = createLogger()

    const decorated = await decorateMatchesWithPrediction({
        matches: candidates,
        tournament: TOURNAMENT,
        retrieveAllMatches: reader,
        retrieveStoredIndex: retrieve,
        readModelEnabled: () => false,
        logger,
    })

    assert.deepEqual(decorated, live)
    assert.equal(retrieve.calls.length, 0)
    assert.equal(reader.calls, 1)
    assert.equal(logger.calls.length, 1)
    assert.equal(logger.calls[0].fields.source, "live")
    assert.equal(logger.calls[0].fields.reason, "disabled")
})

test("sin readModelEnabled usa el interruptor por entorno (RATING_READ_MODEL)", async () => {
    const previous = process.env.RATING_READ_MODEL
    process.env.RATING_READ_MODEL = "off"
    try {
        const retrieve = spyOn(createRetriever())
        const logger = createLogger()

        await decorateMatchesWithPrediction({
            matches: buildCandidates(),
            tournament: TOURNAMENT,
            retrieveAllMatches: createLiveReader(),
            retrieveStoredIndex: retrieve,
            logger,
        })

        assert.equal(retrieve.calls.length, 0)
        assert.equal(logger.calls[0].fields.reason, "disabled")
    } finally {
        if (previous === undefined) delete process.env.RATING_READ_MODEL
        else process.env.RATING_READ_MODEL = previous
    }
})

test("las options inyectadas desactivan el camino guardado", async () => {
    const candidates = buildCandidates()
    const options = { teamStrength: null }
    const live = await decorateLive(candidates, { options })
    const reader = createLiveReader()
    const retrieve = spyOn(createRetriever())
    const logger = createLogger()

    const decorated = await decorateMatchesWithPrediction({
        matches: candidates,
        tournament: TOURNAMENT,
        retrieveAllMatches: reader,
        retrieveStoredIndex: retrieve,
        logger,
        options,
    })

    assert.deepEqual(decorated, live)
    assert.equal(retrieve.calls.length, 0)
    assert.equal(reader.calls, 1)
    assert.equal(logger.calls[0].fields.source, "live")
    assert.equal(logger.calls[0].fields.reason, "disabled")
})

test("unas options vacías no desactivan el camino guardado", async () => {
    const retrieve = spyOn(createRetriever())
    const logger = createLogger()

    await decorateMatchesWithPrediction({
        matches: buildCandidates(),
        tournament: TOURNAMENT,
        retrieveAllMatches: createLiveReader(),
        retrieveStoredIndex: retrieve,
        logger,
        options: {},
    })

    assert.equal(retrieve.calls.length, 1)
    assert.equal(logger.calls[0].fields.source, "stored")
})

test("fail-soft: stale y el lector en vivo lanza deja prediction null y registra ambos logs", async () => {
    const candidates = buildCandidates()
    const logger = createLogger()

    const decorated = await decorateMatchesWithPrediction({
        matches: candidates,
        tournament: TOURNAMENT,
        retrieveAllMatches: async () => {
            throw new Error("db caída")
        },
        retrieveStoredIndex: async () => ({ stale: "stale_count" }),
        logger,
    })

    assert.equal(decorated.length, candidates.length)
    assert.ok(decorated.every((item) => item.prediction === null))
    assert.deepEqual(
        decorated.map(({ prediction, ...rest }) => rest),
        candidates
    )
    assert.deepEqual(
        logger.calls.map((call) => call.event),
        ["match_predictions_unavailable", "rating_read_model"]
    )
    assert.equal(logger.calls[0].fields.message, "db caída")
    assert.equal(logger.calls[1].level, "info")
    assert.equal(logger.calls[1].fields.source, "live")
    assert.equal(logger.calls[1].fields.reason, "stale_count")
})

test("fail-soft con el retriever lanzando y el lector en vivo lanzando", async () => {
    const logger = createLogger()

    const decorated = await decorateMatchesWithPrediction({
        matches: buildCandidates(),
        tournament: TOURNAMENT,
        retrieveAllMatches: async () => {
            throw new Error("db caída")
        },
        retrieveStoredIndex: async () => {
            throw new RangeError("x")
        },
        logger,
    })

    assert.ok(decorated.every((item) => item.prediction === null))
    assert.deepEqual(
        logger.calls.map((call) => [call.level, call.event]),
        [
            ["warn", "match_predictions_unavailable"],
            ["warn", "rating_read_model"],
        ]
    )
    assert.equal(logger.calls[1].fields.reason, "error")
    assert.equal(logger.calls[1].fields.errorName, "RangeError")
})

test("las salidas tempranas no leen nada ni loguean", async () => {
    const cases = [
        { matches: [], tournament: TOURNAMENT },
        { matches: undefined, tournament: TOURNAMENT },
        {
            matches: [pendingMatch(201, ANA, BETO, { type: "playin" })],
            tournament: { _id: "champions", format: "champions_league" },
        },
        {
            matches: [
                pendingMatch(202, ANA, BETO, { type: "playoff", leg: 3 }),
            ],
            tournament: {
                _id: "two-legged",
                format: "playoff",
                playoffMode: "two_legged",
            },
        },
    ]

    for (const { matches, tournament } of cases) {
        const reader = createLiveReader()
        const retrieve = spyOn(createRetriever())
        const logger = createLogger()

        const decorated = await decorateMatchesWithPrediction({
            matches,
            tournament,
            retrieveAllMatches: reader,
            retrieveStoredIndex: retrieve,
            logger,
        })

        assert.equal(decorated.length, (matches || []).length)
        assert.ok(decorated.every((item) => item.prediction === null))
        assert.equal(reader.calls, 0)
        assert.equal(retrieve.calls.length, 0)
        assert.equal(logger.calls.length, 0)
    }
})

test("sin retrieveStoredIndex no hay línea rating_read_model y todo queda como antes", async () => {
    const candidates = buildCandidates()
    const reader = createLiveReader()
    const logger = createLogger()

    const decorated = await decorateMatchesWithPrediction({
        matches: candidates,
        tournament: TOURNAMENT,
        retrieveAllMatches: reader,
        logger,
    })

    assert.deepEqual(decorated, await decorateLive(candidates))
    assert.equal(reader.calls, 1)
    assert.equal(logger.calls.length, 0)

    const failing = createLogger()
    await decorateMatchesWithPrediction({
        matches: candidates,
        tournament: TOURNAMENT,
        retrieveAllMatches: async () => {
            throw new Error("boom")
        },
        logger: failing,
    })
    assert.deepEqual(
        failing.calls.map((call) => call.event),
        ["match_predictions_unavailable"]
    )
})

test("la línea de log trae exactamente source, reason, matches y durationMs, sin ids", async () => {
    const candidates = buildCandidates()
    const logger = createLogger()
    let now = 1000
    // Se llama dos veces: al empezar y al terminar.
    const clock = () => {
        now += 7
        return now
    }

    await decorateMatchesWithPrediction({
        matches: candidates,
        tournament: TOURNAMENT,
        retrieveAllMatches: createLiveReader(),
        retrieveStoredIndex: createRetriever(),
        logger,
        clock,
    })

    assert.equal(logger.calls.length, 1)
    const [{ level, event, fields }] = logger.calls
    assert.equal(level, "info")
    assert.equal(event, "rating_read_model")
    assert.deepEqual(fields, {
        source: "stored",
        reason: "ok",
        matches: candidates.length,
        durationMs: 7,
    })
    const serialized = JSON.stringify(logger.calls)
    for (const candidate of candidates) {
        assert.ok(!serialized.includes(String(candidate._id)))
    }
    assert.ok(!serialized.includes(String(objectId(5))))
})

test("durationMs es un entero no negativo con el reloj real", async () => {
    const logger = createLogger()

    await decorateMatchesWithPrediction({
        matches: buildCandidates(),
        tournament: TOURNAMENT,
        retrieveAllMatches: createLiveReader(),
        retrieveStoredIndex: createRetriever(),
        logger,
    })

    const { durationMs } = logger.calls[0].fields
    assert.ok(Number.isInteger(durationMs))
    assert.ok(durationMs >= 0)
})

test("un logger con solo warn no rompe el camino guardado ni el stale", async () => {
    const warnings = []
    const logger = { warn: (event) => warnings.push(event) }
    const candidates = buildCandidates()

    const stored = await decorateMatchesWithPrediction({
        matches: candidates,
        tournament: TOURNAMENT,
        retrieveAllMatches: createLiveReader(),
        retrieveStoredIndex: createRetriever(),
        logger,
    })
    const stale = await decorateMatchesWithPrediction({
        matches: candidates,
        tournament: TOURNAMENT,
        retrieveAllMatches: createLiveReader(),
        retrieveStoredIndex: async () => ({ stale: "stale_count" }),
        logger,
    })

    assert.deepEqual(stored, stale)
    assert.deepEqual(warnings, [])

    // En error sí usa warn.
    await decorateMatchesWithPrediction({
        matches: candidates,
        tournament: TOURNAMENT,
        retrieveAllMatches: createLiveReader(),
        retrieveStoredIndex: async () => {
            throw new Error("x")
        },
        logger,
    })
    assert.deepEqual(warnings, ["rating_read_model"])
})

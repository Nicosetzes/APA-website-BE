const assert = require("node:assert/strict")
const test = require("node:test")
const { DRAW_MODEL } = require("../config/drawModel")
const { expectedForMatch } = require("../service/playerRatings")
const {
    drawProbability,
    outcomeProbabilities,
    splitOutcomes,
} = require("../service/playerRatings/outcomes")
const {
    buildPredictionIndex,
    decorateMatchesWithPrediction,
    predictionKind,
    predictMatch,
    predictOutcomes,
} = require("../service/playerRatings/prediction")
const {
    createTeamStrengthLookup,
} = require("../service/playerRatings/teamStrength")

const thousandths = (value) => Math.round(value * 1000)
const close = (actual, expected, tolerance = 1e-9) =>
    assert.ok(
        Math.abs(actual - expected) < tolerance,
        `${actual} no es ${expected}`
    )

// E = 0,001 ... 0,999 de a 0,001 (en enteros para no acumular error de float).
const sweep = () =>
    Array.from({ length: 999 }, (_, position) => (position + 1) / 1000)

test("el modelo configurado es draw-1 con d0 0,22 y k 1", () => {
    assert.deepEqual(DRAW_MODEL, { version: "draw-1", d0: 0.22, k: 1 })
})

test("p1Win + draw + p2Win suma exactamente 1 en todo el rango de E", () => {
    for (const expected of sweep()) {
        const result = outcomeProbabilities(expected)
        assert.equal(
            thousandths(result.p1Win) +
                thousandths(result.draw) +
                thousandths(result.p2Win),
            1000,
            `E = ${expected}`
        )
        close(result.p1Win + result.draw + result.p2Win, 1, 1e-9)
    }
})

test("p1Win + draw/2 reproduce E con un error máximo de 0,001", () => {
    for (const expected of sweep()) {
        const { p1Win, draw } = outcomeProbabilities(expected)
        assert.ok(
            Math.abs(p1Win + draw / 2 - expected) <= 0.001 + 1e-12,
            `E = ${expected}`
        )
    }
})

test("ninguna probabilidad es negativa y todas tienen 3 decimales", () => {
    for (const expected of [0, ...sweep(), 1]) {
        const result = outcomeProbabilities(expected)
        for (const value of Object.values(result)) {
            assert.ok(value >= 0 && value <= 1, `E = ${expected}`)
            assert.equal(thousandths(value) / 1000, value)
        }
    }
    for (const expected of [0.99, 0.01, 0.001]) {
        const result = outcomeProbabilities(expected)
        assert.ok(result.p1Win >= 0 && result.p2Win >= 0 && result.draw >= 0)
    }
})

test("el empate se topa para no dejar una victoria negativa", () => {
    const flat = { d0: 0.22, k: 0 }

    assert.equal(drawProbability(0.01, flat), 0.02)
    assert.deepEqual(outcomeProbabilities(0.01, flat), {
        p1Win: 0,
        draw: 0.02,
        p2Win: 0.98,
    })
    assert.deepEqual(outcomeProbabilities(0.99, flat), {
        p1Win: 0.98,
        draw: 0.02,
        p2Win: 0,
    })
    // Sin tope aplicable, el empate es el del modelo.
    assert.equal(drawProbability(0.5, flat), 0.22)
})

test("splitOutcomes devuelve valores sin redondear que suman 1", () => {
    const { p1Win, draw, p2Win } = splitOutcomes(0.55)

    close(p1Win, 0.55 - 0.2178 / 2)
    close(draw, 0.2178)
    close(p2Win, 0.45 - 0.2178 / 2)
    close(p1Win + draw + p2Win, 1)
})

test("el resultado es simétrico al invertir los lados", () => {
    for (const expected of sweep()) {
        const direct = outcomeProbabilities(expected)
        const reversed = outcomeProbabilities(1 - expected)
        close(direct.p1Win, reversed.p2Win, 0.001 + 1e-12)
        close(direct.p2Win, reversed.p1Win, 0.001 + 1e-12)
        close(direct.draw, reversed.draw, 0.001 + 1e-12)
    }
})

test("valores de referencia dentro de 0,5 puntos porcentuales", () => {
    const references = [
        [0.55, 0.441, 0.218, 0.341],
        [0.6, 0.494, 0.211, 0.294],
        [0.7, 0.608, 0.185, 0.208],
        [0.8, 0.73, 0.141, 0.13],
        [0.9, 0.86, 0.079, 0.06],
    ]

    for (const [expected, p1Win, draw, p2Win] of references) {
        const result = outcomeProbabilities(expected)
        close(result.p1Win, p1Win, 0.005)
        close(result.draw, draw, 0.005)
        close(result.p2Win, p2Win, 0.005)
    }
})

test("con k = 0 el empate es constante", () => {
    for (const expected of [0.3, 0.5, 0.7, 0.85]) {
        assert.equal(
            outcomeProbabilities(expected, { d0: 0.2, k: 0 }).draw,
            0.2
        )
    }
})

test("E = 0,5 da empate 0,22 y victorias iguales", () => {
    assert.deepEqual(outcomeProbabilities(0.5), {
        p1Win: 0.39,
        draw: 0.22,
        p2Win: 0.39,
    })
})

test("un puntaje esperado inválido devuelve null", () => {
    for (const invalid of [NaN, Infinity, -0.1, 1.2, null, undefined, "0.5"]) {
        assert.equal(outcomeProbabilities(invalid), null, String(invalid))
    }
})

// --- Predicciones sobre el motor ---------------------------------------------

const NICO = { id: "n", name: "Nico" }
const SANTI = { id: "s", name: "Santi" }
const LEO = { id: "l", name: "Leo" }
const TEAM_A = { id: 1, name: "Equipo A" }
const TEAM_B = { id: 2, name: "Equipo B" }
const TOURNAMENT = { id: "x", name: "Torneo" }

const OPTIONS = {
    initialRating: 1500,
    kFactor: 20,
    marginWeight: 0,
    teamStrengthWeight: 25,
    provisionalMatches: 3,
}
const teamStrength = createTeamStrengthLookup({
    editionByTournament: { x: "FC26" },
    overallByTeamEdition: { "1|FC26": 85, "2|FC26": 75 },
})
const WITH_TEAMS = { ...OPTIONS, teamStrength }
const WITHOUT_TEAMS = { ...OPTIONS, teamStrength: null }

let sequence = 0
const match = (playerP1, scoreP1, playerP2, scoreP2, playedAt, extra = {}) => ({
    _id: `d${String((sequence += 1)).padStart(4, "0")}`,
    type: "regular",
    playerP1,
    scoreP1,
    playerP2,
    scoreP2,
    teamP1: TEAM_A,
    teamP2: TEAM_B,
    tournament: TOURNAMENT,
    played: true,
    playedAt: new Date(playedAt),
    ...extra,
})
const pending = (playerP1, playerP2, extra = {}) => ({
    _id: `d${String((sequence += 1)).padStart(4, "0")}`,
    type: "regular",
    playerP1,
    scoreP1: null,
    playerP2,
    scoreP2: null,
    teamP1: TEAM_A,
    teamP2: TEAM_B,
    tournament: TOURNAMENT,
    played: false,
    ...extra,
})

// Historia donde Nico gana siempre: su rating actual se aleja de cualquier "before".
const history = () => [
    match(NICO, 2, SANTI, 0, "2026-01-01"),
    match(NICO, 1, SANTI, 0, "2026-01-02"),
    match(SANTI, 0, NICO, 3, "2026-01-03"),
    match(NICO, 2, LEO, 1, "2026-01-04"),
    match(LEO, 1, SANTI, 1, "2026-01-05"),
    match(NICO, 1, LEO, 0, "2026-01-06"),
]

const OUTCOME_KEYS = [
    "kind",
    "p1Win",
    "draw",
    "p2Win",
    "basis",
    "teamAdjusted",
    "provisional",
    "ratingVersion",
    "drawModelVersion",
]

test("predictOutcomes de un partido jugado usa el evento del motor", () => {
    const matches = history()
    const played = matches[5]
    const index = buildPredictionIndex(matches, WITH_TEAMS)
    const event = index.eventsByMatchId.get(played._id)

    const prediction = predictOutcomes(played, index)

    assert.equal(prediction.basis, "pre_match")
    assert.ok(
        Math.abs(prediction.p1Win + prediction.draw / 2 - event.expectedP1) <=
            0.001
    )
    // El rating actual de Nico es otro: recalcular con él daría un valor distinto.
    const current = expectedForMatch({
        rating1: index.snapshot.get("n").rating,
        rating2: index.snapshot.get("l").rating,
        match: played,
        config: index.config,
        lookup: index.lookup,
    })
    assert.notEqual(
        outcomeProbabilities(current.expectedP1).p1Win,
        prediction.p1Win
    )
})

test("predictOutcomes de un partido por jugar usa los ratings actuales", () => {
    const index = buildPredictionIndex(history(), WITH_TEAMS)
    const upcoming = pending(NICO, SANTI)

    const prediction = predictOutcomes(upcoming, index)
    const expected = expectedForMatch({
        rating1: index.snapshot.get("n").rating,
        rating2: index.snapshot.get("s").rating,
        match: upcoming,
        config: index.config,
        lookup: teamStrength,
    }).expectedP1

    assert.equal(prediction.basis, "current")
    assert.equal(prediction.teamAdjusted, true)
    assert.deepEqual(
        {
            p1Win: prediction.p1Win,
            draw: prediction.draw,
            p2Win: prediction.p2Win,
        },
        outcomeProbabilities(expected)
    )
})

test("predictOutcomes expone exactamente las llaves esperadas y en orden", () => {
    const matches = history()
    const index = buildPredictionIndex(matches, WITHOUT_TEAMS)

    for (const candidate of [pending(NICO, SANTI), matches[5]]) {
        const prediction = predictOutcomes(candidate, index)
        assert.deepEqual(Object.keys(prediction), OUTCOME_KEYS)
        assert.equal(prediction.kind, "outcomes")
        assert.equal(prediction.drawModelVersion, "draw-1")
        assert.equal(prediction.ratingVersion, index.config.version)
        assert.equal(prediction.teamAdjusted, false)
        assert.equal(
            thousandths(prediction.p1Win) +
                thousandths(prediction.draw) +
                thousandths(prediction.p2Win),
            1000
        )
    }
})

test("predictOutcomes usa el modelo de empate recibido", () => {
    const index = buildPredictionIndex(history(), WITHOUT_TEAMS)
    const prediction = predictOutcomes(pending(NICO, SANTI), index, {
        version: "test-0",
        d0: 0.1,
        k: 0,
    })

    assert.equal(prediction.draw, 0.1)
    assert.equal(prediction.drawModelVersion, "test-0")
})

test("predictOutcomes devuelve null cuando no hay predicción posible", () => {
    const index = buildPredictionIndex(history(), WITH_TEAMS)

    assert.equal(predictOutcomes(pending(NICO, null), index), null)
    assert.equal(predictOutcomes(pending(null, SANTI), index), null)
    assert.equal(
        predictOutcomes(pending(NICO, SANTI, { teamP2: null }), index),
        null
    )
    assert.equal(
        predictOutcomes(pending(NICO, SANTI, { teamP1: null }), index),
        null
    )
    assert.equal(predictOutcomes(pending(NICO, NICO), index), null)
    assert.equal(
        predictOutcomes(pending(NICO, SANTI, { valid: false }), index),
        null
    )
    // SIM / W.O.: jugado pero inválido, sin evento.
    assert.equal(
        predictOutcomes(
            match(NICO, 3, SANTI, 0, "2026-03-01", { valid: false }),
            index
        ),
        null
    )
    // Jugado sin puntaje: el motor no lo calificó.
    assert.equal(
        predictOutcomes(match(NICO, null, SANTI, null, "2026-03-01"), index),
        null
    )
})

test("predictMatch conserva su forma: sin kind y con las mismas llaves", () => {
    const matches = history()
    const index = buildPredictionIndex(matches, WITH_TEAMS)

    for (const candidate of [pending(NICO, SANTI), matches[5]]) {
        const prediction = predictMatch(candidate, index)
        assert.deepEqual(Object.keys(prediction), [
            "p1",
            "p2",
            "basis",
            "teamAdjusted",
            "provisional",
            "ratingVersion",
        ])
        assert.equal(prediction.kind, undefined)
    }
})

test("predictionKind decide el tipo de predicción por partido y torneo", () => {
    const kind = (type, tournament, extra = {}) =>
        predictionKind({ match: { type, ...extra }, tournament })

    // Liga: se puede empatar en cualquier formato.
    for (const format of [
        "league",
        "champions_league",
        "world_cup_2026",
        "league_playin_playoff",
    ]) {
        assert.equal(kind("regular", { format }), "outcomes", format)
    }
    assert.equal(
        kind("regular", { format: "playoff", playoffMode: "two_legged" }),
        "outcomes"
    )

    // Champions: playoffs (ida y vuelta legacy, sin `leg`) con empate; play-in no.
    assert.equal(kind("playoff", { format: "champions_league" }), "outcomes")
    assert.equal(
        kind("playoff", { format: "champions_league" }, { leg: 2 }),
        "outcomes"
    )
    assert.equal(kind("playin", { format: "champions_league" }), null)

    // Playoff a dos piernas: ida y vuelta con empate; el desempate no.
    const twoLegged = { format: "playoff", playoffMode: "two_legged" }
    assert.equal(kind("playoff", twoLegged, { leg: 1 }), "outcomes")
    assert.equal(kind("playoff", twoLegged, { leg: 2 }), "outcomes")
    assert.equal(kind("playoff", twoLegged, { leg: 3 }), null)
    assert.equal(kind("playoff", twoLegged), null)
    assert.equal(kind("playin", twoLegged, { leg: 1 }), null)

    // Partido único: sin cambios.
    for (const tournament of [
        { format: "playoff" },
        { format: "playoff", playoffMode: "single" },
        { format: "world_cup" },
        { format: "world_cup_2026" },
        { format: "super_cup" },
        { format: "league_playin_playoff" },
    ]) {
        assert.equal(kind("playoff", tournament, { leg: 1 }), "advance")
        assert.equal(kind("playin", tournament), "advance")
    }
    assert.equal(kind(undefined, { format: "world_cup_2026" }), "advance")
})

const createLogger = () => {
    const calls = []
    return { calls, warn: (event, fields) => calls.push({ event, fields }) }
}
const countingReader = (matches) => {
    const counter = { reads: 0 }
    counter.read = async () => {
        counter.reads += 1
        return matches
    }
    return counter
}

test("decorateMatchesWithPrediction agrega outcomes a partidos de liga y conserva el resto", async () => {
    const all = history()
    const upcoming = pending(NICO, SANTI, { group: "A", extra: { a: 1 } })
    const played = all[5]
    const reader = countingReader(all)
    const logger = createLogger()

    const result = await decorateMatchesWithPrediction({
        matches: [played, upcoming],
        tournament: { _id: "t", format: "league" },
        retrieveAllMatches: reader.read,
        logger,
        options: WITH_TEAMS,
    })

    const { prediction: playedPrediction, ...playedRest } = result[0]
    const { prediction: upcomingPrediction, ...upcomingRest } = result[1]
    assert.deepEqual(playedRest, played)
    assert.deepEqual(upcomingRest, upcoming)
    assert.equal(playedPrediction.kind, "outcomes")
    assert.equal(playedPrediction.basis, "pre_match")
    assert.equal(upcomingPrediction.kind, "outcomes")
    assert.equal(upcomingPrediction.basis, "current")
    assert.equal(reader.reads, 1)
    assert.equal(logger.calls.length, 0)
})

test("decorateMatchesWithPrediction mezcla outcomes, advance y null en una lista", async () => {
    const reader = countingReader(history())
    const tournament = { _id: "t", format: "world_cup_2026" }

    const result = await decorateMatchesWithPrediction({
        matches: [
            pending(NICO, SANTI, { type: "regular" }),
            pending(NICO, LEO, { type: "playoff", playoff_id: 1 }),
            pending(NICO, NICO, { type: "regular" }),
        ],
        tournament,
        retrieveAllMatches: reader.read,
        logger: createLogger(),
        options: WITH_TEAMS,
    })

    assert.equal(result[0].prediction.kind, "outcomes")
    assert.deepEqual(Object.keys(result[1].prediction), [
        "p1",
        "p2",
        "basis",
        "teamAdjusted",
        "provisional",
        "ratingVersion",
    ])
    assert.equal(result[2].prediction, null)
    assert.equal(reader.reads, 1)
})

test("decorateMatchesWithPrediction lee una vez para playoffs de Champions", async () => {
    const reader = countingReader(history())

    const result = await decorateMatchesWithPrediction({
        matches: [
            pending(NICO, SANTI, { type: "playoff" }),
            pending(SANTI, LEO, { type: "playin" }),
        ],
        tournament: { _id: "t", format: "champions_league" },
        retrieveAllMatches: reader.read,
        logger: createLogger(),
        options: WITH_TEAMS,
    })

    assert.equal(result[0].prediction.kind, "outcomes")
    assert.equal(result[1].prediction, null)
    assert.equal(reader.reads, 1)
})

test("decorateMatchesWithPrediction no lee la base si ningún partido admite predicción", async () => {
    const logger = createLogger()

    for (const [tournament, matches] of [
        [
            { format: "playoff", playoffMode: "two_legged" },
            [pending(NICO, SANTI, { type: "playoff", leg: 3 })],
        ],
        [
            { format: "champions_league" },
            [pending(NICO, SANTI, { type: "playin" })],
        ],
        [{ format: "league" }, []],
    ]) {
        const reader = countingReader(history())
        const result = await decorateMatchesWithPrediction({
            matches,
            tournament,
            retrieveAllMatches: reader.read,
            logger,
        })
        assert.deepEqual(
            result.map((item) => item.prediction),
            matches.map(() => null)
        )
        assert.equal(reader.reads, 0)
    }
    assert.equal(logger.calls.length, 0)
})

test("decorateMatchesWithPrediction cae a null si la lectura falla", async () => {
    const logger = createLogger()
    const matches = [pending(NICO, SANTI), pending(SANTI, LEO)]

    const result = await decorateMatchesWithPrediction({
        matches,
        tournament: { _id: "t", format: "league" },
        retrieveAllMatches: async () => {
            throw new Error("db caída")
        },
        logger,
    })

    assert.deepEqual(
        result.map((item) => item.prediction),
        [null, null]
    )
    assert.deepEqual(
        result.map((item) => item._id),
        matches.map((item) => item._id)
    )
    assert.equal(logger.calls.length, 1)
    assert.equal(logger.calls[0].event, "match_predictions_unavailable")
    assert.equal(logger.calls[0].fields.tournamentId, "t")
    assert.equal(logger.calls[0].fields.message, "db caída")
})

test("decorateMatchesWithPrediction aplana documentos con toJSON", async () => {
    const upcoming = pending(NICO, SANTI)
    const document = {
        toJSON: () => ({ ...upcoming }),
        // Un spread de un documento real perdería estos campos.
        _doc: { ignored: true },
    }

    const result = await decorateMatchesWithPrediction({
        matches: [document],
        tournament: { format: "league" },
        retrieveAllMatches: async () => history(),
        logger: createLogger(),
        options: WITH_TEAMS,
    })

    assert.equal(result[0]._id, upcoming._id)
    assert.equal(result[0].toJSON, undefined)
    assert.equal(result[0]._doc, undefined)
    assert.equal(result[0].prediction.kind, "outcomes")
})
